import test from 'node:test';
import assert from 'node:assert/strict';
import { invitedRoom, invitationURL, invitationQR } from '../client/invite.js';
test('invitation keeps the game path but excludes unrelated query and fragment',()=>{
 const url=invitationURL('https://example.com/game/?token=private#old','ABC123');
 assert.equal(url,'https://example.com/game/?room=ABC123');
 assert.equal(invitedRoom(url),'ABC123');
});
test('invite codes are normalized and invalid inputs are ignored',()=>{
 assert.equal(invitedRoom('https://example.com/?room=abc123'),'ABC123');
 for(const value of ['','123','XXXXXX','<svg>','ABC1234'])
  assert.equal(invitedRoom('https://example.com/?room='+encodeURIComponent(value)),null);
 assert.throws(()=>invitationURL('https://example.com/','invalid'));
});
test('QR is a local scalable SVG with a quiet margin and no remote resources',()=>{
 const svg=invitationQR('https://example.com/?room=ABC123');
 assert.match(svg,/<svg/); assert.match(svg,/viewBox=/); assert.match(svg,/<path/);
 assert.doesNotMatch(svg,/<script|<image|https:\/\/example/);
});
