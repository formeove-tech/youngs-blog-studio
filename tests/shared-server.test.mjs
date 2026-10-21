import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import net from 'node:net';

test('공유 서버는 사용자 키를 무시하고 서버 키를 사용하며 키를 응답에 노출하지 않는다',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'youngs-api-test-'));
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const fixture=path.join(dir,'mock.mjs');
 await writeFile(fixture,`globalThis.fetch=async(url,options)=>{
  if(url!=='https://api.openai.com/v1/chat/completions') throw new Error('Unexpected network call');
  if(options.headers.Authorization!=='Bearer test-server-only-key') throw new Error('Server key not used');
  const body=JSON.parse(options.body);
  if(!body.messages[0].content.includes('일상 방문기형')) throw new Error('Style missing');
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({titles:['테스트 방문기'],intro:'메모로 쓴 방문기예요.',sections:[],closing:'잘 다녀왔어요.',hashtags:'#테스트'})}}]}),{headers:{'Content-Type':'application/json'}});
 };`);
 const child=spawn(process.execPath,['--import',pathToFileURL(fixture).href,'server.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PUBLIC_ORIGIN:'https://studio.example.com',BLOG_WRITER_API_KEY:'test-server-only-key'},stdio:'ignore'});
 const base=`http://127.0.0.1:${port}`;
 try {
  let ready=false;
  for(let i=0;i<60;i++) {try {const r=await fetch(base+'/api/health');if(r.ok){ready=true;break;}}catch{} await new Promise(resolve=>setTimeout(resolve,50));}
  assert.ok(ready,'server started');
  const health=await (await fetch(base+'/api/health')).json();assert.equal(health.aiConfigured,true);assert.equal(Object.keys(health).length,2);
  const r=await fetch(base+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://studio.example.com'},body:JSON.stringify({name:'테스트',visit:'방문했어요.',mode:'ai',apiKey:'test-client-key-ignored'})});
  assert.equal(r.status,200);const text=await r.text();assert.doesNotMatch(text,/test-server-only-key|test-client-key-ignored/);assert.equal(JSON.parse(text).mode,'ai');
  const forbidden=await fetch(base+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example.com'},body:'{}'});assert.equal(forbidden.status,403);
 } finally {child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));await rm(dir,{recursive:true,force:true});}
});
