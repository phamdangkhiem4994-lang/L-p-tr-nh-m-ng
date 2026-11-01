import test from 'node:test';
import assert from 'node:assert/strict';
import {SoundEffects,transitionSounds} from '../client/sound.js';
function audio(){
 const played=[];const param=()=>({setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 const ctx={state:'running',currentTime:0,destination:{},createGain:()=>({gain:param(),connect(){},disconnect(){}}),
 createOscillator:()=>({frequency:param(),connect(){},disconnect(){},start(at){played.push(at);},stop(){}})};
 return {ctx,played};
}
test('audio waits for a user unlock, respects mute, zero volume and hidden tabs',async()=>{
 const {ctx,played}=audio();let visible=true;const sound=new SoundEffects({createContext:()=>ctx,visible:()=>visible});
 assert.equal(sound.play('round'),false);await sound.unlock();assert.equal(sound.play('join'),true);assert.equal(played.length,2);
 sound.setEnabled(false);assert.equal(sound.play('submit'),false);sound.setEnabled(true);
 sound.setVolume(0);assert.equal(sound.play('submit'),false);sound.setVolume(.5);
 visible=false;assert.equal(sound.play('finish'),false);visible=true;assert.equal(sound.play('unknown'),false);
});
test('saved preferences survive reload; invalid data and blocked storage are harmless',()=>{
 let value;const storage={getItem:()=>value,setItem:(_,v)=>{value=v;}};
 const sound=new SoundEffects({storage});sound.setEnabled(false);sound.setVolume(.65);
 const restored=new SoundEffects({storage});assert.equal(restored.enabled,false);assert.equal(restored.volume,.65);
 value='bad json';assert.equal(new SoundEffects({storage}).volume,.35);
 value='{"volume":4,"enabled":false}';assert.equal(new SoundEffects({storage}).volume,1);
 const blocked=new SoundEffects({storage:{getItem(){throw Error();},setItem(){throw Error();}}});assert.doesNotThrow(()=>blocked.setVolume(.4));
});
test('countdown plays once per remaining second and only while a task is pending',()=>{
 const sound=new SoundEffects();const calls=[];sound.play=kind=>calls.push(kind);
 const s={gameId:'game',turnId:'round',phase:'drawing',task:{kind:'draw'},submitted:false};
 for(const n of [6,5,5,5,4,4,3,2,1,0])sound.countdown(s,n);
 assert.equal(calls.length,5);sound.countdown({...s,submitted:true},5);sound.countdown({...s,task:null},5);assert.equal(calls.length,5);
 sound.countdown({...s,turnId:'next'},5);assert.equal(calls.length,6);
});
test('initial/repeated snapshots and reconnect do not replay round or reveal sounds',()=>{
 const lobby={roomCode:'A',players:[{id:'1'}],phase:'lobby',gameId:null,turnId:null};
 assert.deepEqual(transitionSounds(null,lobby),[]);
 assert.deepEqual(transitionSounds(lobby,{...lobby,players:[{id:'1'},{id:'2'}]}),['join']);
 const playing={...lobby,phase:'writing',gameId:'G',turnId:'T'};
 assert.deepEqual(transitionSounds(lobby,playing),['round']);assert.deepEqual(transitionSounds(playing,{...playing}),[]);
 assert.deepEqual(transitionSounds(playing,{...playing,players:[{id:'1',online:true}]}),[]);
 const reveal={...playing,phase:'reveal',result:{revealCount:1,finished:false}};
 assert.deepEqual(transitionSounds(reveal,{...reveal}),[]);
 assert.deepEqual(transitionSounds(reveal,{...reveal,result:{revealCount:2,finished:false}}),['reveal']);
 assert.deepEqual(transitionSounds(reveal,{...reveal,result:{revealCount:9,finished:true}}),['finish']);
});
test('unsupported Web Audio cannot interrupt the game',async()=>{
 const sound=new SoundEffects({createContext:()=>{throw Error('unsupported');}});await sound.unlock();assert.equal(sound.play('round'),false);
});
