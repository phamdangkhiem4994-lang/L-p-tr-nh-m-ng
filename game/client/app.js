import { invitedRoom, mountInvite } from './invite.js';
import { Connection, enterRoom, readSession, saveSession } from './network.js';
import { DrawingPad, observeDrawing } from './canvas.js';
import { landing, lobby, game } from './views.js';
import { results, mountResults } from './results.js';

const root=document.querySelector('#app');
const notice=document.querySelector('#notice');
const connectionStatus=document.querySelector('#connection');
const leaveButton=document.querySelector('#leave');
let session=readSession(),connection=null,snapshot=null,currentKey='',pad=null,cleanups=[],pending=false;
let connected=false,toastTimer=null;
const drafts=new Map();
const inviteCode=invitedRoom(location.href);
function toast(message) {
  notice.textContent=message;notice.hidden=false;clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{notice.hidden=true;},6000);
}
function cleanup() {pad?.destroy();pad=null;cleanups.forEach(fn=>fn());cleanups=[];}
function send(message) {
  try {if(!connected)throw new Error('Đang kết nối lại, vui lòng chờ.');connection.send(message);return true;}
  catch(error){toast(error.message);return false;}
}
function reset() {
  connection?.close();connection=null;session=null;snapshot=null;currentKey='';connected=false;
  drafts.clear();saveSession(null);cleanup();showLanding();
}
function showLanding() {
  root.innerHTML=landing();leaveButton.hidden=true;connectionStatus.textContent='Vẽ tiếp, vui thêm.';
  const name=root.querySelector('#name'),code=root.querySelector('#code');
  name.maxLength=24;code.maxLength=6;
  if(inviteCode){code.value=inviteCode;root.querySelector('#create').textContent='Vào phòng được mời →';name.focus();}
  const form=root.querySelector('#entry-form');
  const submit=async join=>{
    if(!name.reportValidity())return;
    const roomCode=join?code.value.trim().toUpperCase():'';
    if(join&&!/^[A-F0-9]{6}$/.test(roomCode)){toast('Nhập mã phòng gồm 6 ký tự.');code.focus();return;}
    const buttons=form.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
    try {session=await enterRoom(name.value.trim(),roomCode);saveSession(session);connect();}
    catch(error){toast(error.message);buttons.forEach(b=>b.disabled=false);}
  };
  form.addEventListener('submit',event=>{event.preventDefault();submit(Boolean(inviteCode));});
  root.querySelector('#join').addEventListener('click',()=>submit(true));
  code.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submit(true);}});
}
function connect() {
  leaveButton.hidden=false;
  connection?.close();
  connection=new Connection(session,message=>{
    if(message.type==='room.snapshot')receive(message.snapshot);
    else if(message.type==='request.error') {pending=false;if(pad)pad.locked=false;updateControls();toast(message.error);}
  },status=>{
    connected=status==='online';
    const labels={online:'● Đã kết nối',connecting:'Đang kết nối…',reconnecting:'Đang kết nối lại…',expired:'Phiên đã hết hạn',displaced:'Phiên đang mở ở cửa sổ khác'};
    connectionStatus.textContent=labels[status]??status;
    connectionStatus.classList.toggle('online',connected);
    if(status==='expired'||status==='displaced') {
      const text=status==='expired'?'Phòng hoặc phiên đã hết hạn. Hãy vào phòng lại.':'Phiên đã mở ở cửa sổ khác. Mỗi người dùng một tab riêng nhé.';
      reset();toast(text);
    } else updateControls();
  });
}
function receive(next) {
  const key=`${next.phase}:${next.gameId}:${next.turnId}:${next.task?.kind??'waiting'}`;
  const changed=key!==currentKey;
  if(snapshot && snapshot.gameId!==next.gameId)drafts.clear();
  snapshot=next;
  if(changed){pending=false;currentKey=key;}
  // Preserve the live canvas and typed answer when another player reconnects.
  if(changed||next.phase==='lobby'||next.phase==='reveal'||!next.task)render();
  updateControls();updateClock();
}
function render() {
  cleanup();
  root.innerHTML=snapshot.phase==='lobby'?lobby(snapshot,session.playerId):snapshot.phase==='reveal'?results(snapshot,session.playerId):game(snapshot,session.playerId);
  root.querySelector('#copy-code')?.addEventListener('click',async()=>{
    try {await navigator.clipboard.writeText(snapshot.roomCode);toast('Đã sao chép mã phòng.');}
    catch {toast(`Mã phòng: ${snapshot.roomCode}`);}
  });
  mountInvite(root,snapshot.roomCode,toast);
  root.querySelector('#start')?.addEventListener('click',()=>send({type:'game.start'}));
  root.querySelector('#restart')?.addEventListener('click',()=>send({type:'game.restart'}));
  if(snapshot.phase==='reveal'){cleanups.push(mountResults(root,snapshot));return;}
  const task=snapshot.task;
  if(!task)return;
  if(task.referenceDrawing)cleanups.push(observeDrawing(root.querySelector('#reference'),task.referenceDrawing.strokes));
  const drawing=root.querySelector('#drawing');
  if(drawing) {
    const key=`${snapshot.gameId}:${snapshot.turnId}`;
    if(!drafts.has(key))drafts.set(key,[]);
    pad=new DrawingPad(drawing,drafts.get(key),()=>updateControls());
    root.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',()=>{
      if(pending)return;
      pad.selectColor(button.dataset.color);
      root.querySelectorAll('[data-color]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});
      root.querySelector('#eraser').setAttribute('aria-pressed','false');
    }));
    root.querySelector('#brush-size').addEventListener('input',event=>{pad.size=Number(event.target.value);root.querySelector('#brush-value').value=pad.size;});
    root.querySelector('#eraser').addEventListener('click',()=>{
      if(pending)return;
      pad.toggleEraser();
      root.querySelector('#eraser').setAttribute('aria-pressed',String(pad.color==='#ffffff'));
      root.querySelectorAll('[data-color]').forEach(b=>{const selected=b.dataset.color===pad.color;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    });
    root.querySelector('#undo').addEventListener('click',()=>pad.undo());
    root.querySelector('#redo').addEventListener('click',()=>pad.redo());
    const shortcuts=event=>{
      if(!(event.ctrlKey||event.metaKey)||event.altKey||event.target.closest('input,textarea,select,[contenteditable]'))return;
      const key=event.key.toLowerCase();
      if(key!=='z'&&key!=='y')return;
      event.preventDefault();
      if(key==='y'||event.shiftKey)pad.redo();else pad.undo();
    };
    document.addEventListener('keydown',shortcuts);
    cleanups.push(()=>document.removeEventListener('keydown',shortcuts));
    root.querySelector('#clear').addEventListener('click',()=>{if(!pending&&confirm('Xóa toàn bộ nét vẽ ở lượt này?'))pad.clear();});
    root.querySelector('#submit-answer').addEventListener('click',()=>submit('drawing'));
  }
  const guess=root.querySelector('#guess');
  if(guess) {
    guess.maxLength=160;
    const key=`guess:${snapshot.gameId}:${snapshot.turnId}`;
    guess.value=drafts.get(key)??'';
    guess.addEventListener('input',()=>{drafts.set(key,guess.value);updateControls();});
    root.querySelector('#guess-form').addEventListener('submit',event=>{event.preventDefault();submit('guess');});
  }
}
function submit(kind) {
  if(pending||!snapshot?.task)return;
  const message={type:'answer.submit',gameId:snapshot.gameId,turnId:snapshot.turnId,kind};
  if(kind==='drawing') {
    pad.finish();if(!pad.hasInk()){toast('Vẽ một chút trước khi nộp nhé.');return;}
    message.strokes=pad.strokes;
  } else {message.text=root.querySelector('#guess').value.trim();if(!message.text)return;}
  if(send(message)) {pending=true;if(pad)pad.locked=true;updateControls();}
}
function updateControls() {
  const ready=connected&&snapshot?.players.length>=3&&snapshot.players.every(p=>p.online);
  for(const id of ['start','restart']){const button=root.querySelector(`#${id}`);if(button)button.disabled=!ready;}
  const submitButton=root.querySelector('#submit-answer');
  if(submitButton)submitButton.disabled=!connected||pending||(pad?!pad.hasInk():!root.querySelector('#guess')?.value.trim());
  if(pad) {
    pad.locked=pending;
    root.querySelector('#undo').disabled=pending||!pad.strokes.length;
    root.querySelector('#redo').disabled=pending||!pad.redoStrokes.length;
    root.querySelector('#clear').disabled=pending||!pad.strokes.length;
  }
  if(snapshot?.task&&pending){const status=root.querySelector('#submission-status');if(status)status.textContent='Đang gửi bài…';}
}
function updateClock() {
  const clock=root.querySelector('#clock');if(!clock||!snapshot)return;
  const remaining=Math.max(0,Math.ceil((snapshot.deadline-Date.now())/1000));
  clock.textContent=remaining;clock.parentElement.classList.toggle('urgent',remaining<=10);
}
leaveButton.addEventListener('click',()=>{
  if(snapshot&&['drawing','guessing'].includes(snapshot.phase)&&!confirm('Rời phòng khi đang chơi? Lượt của bạn vẫn sẽ tính giờ.'))return;
  try{connection?.send({type:'session.leave'});}catch{}
  reset();
});
setInterval(updateClock,250);
if(session&&(!inviteCode||session.roomCode===inviteCode)){root.innerHTML='<div class="wait-space"><h1>Đang trở lại phòng…</h1></div>';connect();}else showLanding();
