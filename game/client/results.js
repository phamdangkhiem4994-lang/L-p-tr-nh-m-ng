import { escapeHTML, playerName, roomHeader } from './views.js';
import { observeDrawing } from './canvas.js';
export function results(snapshot, me) {
  const result=snapshot.result;
  if(!result)return '';
  const host=snapshot.hostId===me;
  return `<section class="room-shell reveal">${roomHeader(snapshot)}<p class="eyebrow">CÂU → HÌNH → CÂU</p><h1 class="section-title">Câu chuyện đã<br><em>đi đến đâu?</em></h1><div class="reveal-controls"><p role="status">Đã mở ${result.revealCount}/${result.totalSteps} bước · ${result.totalChains} chuỗi</p>${!result.finished?(host?'<button class="button primary" id="reveal-next">Mở bước tiếp theo →</button>':'<p class="waiting-note">Chờ chủ phòng mở bước tiếp theo…</p>'):'<strong>Đã mở hết mọi câu chuyện!</strong>'}</div>${!result.chains.length?'<div class="wait-space"><h2>Giữ bí mật đến phút cuối.</h2><p class="muted">Chủ phòng sẽ lần lượt mở câu, tranh và người thực hiện cho cả nhóm.</p></div>':result.chains.map((chain,ci)=>`<section class="album"><h2>Chuỗi ${ci+1} · ${escapeHTML(chain.ownerName??playerName(snapshot,chain.ownerId))}</h2><div class="reveal-chain">${chain.steps.map((step,si)=>`<figure class="reveal-step"><figcaption><span class="step-number">${si+1}</span><strong>${escapeHTML(step.authorName??playerName(snapshot,step.playerId))}</strong><small>${step.kind==='drawing'?'Vẽ hình':si===0?'Câu mở đầu':'Đoán bằng chữ'}</small></figcaption>${step.skipped?'<p class="interrupted">Đã bỏ lỡ lượt này.</p>':step.kind==='text'?`<blockquote class="revealed-text">${escapeHTML(step.text)}</blockquote>`:`<canvas data-chain="${ci}" data-step="${si}" role="img" aria-label="Tranh của ${escapeHTML(step.authorName??playerName(snapshot,step.playerId))}"></canvas>`}</figure>`).join('')}</div></section>`).join('')}${result.finished?`<div class="restart-row"><div><h2>Thêm một vòng bất ngờ?</h2><p class="muted">Mỗi người sẽ bắt đầu một câu chuyện mới.</p></div>${host?'<button class="button primary" id="restart">Chơi ván mới ↗</button>':'<p class="waiting-note">Chờ chủ phòng mở ván mới…</p>'}</div>`:''}</section>`;
}
export function mountResults(root,snapshot) {
  const cleanups=[...root.querySelectorAll('[data-chain]')].map(canvas=>observeDrawing(canvas,
    snapshot.result.chains[Number(canvas.dataset.chain)].steps[Number(canvas.dataset.step)].strokes));
  return ()=>cleanups.forEach(cleanup=>cleanup());
}
