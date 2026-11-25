import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// match.js is a plain content script (no module system), so evaluate it the way the browser does.
const { isNaverPhoto, photoNumber, orderNaverPhotos } = new Function(readFileSync(new URL('../extension/match.js', import.meta.url), 'utf8') + '\nreturn { isNaverPhoto, photoNumber, orderNaverPhotos };')();

test('확장: 네이버에 올라간 사진 주소만 사진으로 본다', () => {
  assert.equal(isNaverPhoto('https://postfiles.pstatic.net/MjAy/a/01.jpg?type=w773'), true);
  assert.equal(isNaverPhoto('https://blogfiles.pstatic.net/a/b.png'), true);
  assert.equal(isNaverPhoto('https://ssl.pstatic.net/static/icon.png'), false);
  assert.equal(isNaverPhoto('http://postfiles.pstatic.net/a/01.jpg'), false);
  assert.equal(isNaverPhoto('blob:https://blog.naver.com/abc'), false);
  assert.equal(isNaverPhoto('data:image/png;base64,AAAA'), false);
});
test('확장: 올린 순서가 섞여도 파일 번호로 본문 순서를 맞추고, 수가 다르면 연결하지 않는다', () => {
  const url = n => `https://postfiles.pstatic.net/MjAy/k${n}/${n}.jpg?type=w773`;
  assert.equal(photoNumber(url('07')), 7);
  assert.deepEqual(orderNaverPhotos([url('03'), url('01'), url('02')], 3), { urls: [url('01'), url('02'), url('03')], by: 'number' });
  const renamed = ['https://postfiles.pstatic.net/a/x.jpg', 'https://postfiles.pstatic.net/a/y.jpg'];
  assert.deepEqual(orderNaverPhotos(renamed, 2), { urls: renamed, by: 'order' });
  assert.equal(orderNaverPhotos([url('01')], 2), null);
});
test('확장: manifest는 작업실과 네이버 블로그에만 접근하고 발행 코드가 없다', () => {
  const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url)));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions.filter(h => !/^https:\/\/(youngs-blog-studio\.onrender\.com|blog\.naver\.com)\/\*$|^http:\/\/127\.0\.0\.1:3030\/\*$/.test(h)), []);
  const naver = readFileSync(new URL('../extension/naver.js', import.meta.url), 'utf8');
  assert.equal(/publish_btn|confirm_btn|btn_publish/.test(naver), false);
});
