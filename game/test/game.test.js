import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore } from '../server/game.js';

const strokes = [{color:'#123456',size:4,points:[{x:0.2,y:0.3},{x:0.8,y:0.7}]}];
function setup(n=3) {
  let now=1000;
  const store=new GameStore({now:()=>now,chooseWord:()=> 'Mèo đi học'});
  const a=store.create('A');
  const sessions=[a];
  for(let i=1;i<n;i++)sessions.push(store.join(a.roomCode,String.fromCharCode(65+i)));
  for(const s of sessions)store.setOnline(s.roomCode,s.playerId,true);
  const snapshot=(i)=>store.snapshot(a.roomCode,sessions[i].playerId);
  const submit=(i,kind,extra={})=>{
    const s=snapshot(i);
    store.command(a.roomCode,sessions[i].playerId,{type:'answer.submit',gameId:s.gameId,turnId:s.turnId,kind,...extra});
  };
  return {store,sessions,a,snapshot,submit,setNow:v=>now=v};
}
test('three players relay A drawing -> B redraw -> C final guess, then rotate roles',()=>{
  const {store,a,sessions,snapshot,submit}=setup();
  store.command(a.roomCode,a.playerId,{type:'game.start'});
  assert.equal(snapshot(0).task.keyword,'Mèo đi học');
  assert.equal(snapshot(1).task,null);
  assert.equal(snapshot(2).result,undefined);
  submit(0,'drawing',{strokes});
  assert.equal(snapshot(1).task.kind,'redraw');
  assert.deepEqual(snapshot(1).task.referenceDrawing.strokes,strokes);
  assert.equal(snapshot(1).task.keyword,undefined);
  assert.equal(snapshot(0).task,null);
  submit(1,'drawing',{strokes});
  assert.equal(snapshot(2).phase,'guessing');
  assert.equal(snapshot(2).task.kind,'final_guess');
  assert.equal(snapshot(2).task.referenceDrawing.playerId,sessions[1].playerId);
  submit(2,'guess',{text:'Con mèo đi học'});
  const result=snapshot(0).result;
  assert.equal(result.keyword,'Mèo đi học');
  assert.equal(result.finalGuess,'Con mèo đi học');
  assert.deepEqual(result.drawings.map(x=>x.playerId),sessions.slice(0,2).map(x=>x.playerId));
  for(let round=1;round<=2;round++){
    store.command(a.roomCode,a.playerId,{type:'game.restart'});
    assert.equal(snapshot(round).task.kind,'first_draw');
    submit(round,'drawing',{strokes});submit((round+1)%3,'drawing',{strokes});submit((round+2)%3,'guess',{text:'Mèo'});
  }
});
test('4-8 people: only immediate predecessor reference, N-1 drawings, one final guess',()=>{
  for(let n=4;n<=8;n++){
    const {store,a,snapshot,submit,sessions}=setup(n);
    store.command(a.roomCode,a.playerId,{type:'game.start'});
    for(let i=0;i<n-1;i++){
      const own=snapshot(i);
      assert.equal(own.task.kind,i===0?'first_draw':'redraw');
      if(i)assert.equal(own.task.referenceDrawing.playerId,sessions[i-1].playerId);
      for(let j=0;j<n;j++)if(j!==i){assert.equal(snapshot(j).task,null);assert.equal(snapshot(j).result,undefined);}
      submit(i,'drawing',{strokes});
    }
    assert.equal(snapshot(n-1).task.kind,'final_guess');submit(n-1,'guess',{text:'X'});
    assert.equal(snapshot(0).result.drawings.length,n-1);
  }
});
test('permissions, wrong type, stale turn, duplicate and invalid drawings are rejected',()=>{
  const {store,a,sessions,snapshot,submit}=setup();
  assert.throws(()=>store.command(a.roomCode,sessions[1].playerId,{type:'game.start'}),/chủ phòng/i);
  store.command(a.roomCode,a.playerId,{type:'game.start'});
  assert.throws(()=>store.join(a.roomCode,'Late'),/đang chơi/i);
  assert.throws(()=>submit(1,'drawing',{strokes}),/lượt/i);
  assert.throws(()=>submit(0,'guess',{text:'X'}),/loại/i);
  assert.throws(()=>submit(0,'drawing',{strokes:[]}),/tranh/i);
  assert.throws(()=>submit(0,'drawing',{strokes:[{...strokes[0],points:[{x:NaN,y:0}]}]}),/tọa độ/i);
  const old=snapshot(0);
  submit(0,'drawing',{strokes});
  assert.throws(()=>store.command(a.roomCode,a.playerId,{type:'answer.submit',gameId:old.gameId,turnId:old.turnId,kind:'drawing',strokes}),/lượt/i);
  assert.equal(snapshot(1).task.kind,'redraw');
  assert.throws(()=>store.command(a.roomCode,a.playerId,{type:'game.restart'}),/kết thúc/i);
});
test('timeouts interrupt missing drawings, never skip predecessor; guess timeout reveals without answer',()=>{
  const first=setup();first.store.command(first.a.roomCode,first.a.playerId,{type:'game.start'});
  first.submit(0,'drawing',{strokes});first.setNow(61000);first.store.tick();
  assert.equal(first.snapshot(0).result.status,'interrupted');
  assert.equal(first.snapshot(0).result.drawings.length,1);
  assert.equal(first.snapshot(0).result.finalGuess,null);
  const last=setup();last.store.command(last.a.roomCode,last.a.playerId,{type:'game.start'});
  last.submit(0,'drawing',{strokes});last.submit(1,'drawing',{strokes});
  last.setNow(31000);assert.throws(()=>last.submit(2,'guess',{text:'late'}),/hết giờ/i);
  assert.equal(last.snapshot(0).result.status,'completed');assert.equal(last.snapshot(0).result.finalGuess,null);
});
test('minimum, offline players, host transfer, authentication and reconnect preserve deadline',()=>{
  const small=setup(2);assert.throws(()=>small.store.command(small.a.roomCode,small.a.playerId,{type:'game.start'}),/3/);
  const {store,a,sessions,snapshot}=setup();
  assert.equal(store.authenticate(a.roomCode,a.playerId,a.token),true);
  assert.equal(store.authenticate(a.roomCode,a.playerId,'bad'),false);
  store.setOnline(a.roomCode,sessions[1].playerId,false);
  assert.throws(()=>store.command(a.roomCode,a.playerId,{type:'game.start'}),/kết nối/i);
  store.setOnline(a.roomCode,sessions[1].playerId,true);
  store.command(a.roomCode,a.playerId,{type:'game.start'});const deadline=snapshot(0).deadline;
  store.setOnline(a.roomCode,a.playerId,false);store.setOnline(a.roomCode,a.playerId,true);
  assert.equal(snapshot(0).deadline,deadline);assert.equal(snapshot(0).task.keyword,'Mèo đi học');
  const lobby=setup();lobby.store.setOnline(lobby.a.roomCode,lobby.a.playerId,false);
  assert.equal(lobby.snapshot(1).hostId,lobby.sessions[1].playerId);
});
