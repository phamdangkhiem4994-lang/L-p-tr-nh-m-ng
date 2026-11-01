export function backendOrigin(pageURL, configuredOrigin) {
  const page=new URL(pageURL);
  if(!configuredOrigin)return page.origin;
  const backend=new URL(configuredOrigin);
  if(!['http:','https:'].includes(backend.protocol)||backend.username||backend.password||backend.pathname!=='/'||backend.search||backend.hash)
    throw new Error('Địa chỉ server không hợp lệ.');
  return backend.origin;
}
export function websocketURL(origin) {
  const url=new URL('/ws',origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';return url.href;
}
