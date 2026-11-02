import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./runner.js',import.meta.url),'utf8');
function environment(existing=false){const updates=[];let mutations=0;const title={innerText:existing?'기존 작성 중인 글':'',getClientRects:()=>[{}]};const body={innerText:'',getClientRects:()=>[{}],closest:()=>null};const ctx={setTimeout,Date,Error,console,location:{pathname:'/PostWriteForm.naver'},chrome:{storage:{local:{set:async v=>updates.push(v)}}},document:{querySelectorAll:s=>s.includes('se-title-text')?[title]:s.includes('se-component.se-text')?[body]:[],querySelector:()=>null,execCommand:()=>{mutations++;return true;}}};vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,updates,mutations:()=>mutations};}
test('실계정 검증 전 자동 발행은 DOM 변경 없이 중지한다',async()=>{const e=environment();await e.ctx.youngsRunner.run({title:'제목',blocks:[]},true);assert.equal(e.mutations(),0);assert.match(e.updates.at(-1).status.message,/자동 발행을 잠가/);});
test('기존 글을 덮어쓰거나 중복 입력하지 않는다',async()=>{const e=environment(true);await e.ctx.youngsRunner.run({title:'제목',blocks:[]},false);assert.equal(e.mutations(),0);assert.match(e.updates.at(-1).status.message,/빈 새 글/);});
test('가져온 글이 잘못되면 작성 전에 멈춘다',async()=>{const e=environment();await e.ctx.youngsRunner.run({},false);assert.equal(e.mutations(),0);assert.match(e.updates.at(-1).status.message,/형식/);});
