import { randomBytes, randomUUID } from 'node:crypto';
import { chooseWord } from './words.js';

export class GameError extends Error {}
const fail = message => { throw new GameError(message); };
const active = room => room.phase === 'drawing' || room.phase === 'guessing';
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
  constructor({now = Date.now, chooseWord: wordPicker = chooseWord, drawMs = 60000, guessMs = 30000} = {}) {
    this.now = now; this.chooseWord = wordPicker; this.drawMs = drawMs; this.guessMs = guessMs;
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
    if (!active(room)) this.transferHost(room);
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
  command(code,id,message) {
    const room = this.room(code), player = room.players.find(p=>p.id===id);
    if (!player?.online) fail('Bạn chưa kết nối với phòng.');
    room.touched = this.now();
    if (message.type==='game.start' || message.type==='game.restart') {
      if (id!==room.hostId) fail('Chỉ chủ phòng được bắt đầu ván.');
      if (active(room)) fail('Hãy chờ ván hiện tại kết thúc.');
      if (room.players.length < 3) fail('Cần ít nhất 3 người để bắt đầu.');
      if (room.players.some(p=>!p.online)) fail('Hãy chờ tất cả người chơi kết nối lại.');
      let order = room.order.filter(pid=>room.players.some(p=>p.id===pid));
      order.push(...room.players.filter(p=>!order.includes(p.id)).map(p=>p.id));
      if (room.game) order.push(order.shift());
      room.order = order;
      room.game = {id:randomUUID(),keyword:this.chooseWord(),turnIndex:0,turnId:randomUUID(),
        deadline:this.now()+this.drawMs,drawings:[],finalGuess:null,status:null,reason:null};
      room.phase = 'drawing'; return;
    }
    if (message.type!=='answer.submit') fail('Lệnh không hợp lệ.');
    const game=room.game;
    if (!active(room) || !game || message.gameId!==game.id || message.turnId!==game.turnId)
      fail('Lượt đã kết thúc hoặc bài đã được nộp.');
    if (this.now()>=game.deadline) {this.expire(room);fail('Lượt đã hết giờ.');}
    if (room.order[game.turnIndex]!==id) fail('Chưa đến lượt của bạn.');
    if (room.phase==='drawing') {
      if (message.kind!=='drawing') fail('Sai loại bài: lượt này cần tranh vẽ.');
      const drawing={playerId:id,turnIndex:game.turnIndex,strokes:validateDrawing(message.strokes)};
      game.drawings.push(drawing);game.turnIndex++;game.turnId=randomUUID();
      room.phase = game.turnIndex === room.order.length-1 ? 'guessing' : 'drawing';
      game.deadline = this.now()+(room.phase==='drawing'?this.drawMs:this.guessMs);
    } else {
      if (message.kind!=='guess') fail('Sai loại bài: lượt này cần đáp án.');
      game.finalGuess=cleanText(message.text,160,'Đáp án');
      this.reveal(room,'completed',null);
    }
  }
  reveal(room,status,reason) {
    room.phase='reveal';room.game.status=status;room.game.reason=reason;room.game.deadline=0;
    room.touched=this.now();this.transferHost(room);
  }
  expire(room) {
    this.reveal(room,room.phase==='drawing'?'interrupted':'completed',
      room.phase==='drawing'?'Hết giờ vẽ, chưa có tranh để truyền tiếp.':'Không kịp đoán.');
  }
  tick() {
    const changed=[];
    for (const [code,room] of this.rooms) {
      if (active(room) && this.now()>=room.game.deadline) {this.expire(room);changed.push(code);}
      if (!active(room)) {
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
    const current=active(room)?room.order[game.turnIndex]:null;
    let task=null;
    if (current===id) task=game.turnIndex===0?{kind:'first_draw',keyword:game.keyword}:
      {kind:room.phase==='guessing'?'final_guess':'redraw',referenceDrawing:structuredClone(game.drawings.at(-1))};
    const snapshot={roomCode:room.code,players:room.players.map(({id,name,online})=>({id,name,online})),
      hostId:room.hostId,phase:room.phase,gameId:game?.id??null,orderedPlayerIds:[...room.order],
      activePlayerId:current,turnIndex:game?.turnIndex??0,totalTurns:room.order.length,deadline:game?.deadline??0,
      completedTurnCount:game?game.drawings.length+(game.finalGuess!==null?1:0):0,turnId:game?.turnId??null,task};
    if (room.phase==='reveal') {
      const next=room.order.filter(pid=>room.players.some(p=>p.id===pid));
      next.push(...room.players.filter(p=>!next.includes(p.id)).map(p=>p.id));
      if(next.length)next.push(next.shift());
      snapshot.result={keyword:game.keyword,drawings:structuredClone(game.drawings),finalGuess:game.finalGuess,
        guesserId:room.order.at(-1),status:game.status,reason:game.reason,nextPlayerIds:next};
    }
    return snapshot;
  }
}
