
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
  return [['주소',d.address],['영업시간',d.hours],['주차',d.parking],['주문 메뉴·가격',d.menu]].filter(([,value])=>value);
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
  const seen = new Set();
  for (const s of sections) if (s.photoIndex !== null) { if (seen.has(s.photoIndex)) s.photoIndex = null; else seen.add(s.photoIndex); }
  for (let i=0;i<photoCount;i++) if (!seen.has(i)) sections.push({ photoIndex:i, heading:'', text:'' });
  return { titles:r.titles.slice(0,3).map(t=>string(t,200)), intro:string(r.intro), info:string(r.info), pullQuote:string(r.pullQuote,300), sections, closing:string(r.closing), hashtags:string(r.hashtags,2000), mode:'ai' };
}

function decodePlaceText(value) {
  const entities={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(entity,key)=>{
    if(key.startsWith('#')){
      const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
      return n>0&&n<=0x10ffff?String.fromCodePoint(n):entity;
    }
    return entities[key.toLowerCase()]??entity;
  }).replace(/\s+/g,' ').trim();
}
export function placeNameFromHtml(html) {
  const clean=value=>{
    const name=decodePlaceText(value).replace(/\s*[:|｜-]\s*(?:네이버(?:\s*(?:지도|플레이스))?|NAVER)\s*$/i,'').trim();
    return name && name.length<=100 && !/^(?:네이버(?:\s*(?:지도|플레이스|맵))?|NAVER(?:\s*MAP)?|지도|플레이스)$/i.test(name) &&
      !/접근이 제한|페이지를 찾을 수 없|서비스 오류|Access Denied|Forbidden|Not Found/i.test(name) ? name : '';
  };
  const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+))/g)].map(m=>[m[1].toLowerCase(),m[2]??m[3]??m[4]]));
  const meta=new Map();
  for(const [tag] of html.matchAll(/<meta\b[^>]*>/gi)){
    const a=attrs(tag); if(a.content)meta.set((a.property||a.name||'').toLowerCase(),a.content);
  }
  for(const key of ['og:title','twitter:title']){
    const name=clean(meta.get(key)||''); if(name)return name;
  }
  const names=new Set();
  for(const match of html.matchAll(/(<script\b[^>]*>)([\s\S]*?)<\/script\s*>/gi)){
    if(attrs(match[1]).type!=='application/ld+json')continue;
    let data;try{data=JSON.parse(match[2]);}catch{continue;}
    const roots=Array.isArray(data)?data:[data];
    for(const root of roots.flatMap(x=>[x,...(Array.isArray(x?.['@graph'])?x['@graph']:[])])){
      const types=[root?.['@type']].flat();
      if(types.some(t=>typeof t==='string'&&/^(?:https?:\/\/schema\.org\/)?(?:Restaurant|CafeOrCoffeeShop|Bakery|FoodEstablishment|BarOrPub)$/i.test(t))&&typeof root.name==='string'){
        const name=clean(root.name); if(name)names.add(name);
      }
    }
  }
  if(names.size===1)return [...names][0];
  const title=html.match(/<title\b[^>]*>([^<]+)<\/title\s*>/i)?.[1]||'';
  return /[:|｜-]\s*(?:네이버(?:\s*(?:지도|플레이스))?|NAVER)\s*$/i.test(title)?clean(title):'';
}
export function restaurantPlaceFallback(url) {
  if(!['map.naver.com','pcmap.place.naver.com','place.naver.com','m.place.naver.com'].includes(url.hostname))return null;
  const id=url.pathname.match(/(?:^|\/)(?:place|restaurant)\/(\d+)(?:\/|$)/)?.[1];
  if(!id)return null;
  const next=new URL('https://m.place.naver.com/restaurant/'+id+'/home');
  return next.href===url.href?null:next;
}

