import { createGameServer } from './http.js';

const port=Number(process.env.PORT??3000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT phải từ 1 đến 65535.');
const app=createGameServer();
app.server.listen(port,process.env.HOST??'0.0.0.0',()=>console.log(`Truyền Nét: http://localhost:${port}`));
app.server.on('error',error=>{console.error(error.message);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
