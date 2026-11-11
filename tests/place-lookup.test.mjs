import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPlaceLookup, openShopIndex } from '../place-lookup.mjs';

test('a new short link finds nearby licensed shops without asserting a match', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'place-index-test-'));
  try {
    const file = path.join(dir, 'test.sqlite');
    const db = new DatabaseSync(file);
    db.exec('CREATE TABLE shops (name TEXT, address TEXT, region TEXT, lat REAL, lng REAL)');
    const row = db.prepare('INSERT INTO shops VALUES (?, ?, ?, ?, ?)');
    row.run('다른 가게', '서울 송파구 테스트길 20', '서울 송파구', 37.4959, 127.13545);
    row.run('방문한 가게', '서울 송파구 테스트길 18', '서울 송파구', 37.4959, 127.13522);
    row.run('먼 가게', '서울 송파구 테스트길 25', '서울 송파구', 37.4959, 127.13622);
    db.close();
    const link = 'https://naver.me/NewPlace';
    let calls = 0;
    const lookup = createPlaceLookup({
      findNearby: openShopIndex(file),
      fetchLink: async (url, options) => {
        assert.equal(url.href, link);
        assert.equal(options.redirect, 'manual');
        calls++;
        return Response.redirect('https://map.naver.com/p/entry/place/23456789?lng=127.1352126&lat=37.4959036', 307);
      }
    });
    const result = await lookup(link);
    assert.equal(result.url, link);
    assert.equal(result.name, undefined);
    assert.deepEqual(result.candidates.map(venue => venue.name), ['방문한 가게', '다른 가게']);
    assert.equal(result.candidates[0].address, '서울 송파구 테스트길 18');
    await lookup(link);
    assert.equal(calls, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('map viewport coordinates and untrusted redirects cannot pick a restaurant', async () => {
  let calls = 0;
  const lookup = createPlaceLookup({
    findNearby: () => assert.fail('Unexpected coordinate lookup'),
    fetchLink: async () => { calls++; return Response.redirect('https://example.org/place/12345', 307); }
  });
  await assert.rejects(lookup('https://map.naver.com/p/entry/place/12345?c=127.1352,37.4959,15,0,0,0'), { status: 422 });
  assert.equal(calls, 0);
  await assert.rejects(lookup('https://naver.me/Unsafe'), { status: 400 });
  assert.equal(calls, 1);
});
