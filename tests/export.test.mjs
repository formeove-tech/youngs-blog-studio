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
