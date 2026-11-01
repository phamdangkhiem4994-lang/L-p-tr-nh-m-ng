import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore } from '../server/game.js';
const strokes=[{color:'#522d60',size:5,points:[{x:.2,y:.3}]}];
function setup(n=3) {
 let now=1000;const store=new GameStore({now:()=>now});const a=store.create('A');const sessions=[a];
 for(let i=1;i<n;i++)sessions.push(store.join(a.roomCode,String.fromCharCode(65+i)));
 for(const s of sessions)store.setOnline(s.roomCode,s.playerId,true);
 const snap=i=>store.snapshot(a.roomCode,sessions[i].playerId);
 const cmd=(i,m)=>store.command(a.roomCode,sessions[i].playerId,m);
 const submit=(i,extra={})=>{const s=snap(i);cmd(i,{type:'answer.submit',gameId:s.gameId,turnId:s.turnId,kind:s.phase==='drawing'?'drawing':'text',...(s.phase==='drawing'?{strokes}:{text:`câu-${i}-${s.turnIndex}`}),...extra});};
 cmd(0,{type:'room.settings',turns:n});cmd(0,{type:'game.start'});return {store,a,sessions,snap,cmd,submit,time:v=>now=v};
}
test('3–8 players each own a chain, alternate text/drawing and visit every chain once',()=>{
 for(let n=3;n<=8;n++) {
  const g=setup(n);
  for(let round=0;round<n;round++) {
   for(let i=0;i<n;i++){
    const s=g.snap(i);assert.equal(s.turnIndex,round);assert.equal(s.task.kind,round===0?'prompt':round%2?'draw':'guess');
    if(round%2)assert.equal(s.task.text,`câu-${(i-1+n)%n}-${round-1}`);
    else if(round)assert.deepEqual(s.task.referenceDrawing.strokes,strokes);
    g.submit(i);
    if(i<n-1){assert.equal(g.snap(i).submitted,true);assert.equal(g.snap(i).task,null);assert.equal(g.snap(i).turnIndex,round);}
   }
  }
  const room=g.store.room(g.a.roomCode);assert.equal(room.phase,'reveal');
  for(const c of room.game.chains){assert.equal(c.steps.length,n);assert.equal(new Set(c.steps.map(s=>s.playerId)).size,n);}
  assert.deepEqual(g.snap(0).result.chains,[]);
 }
});
test('only the predecessor reference is sent; reveal is host-controlled and incremental',()=>{
 const g=setup();g.submit(0,{text:'bí mật A'});
 assert.ok(!JSON.stringify(g.snap(1)).includes('bí mật A'));g.submit(1);g.submit(2);
 assert.equal(g.snap(1).task.text,'bí mật A');assert.ok(!JSON.stringify(g.snap(2)).includes('bí mật A'));
 for(let r=1;r<3;r++)for(let i=0;i<3;i++)g.submit(i);
 let s=g.snap(0);assert.equal(s.result.revealCount,0);
 assert.throws(()=>g.cmd(1,{type:'reveal.next',gameId:s.gameId,revealCount:0}));
 assert.throws(()=>g.cmd(0,{type:'game.restart'}));
 for(let k=0;k<9;k++) {
  g.cmd(0,{type:'reveal.next',gameId:s.gameId,revealCount:k});
  s=g.snap(0);assert.equal(s.result.chains.reduce((n,c)=>n+c.steps.length,0),k+1);
  assert.throws(()=>g.cmd(0,{type:'reveal.next',gameId:s.gameId,revealCount:k}));
 }
 assert.equal(s.result.finished,true);g.cmd(0,{type:'game.restart'});assert.equal(g.snap(0).phase,'writing');
});
test('wrong types, duplicate/stale submissions and invalid drawings are rejected',()=>{
 const g=setup();const first=g.snap(0);
 assert.throws(()=>g.submit(0,{kind:'drawing',strokes}));assert.throws(()=>g.submit(0,{text:' '}));
 g.submit(0);assert.throws(()=>g.submit(0));g.submit(1);g.submit(2);
 assert.throws(()=>g.submit(0,{turnId:first.turnId}));
 assert.throws(()=>g.submit(0,{strokes:[{color:'red',size:5,points:[]}]}));
 assert.equal(g.snap(0).submitted,false);
});
test('timeouts insert missing steps, preserve chains and allow later rounds',()=>{
 const g=setup();g.submit(0);g.time(g.snap(0).deadline);g.store.tick();
 assert.equal(g.snap(0).phase,'drawing');assert.equal(g.snap(0).task.referenceMissing,true);
 assert.equal(g.snap(1).task.referenceMissing,false);
 g.time(g.snap(0).deadline);g.store.tick();assert.equal(g.snap(0).phase,'guessing');
 assert.equal(g.snap(0).task.referenceMissing,true);g.time(g.snap(0).deadline);g.store.tick();
 assert.equal(g.snap(0).phase,'reveal');assert.equal(g.store.room(g.a.roomCode).game.chains.every(c=>c.steps.length===3),true);
});
test('reconnect preserves assignments and submissions; host transfers during reveal',()=>{
 const g=setup();g.submit(0);const before=g.snap(0);g.store.setOnline(g.a.roomCode,g.a.playerId,false);g.store.setOnline(g.a.roomCode,g.a.playerId,true);
 assert.equal(g.snap(0).deadline,before.deadline);assert.equal(g.snap(0).submitted,true);
 for(let i=1;i<3;i++)g.submit(i);for(let r=1;r<3;r++)for(let i=0;i<3;i++)g.submit(i);
 g.store.setOnline(g.a.roomCode,g.a.playerId,false);assert.equal(g.snap(1).hostId,g.sessions[1].playerId);
 g.cmd(1,{type:'reveal.next',gameId:g.snap(1).gameId,revealCount:0});g.store.leave(g.a.roomCode,g.a.playerId);
 assert.equal(g.snap(1).result.chains[0].ownerName,'A');assert.equal(g.snap(1).result.chains[0].steps[0].authorName,'A');
});
test('minimum players, active join, unauthenticated command and expired rooms',()=>{
 const store=new GameStore();const a=store.create('A');store.setOnline(a.roomCode,a.playerId,true);
 assert.throws(()=>store.command(a.roomCode,a.playerId,{type:'game.start'}));
 const g=setup();assert.throws(()=>g.store.join(g.a.roomCode,'Late'));
 assert.equal(g.store.authenticate(g.a.roomCode,g.a.playerId,'wrong'),false);
 g.store.setOnline(g.a.roomCode,g.a.playerId,false);assert.throws(()=>g.submit(0));
});
