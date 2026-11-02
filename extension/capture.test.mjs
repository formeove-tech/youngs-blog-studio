import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./capture.js',import.meta.url),'utf8');
function extract(root){const ctx={Date,Error};vm.createContext(ctx);vm.runInContext(source,ctx);return ctx.youngsExtractArticle(root);}
const textNode=(tag,text)=>({tagName:tag,textContent:text,innerText:undefined,matches:()=>false,querySelector:()=>null});
function articleRoot(children,hidden=false){const h1=textNode('H1','저장한 방문기');const article={hidden,children,querySelector:()=>h1};return{querySelector:()=>article};}
test('저장 HTML의 비표시 DOM에서도 제목·소제목·사진 17장을 보존한다',()=>{
 const heading=textNode('H2','마늘 듬뿍 족발');
 const images=Array.from({length:17},(_,i)=>({tagName:'IMG',matches:()=>false,getAttribute:n=>n==='src'?'data:image/jpeg;base64,AA==':`사진 ${i+1}`}));
 const packet=extract(articleRoot([heading,...images,textNode('P','직접 다녀온 후기')]));
 assert.equal(packet.title,'저장한 방문기');assert.equal(packet.blocks.filter(b=>b.type==='image').length,17);assert.equal(packet.blocks[0].type,'heading');assert.equal(packet.blocks.at(-1).text,'직접 다녀온 후기');
});
test('미완성 글과 비내장 사진은 구체적인 오류로 반환해 사진을 조용히 누락하지 않는다',()=>{
 assert.throws(()=>extract(articleRoot([],true)),/초안을 만들거나/);
 const image={tagName:'IMG',matches:()=>false,getAttribute:()=> 'https://example.com/photo.jpg'};
 assert.throws(()=>extract(articleRoot([image])),/1번 사진/);
});
test('팝업 자동 갱신 뒤에도 가져오기 오류가 지워지지 않는다',async()=>{
 const elements=new Map();const $=s=>{if(!elements.has(s))elements.set(s,{textContent:'',checked:false});return elements.get(s);};
 const storage={};const ctx={console,document:{querySelector:$},chrome:{storage:{local:{get:async()=>storage,set:async v=>Object.assign(storage,v),remove:async()=>{}}},tabs:{query:async()=>[{id:1}]},runtime:{sendMessage:async()=>({error:'완성한 글이 없습니다.'})}},setInterval:()=>{},Error};
 vm.createContext(ctx);vm.runInContext(readFileSync(new URL('./popup.js',import.meta.url),'utf8'),ctx);
 await vm.runInContext("request('capture')",ctx);await vm.runInContext('refresh()',ctx);
 assert.equal($('#status').textContent,'완성한 글이 없습니다.');
});
test('주입 스크립트가 실패하면 성공으로 표시하지 않고 오류를 보관한다',async()=>{
 let listener;const storage={};const ctx={URL,Error,console,chrome:{runtime:{onMessage:{addListener:f=>listener=f}},tabs:{get:async()=>({id:1,url:'https://youngs-blog-studio.onrender.com/'})},scripting:{executeScript:async args=>args.files?[]:[{result:{ok:false,error:'제목이 없습니다.'}}]},storage:{local:{set:async v=>Object.assign(storage,v)}}}};
 vm.createContext(ctx);vm.runInContext(readFileSync(new URL('./background.js',import.meta.url),'utf8'),ctx);
 const response=await new Promise(resolve=>listener({action:'capture',tabId:1},{},resolve));
 assert.equal(response.error,'제목이 없습니다.');assert.equal(storage.status.message,'제목이 없습니다.');assert.equal(storage.packet,undefined);
});
