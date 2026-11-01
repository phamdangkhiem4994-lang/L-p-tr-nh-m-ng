export function paint(canvas, strokes) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const stroke of strokes || []) {
    if (!stroke.points?.length) continue;
    ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.size * rect.width / 800;
    const first = stroke.points[0];
    ctx.beginPath(); ctx.arc(first.x * rect.width, first.y * rect.height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(first.x * rect.width, first.y * rect.height);
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x * rect.width, point.y * rect.height);
    ctx.stroke();
  }
}
export function observeDrawing(canvas, strokes) {
  const observer = new ResizeObserver(() => paint(canvas, strokes));
  observer.observe(canvas); paint(canvas, strokes);
  return () => observer.disconnect();
}
export class DrawingPad {
  constructor(canvas, strokes = [], onChange = () => {}) {
    Object.assign(this, { canvas, strokes, onChange, color: '#302c38', size: 5, locked: false, pointer: null });
    this.inkColor = this.color;
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    canvas.addEventListener('pointerdown', event => this.down(event), options);
    canvas.addEventListener('pointermove', event => this.move(event), options);
    canvas.addEventListener('pointerup', event => this.end(event), options);
    canvas.addEventListener('pointercancel', event => this.end(event), options);
    canvas.addEventListener('lostpointercapture', event => this.end(event), options);
    this.observer = new ResizeObserver(() => this.render()); this.observer.observe(canvas);
    this.render();
  }
  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  }
  down(event) {
    if (this.locked || this.pointer !== null || event.button !== 0) return;
    event.preventDefault(); this.pointer = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.strokes.push({ color: this.color, size: this.size, points: [this.point(event)] });
    this.render(); this.onChange(this.strokes);
  }
  move(event) {
    if (this.locked || this.pointer !== event.pointerId) return;
    event.preventDefault();
    const samples = event.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event]) this.strokes.at(-1).points.push(this.point(sample));
    this.render();
  }
  end(event) {
    if (this.pointer !== event.pointerId) return;
    this.pointer = null; this.onChange(this.strokes);
  }
  finish() { this.pointer = null; this.onChange(this.strokes); }
  selectColor(color) { this.inkColor = color; this.color = color; }
  toggleEraser() { this.color = this.color === '#ffffff' ? this.inkColor : '#ffffff'; }
  undo() { if (!this.locked) { this.finish(); this.strokes.pop(); this.render(); this.onChange(this.strokes); } }
  clear() { if (!this.locked) { this.finish(); this.strokes.length = 0; this.render(); this.onChange(this.strokes); } }
  hasInk() { return this.strokes.some(stroke => stroke.color.toLowerCase() !== '#ffffff' && stroke.points.length); }
  render() { paint(this.canvas, this.strokes); }
  destroy() { this.finish(); this.observer.disconnect(); this.abort.abort(); }
}
