
const TONE_RULES = Object.freeze({
  friendly: '친근한 존댓말: ~했어요, ~더라고요처럼 편하게 이야기한다. 웃음 표현과 이모지는 과하게 쓰지 않는다.',
  calm: '담백한 기록체: ~했습니다, ~이었습니다처럼 차분한 존댓말로 쓴다. 이모지와 웃음 표현을 넣지 않는다.',
  concise: '짧고 핵심적인 존댓말: 한 문장에 한 가지 내용만 간결하게 쓴다. 이모지와 웃음 표현을 넣지 않으며 분량을 억지로 늘리지 않는다.'
});
export function normalizeTone(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TONE_RULES, value) ? value : 'friendly';
}
export function toneInstruction(value) {
  return '선택한 말투 규칙(앞의 예시 문체와 다르면 이 규칙을 우선): ' + TONE_RULES[normalizeTone(value)] + ' 말투만 바꾸고 사용자 입력의 사실·맛 평가·동행인·재방문 의향은 바꾸거나 추가하지 않는다.';
}

export function validatePlaceUrl(raw) {
  const url = new URL(raw);
  const hosts = ['naver.me', 'map.naver.com', 'place.naver.com', 'm.place.naver.com', 'pcmap.place.naver.com'];
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('네이버 지도·플레이스의 HTTPS 주소를 넣어주세요.');
  }
  return url;
}

export function createAiLimiter({dailyLimit=100,minuteLimit=10,concurrency=2,now=Date.now}={}) {
  let day='', count=0, active=0, recent=[];
  return {
    acquire() {
      const time=now();const today=new Date(time).toISOString().slice(0,10);
      if(today!==day) { day=today;count=0; }
      recent=recent.filter(t=>time-t<60000);
      if(count>=dailyLimit) throw new Error('오늘의 AI 작성 횟수를 모두 사용했어요. 방문 메모 모드는 계속 이용할 수 있어요.');
      if(active>=concurrency || recent.length>=minuteLimit) throw new Error('현재 AI 작성 요청이 많아요. 잠시 뒤 다시 시도해주세요.');
      active++;count++;recent.push(time);let released=false;
      return ()=>{if(!released){active--;released=true;}};
    }
  };
}

export function validateDraft(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('입력 형식이 올바르지 않습니다.');
  const limits = { name: 100, region: 100, url: 2048, address: 500, hours: 500, parking: 500, menu: 2000, visit: 3000, good: 4000, bad: 2000, companion: 100, disclosure: 200, keywords: 500, highlight: 300, relatedUrl: 2048 };
  const out = {};
  for (const [key, limit] of Object.entries(limits)) {
    out[key] = typeof data[key] === 'string' ? data[key].trim() : '';
    if (out[key].length > limit) throw new Error('입력 내용이 너무 깁니다: ' + key);
  }
  if (!out.name) throw new Error('가게 이름을 입력해주세요.');
  if (!out.good && !out.visit) throw new Error('방문 계기나 좋았던 점을 한 가지 이상 적어주세요.');
  out.template = data.template === 'calm' ? 'calm' : 'warm';
  out.tone = normalizeTone(data.tone);
  if (out.relatedUrl) {
    let url; try { url=new URL(out.relatedUrl); } catch { throw new Error('관련 글은 네이버 블로그의 HTTPS 주소로 입력해주세요.'); }
    if(url.protocol!=='https:' || !['blog.naver.com','m.blog.naver.com'].includes(url.hostname) || url.username || url.password || (url.port && url.port!=='443')) throw new Error('관련 글은 네이버 블로그의 HTTPS 주소로 입력해주세요.');
    out.relatedUrl=url.href;
  }
  const photos = Array.isArray(data.photos) ? data.photos : [];
  if (photos.length > 20) throw new Error('사진은 최대 20장까지 넣을 수 있어요.');
  out.photos = photos.map(p => {
    const caption = typeof p.caption === 'string' ? p.caption.trim().slice(0, 500) : '';
    const image = typeof p.image === 'string' ? p.image : '';
    if (image && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 2500000)) throw new Error('지원하지 않는 사진 형식 또는 크기입니다.');
    return { caption, image };
  });
  return out;
}

export function placeInfoRows(d) {
  let url='';
  if(d.url) try { url=validatePlaceUrl(d.url).href; } catch {}
  return [['가게 이름',d.name],['주소',d.address],['영업시간',d.hours],['주차',d.parking],['주문 메뉴·가격',d.menu],['네이버 플레이스',url]].filter(([,value])=>value);
}

