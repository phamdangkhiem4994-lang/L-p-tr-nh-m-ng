import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/http.js';

const strokes=[{color:'#663399',size:5,points:[{x:0.1,y:0.2},{x:0.6,y:0.7}]}];
async function launch(t,options={}) {
  const app=createGameServer(options);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  t.after(()=>app.close());return {app,url:`http://127.0.0.1:${app.server.address().port}`};
}
async function post(url,path,body) {
  const res=await fetch(url+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const data=await res.json();return {status:res.status,data};
}
async function connect(url,session) {
  const ws=new WebSocket(url.replace('http','ws')+'/ws');
  const messages=[];const waiters=new Set();
  ws.on('message',raw=>{const m=JSON.parse(raw);messages.push(m);for(const w of [...waiters])w(m);});
  await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
  const wait=(predicate)=>new Promise((resolve,reject)=>{
    const found=messages.find(predicate);if(found)return resolve(found);
    const timer=setTimeout(()=>{waiters.delete(onMessage);reject(new Error('Timed out waiting for message'));},3000);
    function onMessage(m){if(predicate(m)){clearTimeout(timer);waiters.delete(onMessage);resolve(m);}}
    waiters.add(onMessage);
  });
  ws.send(JSON.stringify({type:'session.attach',...session}));
  return {ws,messages,wait,send:m=>ws.send(JSON.stringify(m)),snapshot:predicate=>wait(m=>m.type==='room.snapshot'&&predicate(m.snapshot)).then(m=>m.snapshot)};
}
test('real HTTP + three WebSocket clients complete relay, protect private payloads, rotate and resume',async t=>{
  const {url}=await launch(t,{chooseWord:()=> 'Từ khóa riêng'});
  const a=(await post(url,'/api/rooms',{name:'Khiêm'})).data;
  const b=(await post(url,`/api/rooms/${a.roomCode}/join`,{name:'Bạn B'})).data;
  const c=(await post(url,`/api/rooms/${a.roomCode}/join`,{name:'Bạn C'})).data;
  const peers=[];for(const s of [a,b,c])peers.push(await connect(url,s));
  t.after(()=>peers.forEach(p=>p.ws.terminate()));
  await peers[0].snapshot(s=>s.players.length===3&&s.players.every(p=>p.online));
  peers[0].send({type:'game.start'});
  const first=await peers[0].snapshot(s=>s.task?.kind==='first_draw');
  const hidden=await peers[1].snapshot(s=>s.phase==='drawing');
  assert.equal(first.task.keyword,'Từ khóa riêng');assert.equal(hidden.task,null);
  assert.ok(!JSON.stringify(peers[1].messages).includes('Từ khóa riêng'));
  peers[0].send({type:'answer.submit',gameId:first.gameId,turnId:first.turnId,kind:'drawing',strokes});
  const second=await peers[1].snapshot(s=>s.task?.kind==='redraw');
  assert.deepEqual(second.task.referenceDrawing.strokes,strokes);
  peers[1].send({type:'answer.submit',gameId:second.gameId,turnId:second.turnId,kind:'drawing',strokes});
  const last=await peers[2].snapshot(s=>s.task?.kind==='final_guess');
  assert.equal(last.task.referenceDrawing.playerId,b.playerId);
  peers[2].send({type:'answer.submit',gameId:last.gameId,turnId:last.turnId,kind:'guess',text:'Đáp án của C'});
  const reveal=await peers[0].snapshot(s=>s.phase==='reveal');
  assert.equal(reveal.result.drawings.length,2);assert.equal(reveal.result.finalGuess,'Đáp án của C');
  peers[0].send({type:'game.restart'});
  const rotated=await peers[1].snapshot(s=>s.gameId!==first.gameId&&s.task?.kind==='first_draw');
  assert.equal(rotated.activePlayerId,b.playerId);
  const reconnect=await connect(url,b);peers.push(reconnect);
  const resumed=await reconnect.snapshot(s=>s.gameId===rotated.gameId&&s.task?.kind==='first_draw');
  assert.equal(resumed.deadline,rotated.deadline);
});
test('HTTP rejects unsafe inputs, protects server files and WebSocket auth',async t=>{
  const {url}=await launch(t);
  assert.equal((await post(url,'/api/rooms',{name:''})).status,400);
  assert.equal((await post(url,'/api/rooms/ABCDEF/join',{name:'A'})).status,400);
  assert.equal((await fetch(url+'/server/words.js')).status,404);
  assert.equal((await fetch(url+'/client/../../server/game.js')).status,404);
  const foreign=await fetch(url+'/api/rooms',{method:'POST',headers:{'content-type':'application/json',origin:'https://attacker.invalid'},body:'{"name":"X"}'});
  assert.equal(foreign.status,403);
  const bad=await connect(url,{roomCode:'MISSING',playerId:'x',token:'x'});t.after(()=>bad.ws.terminate());
  const error=await bad.wait(m=>m.type==='request.error');assert.match(error.error,/phiên/i);
  assert.equal(bad.messages.some(m=>m.type==='room.snapshot'),false);
});
