import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { validatePlaceUrl, verifiedPlace } from './lib.mjs';

const REDIRECT = new Set([301, 302, 303, 307, 308]);
const SHORT_PATH = /^\/[\da-z]{4,32}\/?$/i;
const NEARBY_METERS = 50;
const CACHE_MS = 30 * 60_000;

function placeError(status, message) {
  return Object.assign(new Error(message), { status });
}

function validateLink(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 2048) throw new Error();
    return validatePlaceUrl(raw.trim());
  } catch {
    throw placeError(400, '네이버 지도에서 매장을 공유한 링크를 넣어주세요.');
  }
}

function placeId(url) {
  if (url.hostname === 'map.naver.com') {
    return url.pathname.match(/^\/(?:p\/)?(?:entry|search\/[^/]+)\/place\/(\d{1,16})\/?$/)?.[1];
  }
  if (url.hostname !== 'naver.me') {
    return url.pathname.match(/^\/[a-z]+\/(\d{1,16})(?:\/|$)/i)?.[1];
  }
}

function placePosition(url) {
  // A viewport center (`c`) is not the position of the selected venue.
  if (url.hostname !== 'map.naver.com' || !placeId(url)) return null;
  const read = key => {
    const values = url.searchParams.getAll(key);
    return values.length === 1 && /^\d{2,3}\.\d{4,12}$/.test(values[0]) ? Number(values[0]) : NaN;
  };
  const lat = read('lat'), lng = read('lng');
  return lat >= 32 && lat <= 40 && lng >= 123 && lng <= 133 ? { lat, lng } : null;
}

export function openShopIndex(filename) {
  let db, query;
  return function findNearby({ lat, lng }) {
    if (!query) {
      if (!existsSync(filename)) return null;
      db = new DatabaseSync(filename, { readOnly: true });
      query = db.prepare('SELECT name, address, region, lat, lng FROM shops WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?');
    }
    const latDegrees = NEARBY_METERS / 110_500;
    const lngDegrees = NEARBY_METERS / (110_500 * Math.cos(lat * Math.PI / 180));
    return query.all(lat - latDegrees, lat + latDegrees, lng - lngDegrees, lng + lngDegrees);
  };
}

export function createPlaceLookup({ findNearby, fetchLink = globalThis.fetch, now = Date.now }) {
  const cache = new Map(), inFlight = new Map();
  let recent = [], cooldownUntil = 0;

  async function resolveShort(original) {
    const key = original.pathname.replace(/\/$/, '');
    const hit = cache.get(key);
    if (hit && hit.until > now()) return hit.url;
    if (inFlight.has(key)) return inFlight.get(key);
    const time = now();
    recent = recent.filter(t => t > time - 60_000);
    if (time < cooldownUntil || inFlight.size >= 4 || recent.length >= 40) {
      throw placeError(503, '공유 링크 조회 요청이 많아요. 잠시 뒤 다시 시도해주세요.');
    }
    recent.push(time);
    const promise = (async () => {
      let url = new URL(key, original.origin);
      const signal = AbortSignal.timeout(12_000);
      for (let i = 0; i < 3; i++) {
        let response;
        try {
          response = await fetchLink(url, { redirect: 'manual', signal });
        } catch {
          throw placeError(503, '공유 링크에 연결하지 못했어요. 잠시 뒤 다시 시도해주세요.');
        }
        const target = response.headers.get('location');
        await response.body?.cancel();
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const delay = /^\d+$/.test(retryAfter || '') ? Number(retryAfter) * 1000 : Date.parse(retryAfter || '') - now();
          cooldownUntil = Math.max(cooldownUntil, now() + (delay > 0 ? delay : 60_000));
          throw placeError(503, '네이버가 공유 링크 조회를 잠시 제한했어요. 잠시 뒤 다시 시도해주세요.');
        }
        if (response.status >= 500) throw placeError(503, '공유 링크에 연결하지 못했어요. 잠시 뒤 다시 시도해주세요.');
        if (!REDIRECT.has(response.status) || !target) break;
        url = validateLink(new URL(target, url).href);
        if (placeId(url)) {
          if (cache.size >= 300) cache.delete(cache.keys().next().value);
          cache.set(key, { url, until: now() + CACHE_MS });
          return url;
        }
        if (url.hostname !== 'naver.me' || !SHORT_PATH.test(url.pathname)) break;
      }
      throw placeError(422, '유효한 매장 공유 링크를 찾지 못했어요. 네이버 지도에서 매장 상세 화면의 공유 링크인지 확인해주세요.');
    })();
    inFlight.set(key, promise);
    try { return await promise; } finally { inFlight.delete(key); }
  }

  return async function lookup(raw) {
    const original = validateLink(raw);
    const saved = verifiedPlace(original.href);
    if (saved) return saved;

    let destination = original;
    if (original.hostname === 'naver.me' && SHORT_PATH.test(original.pathname)) {
      destination = await resolveShort(original);
      const saved = verifiedPlace(destination.href);
      if (saved) return saved;
    }
    if (!placeId(destination)) {
      throw placeError(422, '검색 결과나 지도 링크 대신 매장 상세 화면의 공유 링크를 넣어주세요.');
    }
    const coords = placePosition(destination);
    if (!coords) {
      throw placeError(422, '이 링크에는 매장 위치가 없어요. 네이버 지도에서 매장 상세를 열고 공유 링크를 복사해 주세요.');
    }
    let nearby;
    try {
      nearby = findNearby(coords);
    } catch (err) {
      console.error('공공 매장 데이터 읽기 실패:', err.code || err.name);
    }
    if (!nearby) throw placeError(503, '공공 매장 데이터에 연결하지 못했어요. 잠시 뒤 다시 시도해주세요.');

    const cos = Math.cos(coords.lat * Math.PI / 180);
    const seen = new Set();
    const candidates = nearby
      .map(({ name, address, region, lat, lng }) => ({
        name, address, region,
        distance: Math.hypot(lat - coords.lat, (lng - coords.lng) * cos) * 111_195
      }))
      .filter(item => item.distance <= NEARBY_METERS)
      .sort((a, b) => a.distance - b.distance)
      .filter(({ name, address }) => {
        const key = name + '\n' + address;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8)
      .map(item => ({ ...item, distance: Math.round(item.distance) }));
    if (!candidates.length) {
      throw placeError(404, '이 링크의 위치 근처에서 등록된 매장을 찾지 못했어요.');
    }
    // A nearby record is not an ID match. Only a user choice can apply it to the draft.
    return { url: original.href, source: '행정안전부 음식점 인허가 공공데이터', candidates };
  };
}
