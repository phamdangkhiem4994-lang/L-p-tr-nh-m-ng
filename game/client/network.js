const KEY = 'truyen-net.session.v1';
export function readSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY));
    return value && ['roomCode', 'playerId', 'token'].every(k => typeof value[k] === 'string' && value[k]) ? value : null;
  } catch { return null; }
}
export function saveSession(value) {
  try { value ? sessionStorage.setItem(KEY, JSON.stringify(value)) : sessionStorage.removeItem(KEY); } catch { /* Private mode can disable storage. */ }
}
export async function enterRoom(name, code) {
  const response = await fetch(code ? `/api/rooms/${encodeURIComponent(code)}/join` : '/api/rooms', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || 'Không thể vào phòng. Hãy thử lại.');
  if (!data.roomCode || !data.playerId || !data.token) throw new Error('Phản hồi phòng không hợp lệ.');
  return { roomCode: data.roomCode, playerId: data.playerId, token: data.token };
}
export class Connection {
  constructor(session, onMessage, onStatus) {
    Object.assign(this, { session, onMessage, onStatus, stopped: false, attempt: 0, socket: null });
    this.connect();
  }
  connect() {
    if (this.stopped) return;
    this.onStatus(this.attempt ? 'reconnecting' : 'connecting');
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    this.socket = socket;
    socket.onopen = () => {
      if (this.stopped) return;
      socket.send(JSON.stringify({ type: 'session.attach', ...this.session }));
      this.watchdog = setTimeout(() => socket.close(), 12000);
    };
    socket.onmessage = event => {
      if (this.stopped || socket !== this.socket) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'room.snapshot') {
        clearTimeout(this.watchdog);
        this.attempt = 0;
        this.onStatus('online');
      }
      this.onMessage(message);
    };
    socket.onerror = () => socket.close();
    socket.onclose = event => {
      clearTimeout(this.watchdog);
      if (this.stopped) return;
      if (event.code === 4001 || event.code === 4002 || event.code === 4003) {
        this.stopped = true;
        this.onStatus(event.code === 4003 ? 'kicked' : event.code === 4002 ? 'displaced' : 'expired');
        return;
      }
      this.onStatus('reconnecting');
      this.timer = setTimeout(() => this.connect(), Math.min(1000 * 2 ** this.attempt++, 8000));
    };
  }
  send(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('Đang kết nối lại. Nét vẽ của bạn vẫn được giữ.');
    this.socket.send(JSON.stringify(message));
  }
  close() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.watchdog);
    this.socket?.close();
  }
}
