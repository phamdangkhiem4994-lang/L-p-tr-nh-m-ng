import qrcode from './qrcode.js';
export function invitedRoom(url) {
  const code = new URL(url).searchParams.get('room')?.trim().toUpperCase();
  return /^[A-F0-9]{6}$/.test(code ?? '') ? code : null;
}
export function invitationURL(url, code) {
  if (!/^[A-F0-9]{6}$/.test(code)) throw new Error('Mã phòng không hợp lệ.');
  const link = new URL(url); link.search = ''; link.hash = '';
  link.searchParams.set('room', code); return link.href;
}
export function invitationQR(url) {
  const qr = qrcode(0, 'M'); qr.addData(url, 'Byte'); qr.make();
  return qr.createSvgTag({cellSize: 4, margin: 16, scalable: true});
}
export function mountInvite(root, code, toast) {
  const field = root.querySelector('#invite-link'); if (!field) return;
  const link = invitationURL(location.href, code); field.value = link;
  root.querySelector('#invite-qr').innerHTML = invitationQR(link);
  const svg = root.querySelector('#invite-qr svg');
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Mã QR mời vào phòng ${code}`);
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
    root.querySelector('#invite-hint').textContent = 'Bản đang chạy trên máy này. Để mở trên điện thoại, hãy dùng địa chỉ LAN hoặc website đã triển khai.';
  root.querySelector('#copy-invite').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(link); toast('Đã sao chép link mời. Gửi cho hội bạn nhé!'); }
    catch { field.focus(); field.select(); toast('Hãy sao chép link trong ô mời bạn.'); }
  });
}
