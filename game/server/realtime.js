import { WebSocketServer, WebSocket } from 'ws';
import { GameError } from './game.js';

export function attachRealtime(server,store,{sameOrigin}) {
  const wss=new WebSocketServer({noServer:true,maxPayload:1024*1024});
  const sessions=new Map();
  const key=(code,id)=>`${code}:${id}`;
  function send(ws,message) {
    if (ws.readyState!==WebSocket.OPEN)return;
    if (ws.bufferedAmount>2*1024*1024) {ws.terminate();return;}
    ws.send(JSON.stringify(message));
  }
  function broadcast(code) {
    for (const ws of wss.clients) if(ws.identity?.roomCode===code) {
      try {send(ws,{type:'room.snapshot',snapshot:store.snapshot(code,ws.identity.playerId)});}
      catch {send(ws,{type:'request.error',error:'Phòng hoặc phiên đã hết hạn.'});ws.close(4001);}
    }
  }
  server.on('upgrade',(request,socket,head)=>{
    if(request.url!=='/ws' || !sameOrigin(request)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
    }
    wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));
  });
  wss.on('connection',ws=>{
    ws.alive=true;ws.bucket={start:Date.now(),count:0};
    const authTimeout=setTimeout(()=>ws.close(4001,'Authentication required'),5000);
    ws.on('pong',()=>{ws.alive=true;});
    ws.on('error',()=>{});
    ws.on('message',raw=>{
      let code=ws.identity?.roomCode;
      try {
        const now=Date.now();
        if(now-ws.bucket.start>=10000)ws.bucket={start:now,count:0};
        if(++ws.bucket.count>50) {ws.close(4008,'Too many requests');return;}
        let message;
        try {message=JSON.parse(raw.toString());} catch {throw new GameError('Dữ liệu JSON không hợp lệ.');}
        if(!message || typeof message!=='object' || Array.isArray(message))throw new GameError('Lệnh không hợp lệ.');
        if(!ws.identity) {
          if(message.type!=='session.attach' || !store.authenticate(message.roomCode,message.playerId,message.token)) {
            send(ws,{type:'request.error',error:'Phiên không hợp lệ hoặc phòng đã hết hạn.'});ws.close(4001);return;
          }
          clearTimeout(authTimeout);
          code=String(message.roomCode).toUpperCase();
          ws.identity={roomCode:code,playerId:message.playerId};
          const old=sessions.get(key(code,message.playerId));
          sessions.set(key(code,message.playerId),ws);if(old)old.close(4002,'Session resumed elsewhere');
          store.setOnline(code,message.playerId,true);
          send(ws,{type:'session.ready',playerId:message.playerId});broadcast(code);return;
        }
        if(message.type==='session.leave') {
          store.leave(code,ws.identity.playerId);sessions.delete(key(code,ws.identity.playerId));
          ws.identity=null;ws.close(1000);broadcast(code);return;
        }
        if(sessions.get(key(code,ws.identity.playerId))!==ws)throw new GameError('Phiên này đã được mở ở nơi khác.');
        store.command(code,ws.identity.playerId,message);broadcast(code);
      } catch(error) {
        if(!(error instanceof GameError))console.error('Game request failed:',error);
        send(ws,{type:'request.error',error:error instanceof GameError?error.message:'Server gặp lỗi, vui lòng thử lại.'});
        if(code)broadcast(code);
      }
    });
    ws.on('close',()=>{
      clearTimeout(authTimeout);const identity=ws.identity;
      if(!identity || sessions.get(key(identity.roomCode,identity.playerId))!==ws)return;
      sessions.delete(key(identity.roomCode,identity.playerId));
      try {store.setOnline(identity.roomCode,identity.playerId,false);broadcast(identity.roomCode);} catch {}
    });
  });
  const clock=setInterval(()=>{for(const code of store.tick())broadcast(code);},250);
  const heartbeat=setInterval(()=>{
    for(const ws of wss.clients) {if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}
  },30000);
  clock.unref();heartbeat.unref();
  return {broadcast,close(){clearInterval(clock);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();wss.close();}};
}
