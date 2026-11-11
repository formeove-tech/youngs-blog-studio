import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateDraft,memoDraft,validateResult,placeInfoRows} from '../lib.mjs';
import {checklistItems,evaluateChecklist} from '../public/naver-checklist.js';

test('감성 템플릿은 입력한 한 줄 감상과 확인된 정보만 사용한다',()=>{
 const d=validateDraft({name:'피자집',visit:'친구와 갔어요.',highlight:'파란 간판이 기억에 남았어요.',template:'calm',address:'사용자가 확인한 주소',relatedUrl:'https://blog.naver.com/youngs_street/123'});
 const r=memoDraft(d);assert.equal(r.template,'calm');assert.equal(r.pullQuote,d.highlight);assert.deepEqual(r.infoRows,[['가게 이름',d.name],['주소',d.address]]);assert.equal(r.relatedUrl,d.relatedUrl);
 assert.deepEqual(placeInfoRows(d),r.infoRows);assert.doesNotMatch(JSON.stringify(r),/날씨|햇살|비 오는|무료주차/);
 const empty=memoDraft(validateDraft({name:'피자집',good:'좋았어요.'}));assert.equal(empty.pullQuote,'');assert.equal(empty.template,'warm');assert.deepEqual(empty.infoRows,[['가게 이름','피자집']]);
});
test('관련 글 링크에 스크립트·외부 사이트·위장 주소를 넣을 수 없다',()=>{
 for(const relatedUrl of ['javascript:alert(1)','https://evil.example/','https://blog.naver.com.evil.example/post','https://user@blog.naver.com/post'])assert.throws(()=>validateDraft({name:'가게',visit:'방문',relatedUrl}));
});
test('작성 점검은 실제 글자 수와 사진 개수·크기를 기준으로 판정한다',()=>{
 assert.equal(checklistItems.length,26);
 let r=evaluateChecklist({title:'제목',body:'가'.repeat(1499)+' \n ',photoWidths:[1400,1400,1400,1400,759],quote:'감상',tables:1,tags:'#맛집'});
 assert.equal(r.body.done,false);assert.equal(r.photos.done,false);assert.equal(r.quote.done,true);assert.equal(r.table.done,true);
 r=evaluateChecklist({title:'제목',body:'가'.repeat(1500),photoWidths:[760,1000,1000,1400,1400],dividers:1,tags:'#동네맛집'});
 assert.equal(r.body.done,true);assert.equal(r.photos.done,true);assert.equal(r.tags.done,true);
 assert.equal(evaluateChecklist({photoWidths:[1400,1400,1400,1400]}).photos.done,false);
});
test('AI 감상과 사진 캡션은 길이가 제한되고 기존 응답도 지원한다',()=>{
 const r=validateResult({titles:['제목'],pullQuote:'가'.repeat(400),sections:[{photoIndex:0,caption:'나'.repeat(200),text:'본문'}]},1);
 assert.equal(r.pullQuote.length,300);assert.equal(r.sections[0].caption.length,160);
 assert.equal(validateResult({titles:['제목'],sections:[]},0).pullQuote,'');
});


test('플레이스 링크와 확인된 주소를 글의 매장 정보에 넣는다',()=>{
 const data=validateDraft({name:'카페',visit:'방문',url:'https://naver.me/FEgq4aSn',address:'확인한 주소'});
 assert.deepEqual(memoDraft(data).infoRows,[['가게 이름','카페'],['주소','확인한 주소'],['네이버 플레이스','https://naver.me/FEgq4aSn']]);
 assert.equal(placeInfoRows({...data,url:'https://example.com/store'}).some(([key])=>key==='네이버 플레이스'),false);
});
