import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlaceUrl, validateDraft, memoDraft, validateResult, createAiLimiter } from '../lib.mjs';

test('네이버 장소 주소만 허용하고 내부 주소와 위장 주소를 거부한다', () => {
  for (const url of ['https://naver.me/abcd', 'https://m.place.naver.com/restaurant/123/home', 'https://map.naver.com/p/entry/place/123']) assert.ok(validatePlaceUrl(url));
  for (const url of ['http://naver.me/abcd', 'https://127.0.0.1/admin', 'https://m.place.naver.com.evil.com', 'https://user:password@naver.me/x', 'https://naver.me:3000']) assert.throws(() => validatePlaceUrl(url));
});
test('경험 메모가 없거나 사진 수·형식이 잘못되면 초안 생성을 거부한다', () => {
  assert.throws(() => validateDraft({ name: '가게' }));
  assert.throws(() => validateDraft({ name: '가게', good: '좋았어요', photos: Array(21).fill({}) }));
  assert.throws(() => validateDraft({ name: '가게', good: '좋았어요', photos: [{ image: 'data:image/svg+xml;base64,PHN2Zz4=' }] }));
});
test('메모 초안은 사용자 경험을 보존하고 미입력 사실을 만들지 않는다', () => {
  const d=validateDraft({ name:'동네 피자',region:'순천',visit:'친구와 다녀왔어요.',good:'루꼴라가 향긋했어요.',bad:'주차 공간이 좁았어요.',menu:'피자 27,000원',photos:[{caption:'파란 간판'},{caption:'피자'}],keywords:'피자,순천데이트,피자' });
  const r=memoDraft(d);
  assert.equal(r.mode,'memo'); assert.equal(r.intro,d.visit); assert.match(r.info,/27,000/);
  assert.deepEqual(r.sections.filter(s=>s.photoIndex!==null).map(s=>s.photoIndex),[0,1]);
  assert.equal(r.sections.find(s=>s.heading==='조금 아쉬웠던 점').text,d.bad);
  assert.doesNotMatch(JSON.stringify(r),/무료주차|남자친구|불향|비 오는/);
  assert.equal(r.hashtags.split('#피자').length-1,1);
});
test('AI 결과에서 사진 누락·중복·잘못된 인덱스를 보정한다',()=>{
  const r=validateResult({titles:['제목'],sections:[{photoIndex:0,text:'첫 사진'},{photoIndex:0,text:'중복'},{photoIndex:99,text:'범위 밖'}]},3);
  assert.deepEqual(r.sections.filter(s=>s.photoIndex!==null).map(s=>s.photoIndex),[0,1,2]);
  assert.throws(()=>validateResult({},1));
});

test('공용 AI 동시 요청과 일일 요청을 제한하고 다음 날 초기화한다',()=>{
 let time=Date.UTC(2026,9,20);const limit=createAiLimiter({dailyLimit:2,minuteLimit:10,concurrency:1,now:()=>time});
 const done=limit.acquire();assert.throws(()=>limit.acquire(),/요청이 많아요/);done();done();
 const second=limit.acquire();second();assert.throws(()=>limit.acquire(),/모두 사용/);
 time+=86400000;limit.acquire()();
});
