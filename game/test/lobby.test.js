import test from 'node:test';
import assert from 'node:assert/strict';
import { GameStore } from '../server/game.js';
const strokes=[{color:'#522d60',size:4,points:[{x:.4,y:.5}]}];
function room(n=3) {
 const store=new GameStore(),a=store.create('Host');const users=[a];
 for(let i=1;i<n;i++)users.push(store.join(a.roomCode,'P'+i));
 for(const p of users)store.setOnline(a.roomCode,p.playerId,true);
 const cmd=(i,m)=>store.command(a.roomCode,users[i].playerId,m);
 const snap=(i=0)=>store.snapshot(a.roomCode,users[i].playerId);
 return {store,a,users,cmd,snap};
}
test('only the lobby host may remove another player, including offline players',()=>{
 const g=room(4),target=g.users[3];g.store.setOnline(g.a.roomCode,target.playerId,false);
 assert.throws(()=>g.cmd(1,{type:'room.kick',playerId:target.playerId}));
 assert.throws(()=>g.cmd(0,{type:'room.kick',playerId:g.a.playerId}));
 assert.throws(()=>g.cmd(0,{type:'room.kick',playerId:'missing'}));
 g.cmd(0,{type:'room.kick',playerId:target.playerId});
 assert.equal(g.snap().players.length,3);assert.equal(g.store.authenticate(target.roomCode,target.playerId,target.token),false);
 assert.throws(()=>g.store.setOnline(target.roomCode,target.playerId,true));
 g.cmd(0,{type:'game.start'});
 assert.throws(()=>g.cmd(0,{type:'room.kick',playerId:g.users[1].playerId}));
});
test('host settings accept only integers 3–8 in lobby and are visible to everyone',()=>{
 const g=room();assert.equal(g.snap().settings.turns,3);
 assert.throws(()=>g.cmd(1,{type:'room.settings',turns:5}));
 for(const turns of [2,9,3.5,'5',null])assert.throws(()=>g.cmd(0,{type:'room.settings',turns}));
 g.cmd(0,{type:'room.settings',turns:8});assert.equal(g.snap(1).settings.turns,8);
 g.cmd(0,{type:'game.start'});assert.equal(g.snap().totalTurns,8);
 assert.throws(()=>g.cmd(0,{type:'room.settings',turns:3}));
});
test('every player completes 3–8 steps regardless of the player count; reveal never exposes future steps',()=>{
 for(const n of [3,4,8])for(let turns=3;turns<=8;turns++) {
  const g=room(n);g.cmd(0,{type:'room.settings',turns});g.cmd(0,{type:'game.start'});
  for(let round=0;round<turns;round++)for(let i=0;i<n;i++) {
   const s=g.snap(i);assert.equal(s.turnIndex,round);assert.equal(s.totalTurns,turns);
   if(round%2)assert.equal(s.task.text,`P${(i-1+n)%n}R${round-1}`);
   g.cmd(i,{type:'answer.submit',gameId:s.gameId,turnId:s.turnId,kind:round%2?'drawing':'text',...(round%2?{strokes}:{text:`P${i}R${round}`})});
  }
  assert.equal(g.snap().phase,'reveal');assert.equal(g.snap().result.totalSteps,n*turns);
  assert.throws(()=>g.cmd(0,{type:'room.lobby'}));
  for(let revealCount=0;revealCount<n*turns;revealCount++) {
   const s=g.snap();g.cmd(0,{type:'reveal.next',gameId:s.gameId,revealCount});
   const result=g.snap().result;assert.equal(result.chains.reduce((sum,c)=>sum+c.steps.length,0),revealCount+1);
   for(const chain of result.chains)assert.ok(chain.steps.length<=turns);
  }
  assert.equal(g.snap().result.finished,true);assert.equal(g.snap().result.chains.length,n);
  assert.throws(()=>g.cmd(1,{type:'room.lobby'}));g.cmd(0,{type:'room.lobby'});
  assert.equal(g.snap().phase,'lobby');assert.equal(g.snap().settings.turns,turns);
  g.cmd(0,{type:'room.settings',turns:4});g.cmd(0,{type:'game.start'});assert.equal(g.snap().totalTurns,4);
 }
});