export function memoDraft(d) {
  const name = d.name;
  const region = d.region ? d.region + ' ' : '';
  const info = [['주소', d.address], ['영업시간', d.hours], ['주차', d.parking], ['주문 메뉴·가격', d.menu]].filter(([,v]) => v).map(([k,v]) => k + ' : ' + v).join('\n');
  const photos = d.photos.map((p, i) => ({ photoIndex: i, heading: '', text: p.caption || '' }));
  const tags = [...new Set([d.region && d.region.replace(/\s/g, '') + '맛집', name.replace(/[^\p{L}\p{N}]/gu, ''), ...d.keywords.split(/[,#\n]+/).map(x => x.replace(/\s/g, ''))].filter(Boolean))].slice(0, 20);
  return {
    titles: [`${region}${name} 방문 후기`, `${region}${name}｜직접 다녀온 솔직 후기`, `${name}, ${d.menu ? d.menu.split(/[\n,]/)[0].slice(0,25) + ' 먹고 온 이야기' : '다녀온 이야기'}`],
    intro: d.visit || `${d.companion ? d.companion + ' 함께 ' : ''}${name}에 ${d.tone === 'calm' ? '다녀왔습니다.' : '다녀왔어요.'}`,
    info,
    infoRows: placeInfoRows(d),
    relatedUrl: d.relatedUrl || '',
    template: d.template || 'warm',
    pullQuote: d.highlight || '',
    sections: [...photos, ...(d.good ? [{ photoIndex: null, heading: '기억에 남았던 점', text: d.good }] : []), ...(d.bad ? [{ photoIndex: null, heading: '조금 아쉬웠던 점', text: d.bad }] : [])],
    closing: d.tone === 'calm' ? `${name} 방문 기록을 마칩니다.` : d.tone === 'concise' ? `${name} 방문 후기예요.` : `${name}에서의 이야기는 여기까지 남겨둘게요 :)`,
    tone: normalizeTone(d.tone),
    hashtags: tags.map(t => '#' + t).join(' '),
    disclosure: d.disclosure,
    mode: 'memo'
  };
}

export function validateResult(r, photoCount) {
  if (!r || !Array.isArray(r.titles) || r.titles.length < 1 || !Array.isArray(r.sections)) throw new Error('AI 응답 형식을 읽지 못했어요. 다시 시도해주세요.');
  const string = (x, max = 20000) => typeof x === 'string' ? x.slice(0,max) : '';
  const sections = r.sections.slice(0,40).map(s => ({ heading: string(s.heading,200), text: string(s.text), caption: string(s.caption,160), photoIndex: Number.isInteger(s.photoIndex) && s.photoIndex >= 0 && s.photoIndex < photoCount ? s.photoIndex : null }));
  const linkedPhotos = new Map();
  for (const section of sections) {
    if (section.photoIndex === null) continue;
    if (linkedPhotos.has(section.photoIndex)) section.photoIndex = null;
    else linkedPhotos.set(section.photoIndex, section);
  }
  const orderedPhotos = Array.from({ length: photoCount }, (_, photoIndex) =>
    linkedPhotos.get(photoIndex) ?? { photoIndex, heading: '', text: '' });
  const linkedIndexes = [...linkedPhotos.keys()].sort((a, b) => a - b);
  let nextPhoto = 0;
  let nextLinked = 0;
  const orderedSections = sections.flatMap(section => {
    if (section.photoIndex === null) return [section];
    // Keep unlinked text in place and add omitted photos before the next linked photo.
    const start = nextPhoto;
    nextPhoto = linkedIndexes[nextLinked++] + 1;
    return orderedPhotos.slice(start, nextPhoto);
  });
  orderedSections.push(...orderedPhotos.slice(nextPhoto));
  return { titles:r.titles.slice(0,3).map(t=>string(t,200)), intro:string(r.intro), info:string(r.info), pullQuote:string(r.pullQuote,300), sections:orderedSections, closing:string(r.closing), hashtags:string(r.hashtags,2000), mode:'ai' };
}

// Public venue details verified against the Naver Place screen on 2026-11-11.
export function verifiedPlace(raw) {
  const url = validatePlaceUrl(raw);
  const path = url.pathname.replace(/\/$/, '');
  const shortLink = url.hostname === 'naver.me' && path === '/FEgq4aSn';
  const mapLink = url.hostname === 'map.naver.com' && /^\/(?:p\/)?entry\/place\/1780441433$/.test(path);
  const detailLink = ['m.place.naver.com','pcmap.place.naver.com','place.naver.com'].includes(url.hostname) &&
    /^\/restaurant\/1780441433(?:\/home)?$/.test(path);
  if (!shortLink && !mapLink && !detailLink) return null;
  return {
    name: '감탄커피앤베이커리 잠실점',
    address: '서울 송파구 올림픽로35가길 11 111호 감탄커피',
    url: 'https://naver.me/FEgq4aSn',
    source: '네이버 플레이스 확인 정보 (2026-11-11)'
  };
}
