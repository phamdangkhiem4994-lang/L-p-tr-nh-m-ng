import { escapeHTML, playerName, roomHeader } from './views.js';
import { observeDrawing } from './canvas.js';
export function results(snapshot, me) {
  const result = snapshot.result;
  if (!result) return `<section class="room-shell">${roomHeader(snapshot)}<h1>Đang chờ kết quả…</h1></section>`;
  const drawings = [...(result.drawings || [])].sort((a, b) => a.turnIndex - b.turnIndex);
  return `<section class="room-shell reveal">${roomHeader(snapshot)}<p class="eyebrow">HÀNH TRÌNH CỦA MỘT TỪ KHÓA</p><h1 class="section-title">Đi một nét.<br><em>Xa một trời.</em></h1>${result.status === 'interrupted' ? `<p class="interrupted" role="status">Ván chơi đã dừng.${result.reason ? ` ${escapeHTML(result.reason)}` : ''}</p>` : ''}<div class="answer-comparison"><div><span>TỪ KHÓA BAN ĐẦU</span><strong>${escapeHTML(result.keyword)}</strong></div><span class="answer-arrow" aria-hidden="true">⤳</span><div><span>${escapeHTML(playerName(snapshot, result.guesserId))} ĐÃ ĐOÁN</span><strong>${result.finalGuess ? escapeHTML(result.finalGuess) : 'Chưa có đáp án'}</strong></div></div><div class="reveal-chain">${drawings.map((drawing, index) => `<figure class="reveal-step"><figcaption><span class="step-number">${drawing.turnIndex + 1}</span><strong>${escapeHTML(playerName(snapshot, drawing.playerId))}</strong><small>${index === 0 ? 'Nét vẽ đầu tiên' : 'Vẽ tiếp câu chuyện'}</small></figcaption><canvas data-result="${index}" role="img" aria-label="Bức vẽ lượt ${drawing.turnIndex + 1} của ${escapeHTML(playerName(snapshot, drawing.playerId))}"></canvas></figure>`).join('') || '<p class="muted">Chưa có bức vẽ nào được gửi.</p>'}</div><div class="restart-row"><div><h2>Thêm một vòng bất ngờ?</h2><p class="muted">Lượt tiếp theo: ${escapeHTML((result.nextPlayerIds || []).map(id => playerName(snapshot, id)).join(' → '))}</p><p class="muted">Cần ít nhất 3 người và tất cả đang trực tuyến.</p></div>${snapshot.hostId === me ? '<button class="button primary" id="restart">Chơi ván mới ↗</button>' : '<p class="waiting-note">Chờ chủ phòng mở ván mới…</p>'}</div></section>`;
}
export function mountResults(root, snapshot) {
  const drawings = [...(snapshot.result?.drawings || [])].sort((a, b) => a.turnIndex - b.turnIndex);
  const cleanups = [...root.querySelectorAll('[data-result]')].map(canvas => observeDrawing(canvas, drawings[Number(canvas.dataset.result)].strokes));
  return () => cleanups.forEach(cleanup => cleanup());
}
