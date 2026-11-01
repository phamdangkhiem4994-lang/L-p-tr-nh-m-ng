import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GameStore, GameError } from './game.js';
import { attachRealtime } from './realtime.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
function sameOrigin(req) {
  if(!req.headers.origin)return true;
  try {const origin=new URL(req.headers.origin);return ['http:','https:'].includes(origin.protocol)&&origin.host===req.headers.host;}catch{return false;}
}
function json(res,status,body) {res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));}
async function body(req) {
  if(!req.headers['content-type']?.startsWith('application/json'))throw new GameError('Yêu cầu cần dữ liệu JSON.');
  const chunks=[];let size=0;
  for await(const chunk of req) {size+=chunk.length;if(size>2048)throw new GameError('Yêu cầu quá lớn.');chunks.push(chunk);}
  try {const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data || Array.isArray(data) || typeof data!=='object')throw Error();return data;}
  catch {throw new GameError('Dữ liệu JSON không hợp lệ.');}
}
export function createGameServer(options={}) {
  const store=new GameStore(options),limits=new Map();let realtime;
  const server=createServer(async(req,res)=>{
    res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');
    res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET' && url.pathname==='/api/health')return json(res,200,{ok:true});
      if(req.method==='POST' && url.pathname.startsWith('/api/')) {
        if(!sameOrigin(req))return json(res,403,{error:'Nguồn yêu cầu không hợp lệ.'});
        const ip=req.socket.remoteAddress,now=Date.now();
        if(limits.size>10000)for(const [k,v]of limits)if(now-v.start>60000)limits.delete(k);
        let bucket=limits.get(ip);if(!bucket || now-bucket.start>60000){bucket={start:now,count:0};limits.set(ip,bucket);}
        if(++bucket.count>40)return json(res,429,{error:'Quá nhiều yêu cầu. Hãy chờ một phút.'});
        const data=await body(req);
        if(url.pathname==='/api/rooms')return json(res,201,store.create(data.name));
        const match=url.pathname.match(/^\/api\/rooms\/([a-zA-Z0-9]{6})\/join$/);
        if(match){const session=store.join(match[1],data.name);json(res,201,session);realtime.broadcast(session.roomCode);return;}
        return json(res,404,{error:'Không tìm thấy API.'});
      }
      if(req.method!=='GET' && req.method!=='HEAD')return json(res,405,{error:'Phương thức không hỗ trợ.'});
      const pathname=decodeURIComponent(url.pathname);
      let filename;
      if(pathname==='/' || pathname==='/index.html')filename=path.join(root,'public','index.html');
      else if(/^\/client\/[a-zA-Z0-9_-]+\.js$/.test(pathname))filename=path.join(root,pathname.slice(1));
      else if(/^\/[a-zA-Z0-9_-]+\.(css|svg|ico)$/.test(pathname))filename=path.join(root,'public',pathname.slice(1));
      else return json(res,404,{error:'Không tìm thấy tài nguyên.'});
      const content=await readFile(filename);
      res.writeHead(200,{'content-type':types[path.extname(filename)],'cache-control':'no-cache'});
      res.end(req.method==='HEAD'?undefined:content);
    } catch(error) {
      if(res.headersSent){res.end();return;}
      if(error.code==='ENOENT')return json(res,404,{error:'Không tìm thấy tài nguyên.'});
      if(error instanceof GameError || error instanceof URIError)return json(res,400,{error:error.message});
      console.error('HTTP request failed:',error);json(res,500,{error:'Server gặp lỗi, vui lòng thử lại.'});
    }
  });
  realtime=attachRealtime(server,store,{sameOrigin});
  server.requestTimeout=10000;server.headersTimeout=15000;
  return {server,store,close:()=>new Promise(resolve=>{realtime.close();server.close(resolve);server.closeAllConnections();})};
}
