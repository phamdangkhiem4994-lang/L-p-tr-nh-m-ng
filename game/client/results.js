import { escapeHTML, playerName, roomHeader } from './views.js';
import { observeDrawing } from './canvas.js';

// Only the latest server-revealed step takes the shared stage.
function focusedStep(chains) {
  for (let ci = chains.length - 1; ci >= 0; ci--) {
    const chain = chains[ci];
    if (chain.steps.length) {
      const si = chain.steps.length - 1;
      return { chain, step: chain.steps[si], ci, si };
    }
  }
  return null;
}

function stage(current, snapshot) {
  const {chain, step, ci, si} = current;
  const author = escapeHTML(step.authorName ?? playerName(snapshot, step.playerId));
  const label = step.kind === 'drawing' ? 'Vẽ hình' : si === 0 ? 'Câu mở đầu' : 'Đoán bằng chữ';
  const content = step.skipped
    ? '<p class="interrupted focus-skipped">Đã bỏ lỡ lượt này.</p>'
    : step.kind === 'text'
      ? `<blockquote class="revealed-text focus-text">${escapeHTML(step.text)}</blockquote>`
      : `<canvas data-chain="${ci}" data-step="${si}" role="img" aria-label="Tranh của ${author}"></canvas>`;
  return `<section class="reveal-focus" aria-label="Bước đang công bố">
    <p class="focus-story">Câu chuyện ${ci + 1}/${snapshot.result.totalChains} · ${escapeHTML(chain.ownerName ?? playerName(snapshot, chain.ownerId))}</p>
    <figure class="reveal-step focus-step">
      <figcaption><span class="step-number">${si + 1}</span><strong>${author}</strong><small>${label} · bước ${si + 1}/${snapshot.totalTurns}</small></figcaption>
      ${content}
    </figure>
  </section>`;
}

export function results(snapshot, me) {
  const result = snapshot.result;
  if (!result) return '';
  const host = snapshot.hostId === me;
  const current = focusedStep(result.chains);
  const nextLabel = !current ? 'Bắt đầu kể chuyện →'
    : current.si === snapshot.totalTurns - 1 ? 'Câu chuyện tiếp theo →' : 'Người tiếp theo →';
  return `<section class="room-shell reveal reveal-presentation">${roomHeader(snapshot)}
    <div class="focus-heading"><p class="eyebrow">MỖI NGƯỜI MỘT NÉT · MỖI NÉT MỘT BẤT NGỜ</p><h1>Cùng xem câu chuyện!</h1></div>
    <div class="reveal-controls"><p role="status">Bước ${result.revealCount}/${result.totalSteps} · ${result.totalChains} câu chuyện</p>
      ${!result.finished ? host ? `<button class="button primary" id="reveal-next">${nextLabel}</button>`
        : '<p class="waiting-note">Chờ chủ phòng chuyển sang người tiếp theo…</p>'
        : '<strong>Đã kể hết mọi câu chuyện!</strong>'}
    </div>
    ${current ? stage(current, snapshot) : '<div class="wait-space"><h2>Giữ bí mật đến phút cuối.</h2><p class="muted">Mỗi lần chuyển, cả phòng cùng xem một câu hoặc một bức tranh thật to.</p></div>'}
    ${result.finished ? `<div class="restart-row"><div><h2>Thêm một vòng bất ngờ?</h2><p class="muted">Mỗi người sẽ bắt đầu một câu chuyện mới.</p></div>
      ${host ? '<div class="restart-actions"><button class="button secondary" id="back-lobby">Về phòng chờ</button><button class="button primary" id="restart">Chơi ván mới ↗</button></div>'
        : '<p class="waiting-note">Chờ chủ phòng mở ván mới…</p>'}</div>` : ''}
  </section>`;
}

export function mountResults(root, snapshot) {
  const cleanups = [...root.querySelectorAll('canvas[data-chain]')].map(canvas => observeDrawing(canvas,
    snapshot.result.chains[Number(canvas.dataset.chain)].steps[Number(canvas.dataset.step)].strokes));
  return () => cleanups.forEach(cleanup => cleanup());
}
