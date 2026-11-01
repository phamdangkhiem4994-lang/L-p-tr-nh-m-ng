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
test('three real clients play simultaneous chains and share a private step-by-step reveal',async t=>{
 const {url}=await launch(t);
 const a=(await post(url,'/api/rooms',{name:'A'})).data;
 const sessions=[a];for(const name of ['B','C'])sessions.push((await post(url,`/api/rooms/${a.roomCode}/join`,{name})).data);
 const peers=[];for(const session of sessions)peers.push(await connect(url,session));
 t.after(()=>peers.forEach(p=>p.ws.terminate()));
 await peers[0].snapshot(s=>s.players.length===3&&s.players.every(p=>p.online));
 peers[0].send({type:'game.start'});
 for(let round=0;round<3;round++) {
  const snapshots=await Promise.all(peers.map(p=>p.snapshot(s=>s.turnIndex===round&&s.task)));
  if(round===1){assert.equal(snapshots[1].task.text,'private-0');assert.equal(JSON.stringify(snapshots[2]).includes('private-0'),false);}
  for(let i=0;i<3;i++) {
   const s=snapshots[i];peers[i].send({type:'answer.submit',gameId:s.gameId,turnId:s.turnId,
    kind:round%2?'drawing':'text',...(round%2?{strokes}:{text:round===0?`private-${i}`:`guess-${i}`})});
  }
 }
 const reveal=await peers[0].snapshot(s=>s.phase==='reveal');assert.deepEqual(reveal.result.chains,[]);
 peers[1].send({type:'reveal.next',gameId:reveal.gameId,revealCount:0});
 await peers[1].wait(m=>m.type==='request.error');
 for(let k=0;k<9;k++) {
  peers[0].send({type:'reveal.next',gameId:reveal.gameId,revealCount:k});
  const opened=await Promise.all(peers.map(p=>p.snapshot(s=>s.result?.revealCount===k+1)));
  assert.deepEqual(opened[0].result,opened[1].result);assert.deepEqual(opened[1].result,opened[2].result);
  assert.equal(opened[0].result.chains.reduce((n,c)=>n+c.steps.length,0),k+1);
 }
 peers[0].send({type:'game.restart'});
 const restarted=await peers[1].snapshot(s=>s.phase==='writing'&&s.gameId!==reveal.gameId);
 const resumed=await connect(url,sessions[1]);peers.push(resumed);
 const state=await resumed.snapshot(s=>s.gameId===restarted.gameId);
 assert.equal(state.deadline,restarted.deadline);assert.equal(state.task.kind,'prompt');
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
