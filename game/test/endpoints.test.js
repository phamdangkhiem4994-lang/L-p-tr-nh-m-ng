import test from 'node:test';
import assert from 'node:assert/strict';
import {backendOrigin,websocketURL} from '../client/endpoints.js';
test('Pages uses the configured Render backend while Render and localhost stay same-origin',()=>{
 const pages='https://phamdangkhiem4994-lang.github.io/L-p-tr-nh-m-ng/?room=ABC123';
 assert.equal(backendOrigin(pages,'https://truyen-net.onrender.com'),'https://truyen-net.onrender.com');
 assert.equal(websocketURL(backendOrigin(pages,'https://truyen-net.onrender.com')),'wss://truyen-net.onrender.com/ws');
 assert.equal(backendOrigin('http://localhost:3000/'),'http://localhost:3000');
 assert.equal(websocketURL('http://localhost:3000'),'ws://localhost:3000/ws');
 for(const bad of ['javascript:alert(1)','https://user:pass@example.com','https://example.com/path'])assert.throws(()=>backendOrigin(pages,bad));
});
