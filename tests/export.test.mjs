import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipFiles} from '../public/export.js';

test('사진 ZIP은 파일 이름, 원본 바이트, 표준 CRC32와 중앙 디렉터리를 포함한다',async()=>{
 const bytes=new TextEncoder().encode('123456789');
 const archive=zipFiles([{name:'01.jpg',bytes}]);const data=new Uint8Array(await archive.arrayBuffer());const v=new DataView(data.buffer);
 assert.equal(archive.type,'application/zip');assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint32(14,true),0xcbf43926);
 const nameLength=v.getUint16(26,true);assert.equal(new TextDecoder().decode(data.slice(30,30+nameLength)),'01.jpg');
 assert.deepEqual(data.slice(30+nameLength,30+nameLength+bytes.length),bytes);
 const end=data.length-22;assert.equal(v.getUint32(end,true),0x06054b50);assert.equal(v.getUint16(end+10,true),1);
 assert.equal(v.getUint32(v.getUint32(end+16,true),true),0x02014b50);
});
test('사진이 없는 ZIP도 올바른 빈 디렉터리를 만든다',async()=>{
 const data=await zipFiles([]).arrayBuffer();assert.equal(data.byteLength,22);assert.equal(new DataView(data).getUint32(0,true),0x06054b50);
});


import {splitClipboardArticle} from '../public/export.js';
class Article {
 constructor(children=[],html='') { this.children=children;this.html=html;this.dataset={}; }
 cloneNode(deep) { return new Article(deep?this.children.map(c=>c.cloneNode(true)):[],this.html); }
 append(child) { child.parent=this;this.children.push(child); }
 get lastElementChild() { return this.children.at(-1); }
 remove() { this.parent.children.splice(this.parent.children.indexOf(this),1); }
 querySelectorAll() { return []; }
 get innerHTML() { return this.html+this.children.map(c=>c.innerHTML).join(''); }
}
test('분할 복사는 UTF-8 바이트 한도를 지키고 사진·문단 순서와 원문을 보존한다',()=>{
 const contents=['<p>한글 방문기</p>','<img src="data:image/jpeg;base64,'+'A'.repeat(250)+'">','<p>마무리 한글</p>'];
 const article=new Article(contents.map(html=>new Article([],html)));
 const parts=splitClipboardArticle(article,400);
 assert.ok(parts.length>1);
 assert.equal(parts.map(p=>p.innerHTML).join(''),contents.join(''));
 assert.equal(article.innerHTML,contents.join(''));
 for(const part of parts) assert.ok(new Blob([`<!doctype html><html><body><!--StartFragment-->${part.innerHTML}<!--EndFragment--></body></html>`]).size<=400);
});
test('단일 사진이 한도를 넘으면 누락하거나 초과 복사하지 않고 안내한다',()=>{
 assert.throws(()=>splitClipboardArticle(new Article([new Article([],'x'.repeat(500))]),400),/사진 ZIP/);
 assert.deepEqual(splitClipboardArticle(new Article()),[]);
});