import { randomBytes, randomUUID } from 'node:crypto';

export class GameError extends Error {}
const fail = message => { throw new GameError(message); };
const active = room => ['writing','drawing','guessing'].includes(room.phase);
const cleanText = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > max)
    fail(`${label} cần từ 1 đến ${max} ký tự.`);
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ');
};

export function validateDrawing(strokes) {
  if (!Array.isArray(strokes) || !strokes.length || strokes.length > 1000)
    fail('Tranh cần có nét vẽ, tối đa 1000 nét.');
  let count = 0;
  return strokes.map(s => {
    if (!s || !/^#[0-9a-f]{6}$/i.test(s.color) || !Number.isFinite(s.size) || s.size < 1 || s.size > 30 ||
        !Array.isArray(s.points) || !s.points.length) fail('Nét vẽ không hợp lệ.');
    count += s.points.length;
    if (count > 15000) fail('Tranh quá nhiều điểm, hãy giảm số nét.');
    return { color: s.color, size: s.size, points: s.points.map(p => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)
        fail('Tọa độ tranh không hợp lệ.');
      return { x: p.x, y: p.y };
    }) };
  });
}

export class GameStore {
  constructor({now = Date.now, drawMs = 60000, guessMs = 30000, writeMs = 30000} = {}) {
    Object.assign(this, {now, drawMs, guessMs, writeMs});
    this.rooms = new Map();
  }
  room(code) {
    const room = this.rooms.get(String(code).toUpperCase());
    if (!room) fail('Không tìm thấy phòng hoặc phòng đã hết hạn.');
    return room;
  }
  create(name) {
    cleanText(name,24,'Tên');
    if (this.rooms.size >= 200) fail('Server đã đầy phòng. Vui lòng thử lại sau.');
    let code;
    do { code = randomBytes(3).toString('hex').toUpperCase(); } while (this.rooms.has(code));
    this.rooms.set(code,{code,players:[],hostId:null,phase:'lobby',order:[],game:null,touched:this.now()});
    return this.join(code,name);
  }
  join(code,name) {
    const room = this.room(code);
    if (active(room)) fail('Phòng đang chơi, hãy chờ kết thúc ván.');
    if (room.players.length >= 8) fail('Phòng đã đủ 8 người.');
    const player = {id:randomUUID(),name:cleanText(name,24,'Tên'),token:randomBytes(32).toString('hex'),online:false,disconnectedAt:this.now()};
    room.players.push(player); room.hostId ??= player.id; room.touched = this.now();
    return {roomCode:room.code,playerId:player.id,token:player.token};
  }
  authenticate(code,id,token) {
    const player = this.rooms.get(String(code).toUpperCase())?.players.find(p=>p.id===id);
    return Boolean(player && typeof token==='string' && player.token===token);
  }
  setOnline(code,id,online) {
    const room = this.room(code), player = room.players.find(p=>p.id===id);
    if (!player) fail('Phiên người chơi không còn trong phòng.');
    player.online = online;
    player.disconnectedAt = online ? null : this.now();
    room.touched = this.now();
    this.transferHost(room);
  }
  transferHost(room) {
    if (!room.players.some(p=>p.id===room.hostId && p.online))
      room.hostId = room.players.find(p=>p.online)?.id ?? room.players[0]?.id ?? null;
  }
  leave(code,id) {
    const room=this.room(code);
    if (active(room)) {this.setOnline(code,id,false); return;}
    room.players=room.players.filter(p=>p.id!==id);
    this.transferHost(room);
    room.touched=this.now();
  }
  chainFor(room, id) {
    const index = room.order.indexOf(id), count = room.order.length;
    if (index < 0) fail('Bạn không tham gia ván này.');
    return room.game.chains[(index - room.game.round + count) % count];
  }
  command(code,id,message) {
    const room = this.room(code), player = room.players.find(p=>p.id===id);
    if (!player?.online) fail('Bạn chưa kết nối với phòng.');
    room.touched = this.now();
    if (message.type==='game.start' || message.type==='game.restart') {
      if (id!==room.hostId) fail('Chỉ chủ phòng được bắt đầu ván.');
      if (active(room)) fail('Hãy chờ ván hiện tại kết thúc.');
      if (room.phase==='reveal' && room.game.revealCount < room.order.length ** 2)
        fail('Hãy công bố hết các chuỗi trước khi mở ván mới.');
      if (room.players.length < 3) fail('Cần ít nhất 3 người để bắt đầu.');
      if (room.players.some(p=>!p.online)) fail('Hãy chờ tất cả người chơi kết nối lại.');
      room.order = room.players.map(p=>p.id);
      room.game = {id:randomUUID(),round:0,turnId:randomUUID(),deadline:this.now()+this.writeMs,
        chains:room.order.map(ownerId=>({ownerId,ownerName:room.players.find(p=>p.id===ownerId).name,steps:[]})),revealCount:0};
      room.phase = 'writing'; return;
    }
    const game = room.game;
    if (message.type==='reveal.next') {
      if (id!==room.hostId) fail('Chỉ chủ phòng được công bố kết quả.');
      if (room.phase!=='reveal' || message.gameId!==game?.id || message.revealCount!==game.revealCount)
        fail('Bước công bố đã thay đổi.');
      if (game.revealCount>=room.order.length ** 2) fail('Đã công bố hết các chuỗi.');
      game.revealCount++; return;
    }
    if (message.type!=='answer.submit') fail('Lệnh không hợp lệ.');
    if (!active(room) || !game || message.gameId!==game.id || message.turnId!==game.turnId)
      fail('Vòng đã kết thúc hoặc bài đã được nộp.');
    if (this.now()>=game.deadline) {this.expire(room);fail('Vòng đã hết giờ.');}
    const chain = this.chainFor(room,id);
    if (chain.steps[game.round]) fail('Bạn đã nộp bài ở vòng này.');
    const kind = room.phase==='drawing' ? 'drawing' : 'text';
    if (message.kind!==kind) fail(kind==='drawing'?'Vòng này cần tranh vẽ.':'Vòng này cần một câu bằng chữ.');
    chain.steps.push({playerId:id,authorName:player.name,kind,round:game.round,skipped:false,
      ...(kind==='drawing'?{strokes:validateDrawing(message.strokes)}:{text:cleanText(message.text,160,'Câu mô tả')})});
    if (game.chains.every(c=>c.steps.length>game.round)) this.advance(room);
  }
  advance(room) {
    const game = room.game;
    if (game.round===room.order.length-1) {
      room.phase='reveal'; game.deadline=0; game.revealCount=0;
      this.transferHost(room); return;
    }
    game.round++; game.turnId=randomUUID();
    room.phase=game.round%2?'drawing':'guessing';
    game.deadline=this.now()+(room.phase==='drawing'?this.drawMs:this.guessMs);
  }
  expire(room) {
    const game=room.game, kind=room.phase==='drawing'?'drawing':'text';
    for (const id of room.order) {
      const chain=this.chainFor(room,id);
      if (!chain.steps[game.round]) chain.steps.push({playerId:id,authorName:room.players.find(p=>p.id===id)?.name,kind,round:game.round,skipped:true});
    }
    this.advance(room); room.touched=this.now();
  }
  tick() {
    const changed=[];
    for (const [code,room] of this.rooms) {
      if (active(room) && this.now()>=room.game.deadline) {this.expire(room);changed.push(code);}
      // Keep the cast while revealing so author names and host controls survive reconnects.
      if (room.phase==='lobby') {
        const before=room.players.length;
        room.players=room.players.filter(p=>p.online || this.now()-(p.disconnectedAt??this.now())<120000);
        if (room.players.length!==before) {this.transferHost(room);changed.push(code);}
      }
      if (!room.players.some(p=>p.online) && this.now()-room.touched>1800000) this.rooms.delete(code);
    }
    return changed;
  }
  snapshot(code,id) {
    const room=this.room(code), game=room.game;
    if (!room.players.some(p=>p.id===id)) fail('Bạn không ở trong phòng.');
    let task=null,submitted=false;
    if (active(room) && room.order.includes(id)) {
      const chain=this.chainFor(room,id); submitted=Boolean(chain.steps[game.round]);
      if (!submitted) {
        const previous=chain.steps[game.round-1];
        task=game.round===0?{kind:'prompt'}:room.phase==='drawing'
          ?{kind:'draw',text:previous?.text??null,referenceMissing:Boolean(previous?.skipped)}
          :{kind:'guess',referenceDrawing:previous?.skipped?null:{strokes:structuredClone(previous.strokes)},referenceMissing:Boolean(previous?.skipped)};
      }
    }
    const snapshot={roomCode:room.code,players:room.players.map(({id,name,online})=>({id,name,online})),
      hostId:room.hostId,phase:room.phase,gameId:game?.id??null,orderedPlayerIds:[...room.order],
      turnIndex:game?.round??0,totalTurns:room.order.length,deadline:game?.deadline??0,
      turnId:game?.turnId??null,submitted,task,
      submittedPlayerIds:active(room)?room.order.filter(pid=>this.chainFor(room,pid).steps[game.round]):[]};
    if (room.phase==='reveal') {
      const count=room.order.length;
      snapshot.result={revealCount:game.revealCount,totalSteps:count*count,totalChains:count,
        finished:game.revealCount===count*count,
        chains:game.chains.map((chain,index)=>({ownerId:chain.ownerId,ownerName:chain.ownerName,
          steps:structuredClone(chain.steps.slice(0,Math.max(0,Math.min(count,game.revealCount-index*count))))}))
          .filter(chain=>chain.steps.length)};
    }
    return snapshot;
  }
}
