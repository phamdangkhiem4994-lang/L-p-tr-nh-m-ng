import test from 'node:test';
import assert from 'node:assert/strict';
import { results } from '../client/results.js';

const step=(kind,text,playerId='b')=>({kind,text,playerId,authorName:'Bạn B',strokes:[]});
function snapshot(chains,revealCount=1,finished=false){return {
 roomCode:'ABC123',players:[{id:'a',name:'A'},{id:'b',name:'B'}],hostId:'a',totalTurns:3,
 result:{chains,revealCount,totalSteps:6,totalChains:2,finished}
};}
test('reveal displays only the newest revealed person, not the previous text or drawings',()=>{
 const html=results(snapshot([{ownerId:'a',ownerName:'A',steps:[step('text','OLD SECRET'),step('drawing')]}],2),'a');
 assert.equal((html.match(/<figure /g)||[]).length,1);
 assert.equal((html.match(/<canvas /g)||[]).length,1);
 assert.ok(!html.includes('OLD SECRET'));
 assert.match(html,/data-chain="0" data-step="1"/);
 assert.match(html,/id="reveal-next"/);
});
test('next story replaces the previous story and uses its actual canvas indices',()=>{
 const html=results(snapshot([
  {ownerId:'a',ownerName:'Old owner',steps:[step('text','OLD'),step('drawing'),step('text','PAST ANSWER')]},
  {ownerId:'b',ownerName:'New owner',steps:[step('text','NEW'),step('drawing')]}
 ],5),'b');
 assert.equal((html.match(/<figure /g)||[]).length,1);
 assert.match(html,/data-chain="1" data-step="1"/);
 assert.match(html,/New owner/);
 assert.ok(!html.includes('Old owner')&&!html.includes('PAST ANSWER'));
 assert.ok(!html.includes('id="reveal-next"'));
});
test('final text stays focused with host restart actions, escaped content and no next button',()=>{
 const html=results(snapshot([{ownerId:'a',ownerName:'<Owner>',steps:[step('text','OLD'),step('drawing'),step('text','<img onerror=bad>')]}],6,true),'a');
 assert.match(html,/&lt;img onerror=bad&gt;/);
 assert.match(html,/&lt;Owner&gt;/);
 assert.ok(!html.includes('<img onerror=bad>'));
 assert.match(html,/id="restart"/);
 assert.ok(!html.includes('id="reveal-next"'));
 assert.equal((html.match(/<figure /g)||[]).length,1);
});
test('empty reveal and skipped step render valid focused states',()=>{
 const before=results(snapshot([],0),'a');assert.ok(!before.includes('<figure '));
 assert.match(before,/id="reveal-next"/);
 const skipped=results(snapshot([{ownerId:'a',steps:[{...step('drawing'),skipped:true}]}]),'a');
 assert.match(skipped,/Đã bỏ lỡ lượt này/);assert.ok(!skipped.includes('<canvas '));
});
