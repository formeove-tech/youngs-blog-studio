import { articleText, clipboardHtml, pngBlob, zipFiles, splitClipboardArticle } from './export.js';
import { checklistItems, evaluateChecklist } from './naver-checklist.js';
import { photoTime } from './photo-time.js';
import { articleTypography, loadArticleFonts, styleExportedArticle } from './typography.js';
const $ = s => document.querySelector(s);
const form = $('#draft-form');
const placeHelp = '네이버 지도 공유 링크를 붙여넣으세요. 같은 위치에 등록된 매장이 있으면 선택할 수 있어요.';
const newPlaceKey = 'youngs:next-place:';
let appliedPlace = null;
let photos = [];
let photoOrderEdited = false;
let draft = null;
let outputPhotos = [];
let busy = false;
let toastTimer;
let serverAi = false;
const manualChecks = new Set();
function toast(message, error = false) {
  $('#toast').textContent = message;
  $('#toast').className = 'toast show' + (error ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500);
}
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function editable(tag, cls, text, placeholder = '') {
  const node = el(tag, cls, text);
  node.contentEditable = 'true';
  node.dataset.placeholder = placeholder;
  node.setAttribute('role', 'textbox');
  node.setAttribute('aria-label', placeholder || (tag === 'h1' ? '글 제목 수정' : '본문 수정'));
  node.addEventListener('paste', event => {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const inserted = document.createTextNode(text);
    range.insertNode(inserted);
    range.setStartAfter(inserted); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
  });
  return node;
}
function movePhoto(from, to) {
  [photos[from], photos[to]] = [photos[to], photos[from]];
  photoOrderEdited = true;
  renderPhotos();
}
function renderPhotos() {
  $('#photo-count').textContent = `${photos.length} / 20`;
  $('#photo-list').replaceChildren();
  photos.forEach((p, i) => {
    const card = el('div', 'photo-item');
    const top = el('div', 'photo-top');
    const img = el('img'); img.src = p.image; img.alt = p.caption || `방문 사진 ${i + 1}`;
    const controls = el('div', 'photo-controls');
    for (const [text, title, action, disabled] of [
      ['←', '사진 앞으로 이동', () => movePhoto(i, i - 1), i === 0],
      ['→', '사진 뒤로 이동', () => movePhoto(i, i + 1), i === photos.length - 1],
      ['×', '사진 삭제', () => {
        photos.splice(i, 1);
        if (photos.length <= 1) photoOrderEdited = false;
        renderPhotos();
      }, false]
    ]) {
      const b = el('button', '', text); b.type = 'button'; b.title = title; b.setAttribute('aria-label', `${i + 1}번 ${title}`); b.disabled = disabled; b.onclick = action; controls.append(b);
    }
    top.append(img, el('span', 'photo-index', String(i + 1).padStart(2, '0')), controls);
    const caption = el('textarea'); caption.rows = 2; caption.maxLength = 500; caption.placeholder = '사진 설명 · 여기서 기억나는 이야기'; caption.value = p.caption;
    caption.setAttribute('aria-label', `${i + 1}번 사진 설명`);
    caption.oninput = () => { p.caption = caption.value; };
    card.append(top, caption); $('#photo-list').append(card);
  });
}
async function imageData(file) {
  if (!/\.(jpe?g|png|webp)$/i.test(file.name) && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WEBP 사진을 넣어주세요. HEIC는 JPG로 변환한 뒤 추가해주세요.');
  if (file.size > 20 * 1024 * 1024) throw new Error('장당 20MB 이하의 사진을 넣어주세요.');
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = objectUrl; await img.decode();
    if (!img.width || !img.height) throw new Error('사진을 읽지 못했어요.');
    const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.84);
  } finally { URL.revokeObjectURL(objectUrl); }
}
let importing = false;
const comparePhotoTimes = (a, b) => (a.time ?? Infinity) - (b.time ?? Infinity);
async function addPhotos(files) {
  if (importing || busy) return toast('진행 중인 작업이 끝나면 사진을 추가해주세요.');
  if (!files.length) return;
  importing = true;
  const generate = $('#generate');
  generate.disabled = true;
  try {
    const { added, errors } = await readPhotos(files, 20 - photos.length);
    photos.push(...added);
    if (!photoOrderEdited) photos.sort(comparePhotoTimes);
    renderPhotos();
    $('#photo-status').textContent = photoSummary(added, errors);
  } finally {
    importing = false;
    generate.disabled = false;
    $('#photos').value = '';
  }
}
async function readPhotos(files, slots) {
  const added = [], errors = [];
  for (const file of files) {
    if (added.length >= slots) { errors.push('사진은 최대 20장까지 등록할 수 있어요.'); break; }
    try { added.push({ image: await imageData(file), caption: '', time: await photoTime(file) }); }
    catch (e) { errors.push(file.name + ': ' + (e.message || '사진을 읽을 수 없어요.')); }
  }
  return { added: added.sort(comparePhotoTimes), errors };
}
function photoSummary(added, errors) {
  return [added.length ? `${added.length}장 추가했어요.` : '', ...errors].filter(Boolean).join(' ');
}
$('#photos').onchange = event => addPhotos([...event.target.files]);
for (const name of ['dragenter', 'dragover']) $('#dropzone').addEventListener(name, event => { event.preventDefault(); $('#dropzone').classList.add('dragging'); });
for (const name of ['dragleave', 'drop']) $('#dropzone').addEventListener(name, event => { event.preventDefault(); $('#dropzone').classList.remove('dragging'); });
$('#dropzone').addEventListener('drop', event => addPhotos([...event.dataTransfer.files]));
$('#dropzone').tabIndex = 0;
$('#dropzone').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#photos').click(); } });

async function api(url, data) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  let result;
  try { result = await response.json(); } catch { throw new Error('응답을 읽지 못했어요. 앱 서버 실행 상태를 확인해주세요.'); }
  if (!response.ok) throw new Error(result.error || '요청에 실패했어요.');
  return result;
}
function applyImportedPlace(result) {
  if (busy || importing) throw new Error('글 작성이나 사진 등록이 끝난 뒤 다시 불러와 주세요.');
  const name = typeof result?.name === 'string' ? result.name.trim().slice(0, 100) : '';
  if (!name) throw new Error('가게 이름을 확인하지 못했어요.');
  const url = result.url ? new URL(result.url) : null;
  if (url && (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
    !['naver.me','map.naver.com','place.naver.com','m.place.naver.com','pcmap.place.naver.com'].includes(url.hostname)))
    throw new Error('네이버 플레이스 주소만 가져올 수 있어요.');
  const article = $('#article');
  const table = draft ? article.querySelector(':scope > .post-table') : null;
  const tableValue = label => [...(table?.rows || [])].find(row => row.cells[0]?.textContent === label)?.cells[1]?.textContent.trim();
  const otherName = [tableValue('가게 이름'), $('#name').value.trim()].find(value => value && value.replace(/\s+/g, '') !== name.replace(/\s+/g, ''));
  if (otherName) {
    // A new link must not become the old draft's link if the author continues writing there.
    $('#place-url').value = tableValue('네이버 플레이스') || (appliedPlace?.name === otherName ? appliedPlace.url : '');
    showPlaceConflict(otherName, { ...result, name, url: url?.href || '' });
    return false;
  }
  $('#name').value ||= name;
  if (!$('#region').value.trim() && typeof result.region === 'string') $('#region').value = result.region.trim().slice(0, 100);
  if (url) {
    $('#place-url').value = url.href;
    appliedPlace = { name, url: url.href };
  }
  const rows = [['가게 이름', name]];
  for (const [key, label] of [['address','주소'],['hours','영업시간'],['parking','주차']]) {
    const field = $('#' + key);
    const value = typeof result[key] === 'string' ? result[key].trim().slice(0, 500) : '';
    if (!field.value.trim() && value) field.value = value;
    if (field.value.trim()) rows.push([label, field.value.trim()]);
  }
  if (url) rows.push(['네이버 플레이스', url.href]);
  if (draft) {
    const existing = table || el('table', 'post-table');
    if (!table) article.querySelector('h1').after(el('h2', '', '매장 정보'), existing);
    const body = existing.tBodies[0] || existing.createTBody();
    for (const [label, value] of rows) {
      const row = [...existing.rows].find(row => row.cells[0]?.textContent === label);
      if (row) {
        if (row.cells[1] && !row.cells[1].textContent.trim()) row.cells[1].textContent = value;
      } else {
        const next = el('tr'); next.append(el('th', '', label), editable('td', '', value, label + ' 수정')); body.append(next);
      }
    }
    $('#copy-parts')?.remove();
    updateChecklist();
  }
  $('#place-status').className = 'field-help';
  clearPlaceOptions();
  $('#place-status').textContent = draft ? name + ' · 매장 정보를 현재 글에 반영했어요.' : name + ' · 글을 만들 때 매장 정보에 자동으로 들어가요.';
  return true;
}
$('#read-place-image').onclick = async () => {
  const picker = $('#place-image-file');
  const file = picker.files[0];
  if (!file) return toast('플레이스 화면 캡처를 먼저 선택해주세요.', true);
  const button = $('#read-place-image');
  const url = $('#place-url').value.trim();
  const startingDraft = draft;
  const startingName = $('#name').value;
  button.disabled = true;
  $('#place-status').className = 'field-help';
  $('#place-status').textContent = '캡처에서 가게 정보를 읽고 있어요…';
  try {
    const result = await api('/api/place-image', { image: await imageData(file) });
    if (picker.files[0] !== file || draft !== startingDraft || $('#name').value !== startingName || $('#place-url').value.trim() !== url) {
      $('#place-status').textContent = '작성 중인 가게 정보가 바뀌었어요. 캡처 읽기를 다시 눌러주세요.';
      return;
    }
    if (applyImportedPlace({...result,url})) $('#place-status').textContent += ' 캡처에서 읽은 주소와 영업시간은 게시 전에 확인해주세요.';
  } catch (e) {
    $('#place-status').className = 'field-help error';
    $('#place-status').textContent = e.message;
  } finally { button.disabled = false; }
};
$('#apply-place-text').onclick = () => {
  try {
    const info = {};
    const fields = new Map([['가게 이름','name'],['주소','address'],['영업시간','hours'],['주차','parking'],['네이버 플레이스','url']]);
    const lines = $('#place-text').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
      const labeled = line.match(/^([^:：]+)[:：]\s*(.+)$/);
      if (labeled && fields.has(labeled[1].trim())) info[fields.get(labeled[1].trim())] = labeled[2].trim();
      else if (/^https:\/\//i.test(line)) info.url ||= line;
    }
    info.name ||= lines.find(line => !/^https?:\/\//i.test(line) && !/^(주소|영업시간|주차|네이버 플레이스)\s*[:：]/.test(line));
    info.url ||= $('#place-url').value.trim();
    applyImportedPlace(info);
  } catch (e) {
    $('#place-status').className = 'field-help error';
    $('#place-status').textContent = e.message;
  }
};
let placeRequest = 0;
function clearPlaceOptions() {
  const list = $('#place-options');
  list.hidden = true;
  list.replaceChildren();
}
function showPlaceConflict(currentName, nextPlace) {
  clearPlaceOptions();
  $('#place-status').className = 'field-help';
  $('#place-status').textContent = currentName + ' 글은 이 탭에 그대로 있어요.';
  const target = new URL(location.pathname, location.origin);
  const params = new URLSearchParams();
  if (nextPlace.url) params.set('place', nextPlace.url);
  target.hash = params.toString();
  const open = el('a', 'place-open-new', '새 글에서 이 매장 쓰기 ↗');
  open.href = target.href;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.onclick = () => {
    try {
      const id = crypto.randomUUID();
      const key = newPlaceKey + id;
      const expires = Date.now() + 120_000;
      localStorage.setItem(key, JSON.stringify({ place: nextPlace, expires }));
      const handoff = new URL(target);
      const route = new URLSearchParams(target.hash.slice(1));
      route.set('new-place', id);
      handoff.hash = route.toString();
      open.href = handoff.href;
      setTimeout(() => {
        try { localStorage.removeItem(key); } catch {}
        if (open.href === handoff.href) open.href = target.href;
      }, 120_000);
    } catch {
      // If storage is disabled, the new tab can look up its place link directly.
      open.href = target.href;
    }
  };
  const card = el('div', 'place-conflict');
  card.append(el('strong', '', nextPlace.name));
  if (nextPlace.address) card.append(el('span', '', nextPlace.address));
  card.append(open);
  const list = $('#place-options');
  list.append(card);
  list.hidden = false;
}
function openPlaceFromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const id = params.get('new-place');
  const link = params.get('place');
  if (!id && !link) return;
  history.replaceState(history.state, '', location.pathname + location.search);
  if (id && /^[\da-f-]{36}$/i.test(id)) {
    try {
      const key = newPlaceKey + id;
      const stored = localStorage.getItem(key);
      localStorage.removeItem(key);
      const pending = JSON.parse(stored);
      if (pending?.expires > Date.now() && applyImportedPlace(pending.place)) return;
    } catch {}
  }
  if (link && link.length <= 2048) {
    $('#place-url').value = link;
    lookupPlace();
  }
}
function showPlaceOptions(result, request, url) {
  const list = $('#place-options');
  $('#place-status').textContent = '링크 근처에 등록된 매장이에요. 다녀온 매장을 선택하면 이름과 주소가 글에 들어가요.';
  for (const candidate of result.candidates) {
    const option = el('button', 'place-option');
    option.type = 'button';
    option.append(el('strong', '', candidate.name), el('span', '', candidate.address));
    option.onclick = () => {
      if (request !== placeRequest || $('#place-url').value.trim() !== url) return;
      try {
        applyImportedPlace({ ...candidate, url: result.url });
      } catch (error) {
        $('#place-status').className = 'field-help error';
        $('#place-status').textContent = error.message;
      }
    };
    list.append(option);
  }
  list.append(el('p', 'field-help', '출처: ' + result.source + ' · 이름은 인허가 기록 기준이에요.'));
  list.hidden = false;
}
async function lookupPlace() {
  const url = $('#place-url').value.trim();
  if (!url) return toast('플레이스 주소를 먼저 넣어주세요.', true);
  const request = ++placeRequest;
  const button = $('#fetch-place'); button.disabled = true; button.textContent = '확인 중…';
  clearPlaceOptions();
  $('#place-status').className = 'field-help';
  $('#place-status').textContent = '공유 링크에 있는 위치를 확인하고 있어요…';
  try {
    const result = await api('/api/place', { url });
    if (request !== placeRequest || $('#place-url').value.trim() !== url) return;
    if (result.candidates?.length) showPlaceOptions(result, request, url);
    else applyImportedPlace(result);
  } catch (e) {
    if (request !== placeRequest || $('#place-url').value.trim() !== url) return;
    $('#place-status').className = 'field-help error';
    $('#place-status').replaceChildren(document.createTextNode(e.message + ' '));
    try {
      const link = new URL(url);
      if (link.protocol === 'https:' && !link.username && !link.password && ['naver.me','map.naver.com','m.place.naver.com','place.naver.com','pcmap.place.naver.com'].includes(link.hostname)) {
        const open = el('a', '', '네이버 플레이스 열기 ↗'); open.href = link.href; open.target = '_blank'; open.rel = 'noopener noreferrer'; $('#place-status').append(open);
      }
    } catch {}
  } finally { if (request === placeRequest) { button.disabled = false; button.textContent = '불러오기 ↗'; } }
}
$('#fetch-place').onclick = lookupPlace;
$('#place-url').addEventListener('input', () => {
  clearPlaceOptions();
  $('#place-status').className = 'field-help';
  $('#place-status').textContent = placeHelp;
});
$('#place-url').addEventListener('paste', () => setTimeout(() => {
  try {
    const url = new URL($('#place-url').value.trim());
    if (url.protocol === 'https:' && !url.username && !url.password &&
        ['naver.me','map.naver.com','place.naver.com','pcmap.place.naver.com','m.place.naver.com'].includes(url.hostname)) lookupPlace();
  } catch {}
}, 0));
form.addEventListener('change', event => {
  if (event.target.name === 'mode') $('#ai-settings').hidden = event.target.value !== 'ai';
});
$('#sponsorship').onchange = () => {
  const choice = $('#sponsorship').value;
  $('#disclosure-wrap').hidden = choice === 'none';
  $('#disclosure').value = choice === 'self' ? '직접 결제하고 다녀온 후기입니다.' : '';
};
function setFontStyle(value) {
  const typography = articleTypography(value);
  const key = typography ? value : 'default';
  $('#font-style').value = key;
  $('#article').dataset.fontStyle = key;
  const previewStyle = $('#preview').style;
  previewStyle.setProperty('--article-body-font', typography?.body ?? '');
  previewStyle.setProperty('--article-heading-font', typography?.heading ?? '');
  previewStyle.setProperty('--article-heading-weight', typography?.weight ?? '');
  if (typography?.webFont) loadArticleFonts(document);
  $('#copy-parts')?.remove();
}
$('#font-style').onchange = event => setFontStyle(event.target.value);
setFontStyle($('#font-style').value);

function renderDraft(data) {
  $('#copy-parts')?.remove();
  const article = $('#article'); article.replaceChildren(); article.hidden = false; $('#empty-preview').hidden = true;
  article.dataset.template = data.template === 'calm' ? 'calm' : 'warm';
  $('#draft-mode').textContent = data.mode === 'ai' ? 'AI 방문기' : '메모 초안';
  if (data.mode === 'memo') article.append(el('div', 'generation-warning export-ignore', '입력한 메모로 구성한 초안이에요. 사진을 분석하거나 AI로 문장을 다듬지는 않았어요. 글을 클릭해 수정해보세요.'));
  const chooser = el('div', 'title-options export-ignore'); chooser.append(el('span', '', '마음에 드는 제목을 골라보세요'));
  const heading = editable('h1', '', data.titles[0]);
  data.titles.forEach((title, i) => {
    const button = el('button', i === 0 ? 'selected' : '', title); button.type = 'button';
    button.onclick = () => { heading.textContent = title; chooser.querySelectorAll('button').forEach(b => b.classList.remove('selected')); button.classList.add('selected'); updateChecklist(); };
    chooser.append(button);
  });
  article.append(chooser);
  if (data.disclosure) article.append(editable('p', 'post-disclosure', data.disclosure));
  article.append(el('div', 'post-label export-ignore', 'YOUNG’S VISIT DIARY'), heading, editable('p', '', data.intro, '방문 계기를 적어주세요.'));
  if (data.pullQuote) article.append(editable('blockquote', 'post-quote', data.pullQuote, '이날의 한 줄 감상'));
  if (data.infoRows?.length) {
    const table = el('table', 'post-table'); const body = el('tbody');
    for (const [label, value] of data.infoRows) {
      const row = el('tr'); row.append(el('th', '', label), editable('td', '', value, label + ' 수정')); body.append(row);
    }
    table.append(body);
    article.append(el('hr', 'post-divider'), editable('h2', '', '방문 전에 알아두면 좋은 것들'), table, el('hr', 'post-divider'));
  } else if (data.info) article.append(editable('p', 'post-info', data.info));
  for (const section of data.sections) {
    if (section.heading) article.append(editable('h2', '', section.heading));
    if (Number.isInteger(section.photoIndex) && outputPhotos[section.photoIndex]) {
      const img = el('img'); img.src = outputPhotos[section.photoIndex].image; img.alt = outputPhotos[section.photoIndex].caption || `방문 사진 ${section.photoIndex + 1}`; article.append(img);
      img.addEventListener('load', updateChecklist, { once: true });
      if (section.caption) article.append(editable('p', 'photo-caption', section.caption, '사진 한 줄 설명'));
      article.append(photoActions(img));
    }
    article.append(editable('p', '', section.text, '이 사진에 담긴 이야기를 적어주세요.'));
  }
  article.append(el('hr', 'post-divider'), editable('h2', '', data.template === 'calm' ? '짧은 총평' : '이날의 기록을 마치며'), editable('p', '', data.closing));
  if (data.relatedUrl) {
    const related = el('p', 'post-related'); const link = el('a', '', '함께 읽으면 좋은 방문기'); link.href = data.relatedUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; related.append(link); article.append(related);
  }
  article.append(editable('p', 'post-tags', data.hashtags, '#해시태그'));
  $('#copy-naver').disabled = false; $('#add-divider').disabled = false; $('#add-draft-photo').disabled = false; $('#draft-edit-status').textContent = ''; $('#copy').disabled = false; $('#download').disabled = false; $('#photo-zip').disabled = outputPhotos.length === 0;
  manualChecks.clear(); updateChecklist();
}
function updateChecklist() {
  if (!draft) return;
  const article = exportArticle();
  const body = article.cloneNode(true); body.querySelectorAll('h1,.post-tags,.post-disclosure').forEach(node => node.remove());
  const results = evaluateChecklist({
    title: article.querySelector('h1')?.textContent || '', body: body.textContent,
    photoWidths: [...$('#article').querySelectorAll('img')].map(img => img.naturalWidth),
    links: article.querySelectorAll('.post-related a').length,
    symbols: /[♡♥★☆✦✧→※◆▶☺✳]/u.test(article.textContent),
    dividers: article.querySelectorAll('hr').length, quote: article.querySelector('blockquote')?.textContent || '',
    tables: article.querySelectorAll('table').length, tags: article.querySelector('.post-tags')?.textContent || ''
  });
  $('#posting-checklist').hidden = false;
  const basic = ['title', 'body', 'photos'];
  $('#basic-count').textContent = `기본 ${basic.filter(key => results[key].done).length}/3`;
  $('#length-status').textContent = results.body.detail + (results.body.done ? ' · 분량 기준 충족' : ' · 분량을 채우려면 실제 방문 경험을 더 적어주세요.');
  $('#basic-checks').replaceChildren(); $('#extra-checks').replaceChildren();
  for (const [key, label, type, help] of checklistItems) {
    const row = el('div', 'check-row'); const title = el('span', 'check-name', label); const detail = el('small', '', help);
    if (type === 'auto') {
      const result = results[key]; row.classList.toggle('done', result.done);
      const state = el('span', 'check-state', result.done ? '확인' : basic.includes(key) ? '보완' : '선택');
      row.append(title, state, el('small', '', result.detail + ' · ' + help));
    } else {
      const box = el('input'); box.type = 'checkbox'; box.checked = manualChecks.has(key); box.setAttribute('aria-label', label + ' 네이버에서 확인 완료');
      box.onchange = () => { box.checked ? manualChecks.add(key) : manualChecks.delete(key); };
      const wrap = el('label', 'manual-check'); wrap.append(box, document.createTextNode(label)); row.append(wrap, el('span', 'check-state', '네이버에서 확인'), detail);
    }
    (basic.includes(key) ? $('#basic-checks') : $('#extra-checks')).append(row);
  }
}
let checklistTimer;
$('#article').addEventListener('input', () => { $('#copy-parts')?.remove(); clearTimeout(checklistTimer); checklistTimer = setTimeout(updateChecklist, 150); });
form.onsubmit = async event => {
  event.preventDefault();
  if (busy || importing) return;
  const data = Object.fromEntries(new FormData(form));
  data.photos = photos.map(({ caption, image }) => ({ caption, image: data.mode === 'ai' ? image : '' }));
  data.disclosure = $('#sponsorship').value === 'none' ? '' : $('#disclosure').value.trim();
  if (!data.visit.trim() && !data.good.trim()) { $('#visit').focus(); return toast('방문 계기나 좋았던 점을 한 가지 적어주세요.', true); }
  if ($('#sponsorship').value === 'sponsored' && !data.disclosure) { $('#disclosure').focus(); return toast('실제 제공받은 내용을 표시할 문구를 입력해주세요.', true); }
  if (data.mode === 'ai') {
    if (!serverAi) return toast('운영자가 AI 연결을 준비 중이에요. 방문 메모 모드를 이용해주세요.', true);
  }
  if (draft && !confirm('새 초안을 만들면 미리보기에서 수정한 글이 바뀝니다. 새로 만들까요?')) return;
  busy = true;
  const snapshot = photos.map(p => ({ ...p }));
  const fieldsets = [...form.querySelectorAll('input,textarea,select,button')];
  const before = fieldsets.map(n => n.disabled); fieldsets.forEach(n => n.disabled = true);
  $('#generate').textContent = data.mode === 'ai' ? '✧ 사진과 메모로 방문기를 쓰고 있어요…' : '✧ 방문 기록을 모으고 있어요…';
  try {
    const result = await api('/api/generate', data);
    outputPhotos = snapshot; draft = result; renderDraft(result);
    document.querySelectorAll('.step').forEach(s => s.classList.add('current'));
    toast('방문기 초안을 만들었어요. 글을 눌러 자유롭게 수정해보세요.');
    if (window.innerWidth <= 660) document.querySelector('.preview-column').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { toast(e.message === 'Failed to fetch' ? '앱 서버에 연결하지 못했어요. 실행 상태를 확인해주세요.' : e.message, true); }
  finally {
    busy = false; fieldsets.forEach((n, i) => n.disabled = before[i]);
    $('#generate').replaceChildren(el('span', '', '✧'), document.createTextNode(' 방문기 초안 만들기 '), el('span', '', '→'));
  }
};
function exportArticle() {
  const copy = $('#article').cloneNode(true);
  const originals = [...$('#article').querySelectorAll('[contenteditable]')];
  copy.querySelectorAll('[contenteditable]').forEach((node, i) => { node.textContent = originals[i].innerText; });
  copy.querySelectorAll('.export-ignore').forEach(n => n.remove());
  copy.querySelectorAll('[contenteditable]').forEach(n => { n.removeAttribute('contenteditable'); n.removeAttribute('role'); n.removeAttribute('aria-label'); n.removeAttribute('data-placeholder'); });
  return copy;
}
function showCopyParts(parts) {
  let panel = $('#copy-parts');
  if (!panel) {
    panel = el('div', 'card'); panel.id = 'copy-parts';
    panel.setAttribute('aria-live', 'polite');
    $('.preview-toolbar').after(panel);
  }
  panel.replaceChildren(el('p', '', `사진을 포함한 글을 ${parts.length}개로 나눴어요. 아래 순서대로 복사해 네이버 본문 끝에 붙여넣으세요. 사진이 빠지면 사진 ZIP으로 업로드해주세요.`));
  parts.forEach((part, i) => {
    const button = el('button', '', `${i + 1}/${parts.length} 복사 · ${(new Blob([clipboardHtml(part)]).size / 1_000_000).toFixed(2)}MB`);
    button.type = 'button';
    button.onclick = () => writeArticleClipboard(part).then(() => {
      button.textContent = `${i + 1}/${parts.length} 복사됨 · 네이버에 붙여넣으세요`;
    }).catch(e => toast(e.message, true));
    panel.append(button);
  });
}
async function writeArticleClipboard(copy) {
  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([clipboardHtml(copy)], { type: 'text/html' }),
      'text/plain': new Blob([articleText(copy)], { type: 'text/plain' })
    })]);
    toast('복사했어요. 네이버에서 사진이 빠지면 사진 ZIP을 받아 사진 메뉴로 첨부해주세요.');
  } else {
    await navigator.clipboard.writeText(articleText(copy));
    toast('이 브라우저에서는 글만 복사돼요. 사진 ZIP으로 업로드해주세요.');
  }
}
$('#copy').onclick = async () => {
  try {
    const parts = splitClipboardArticle(exportArticle());
    if (parts.length > 1) {
      showCopyParts(parts);
      toast(`복사 용량이 커서 ${parts.length}개로 나눴어요. 순서대로 복사해주세요.`);
      return;
    }
    $('#copy-parts')?.remove();
    if (parts.length) await writeArticleClipboard(parts[0]);
  } catch (e) { toast(e.message || '복사에 실패했어요. 사진 ZIP 저장을 이용해주세요.', true); }
};
$('#photo-zip').onclick = () => {
  const article = exportArticle();
  const files = [...article.querySelectorAll('img')].map((img, i) => ({
    name: `${String(i + 1).padStart(2, '0')}.${img.src.startsWith('data:image/png;') ? 'png' : img.src.startsWith('data:image/webp;') ? 'webp' : 'jpg'}`,
    bytes: Uint8Array.from(atob(img.src.split(',')[1]), c => c.charCodeAt(0))
  }));
  files.push({ name: 'blog-text.txt', bytes: new TextEncoder().encode(articleText(article, true)) });
  files.push({ name: 'naver-guide.txt', bytes: new TextEncoder().encode([...$('.naver-guide').querySelectorAll('summary,li,p')].map(node => node.textContent).join('\n\n')) });
  files.push({ name: 'posting-checklist.txt', bytes: new TextEncoder().encode(checklistItems.map(([, label,, help], i) => `${i + 1}. ${label}\n${help}`).join('\n\n')) });
  const blob = zipFiles(files); const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = 'youngs-blog-photos.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast('사진과 사진 위치가 표시된 글을 ZIP으로 저장했어요. 압축을 풀어 블로그에 사진을 업로드하세요.');
};
$('#download').onclick = () => {
  const copy = exportArticle();
  const title = copy.querySelector('h1')?.textContent || '영쓰의 방문기';
  const doc = document.implementation.createHTMLDocument(title); doc.documentElement.lang = 'ko';
  const charset = doc.createElement('meta'); charset.setAttribute('charset', 'utf-8'); doc.head.prepend(charset);
  const viewport = doc.createElement('meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width,initial-scale=1'; doc.head.append(viewport);
  const css = doc.createElement('style'); css.textContent = 'body{max-width:760px;margin:40px auto;padding:0 22px;font-family:system-ui,sans-serif;color:#303b30;line-height:2}img{width:100%;height:auto;margin:20px 0}p,blockquote{white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:26px;line-height:1.6}h2{font-size:19px;margin-top:35px}.post-info{padding:20px;background:#f3f6ed}.post-tags{color:#547448}.post-disclosure{font-size:12px;color:#777}.post-quote{margin:35px 0;padding:18px 24px;border-left:3px solid #9eae8d;background:#f8f8f3;font-size:18px}.post-divider{border:0;border-top:1px solid #dfe5d7;margin:36px auto;width:70%}.photo-caption{color:#7b8374;font-size:12px;text-align:center}[data-template=warm]>h1{text-align:center}[data-template=warm]>.post-quote{text-align:center;border-left:0;border-top:1px solid #dfe5d7;border-bottom:1px solid #dfe5d7}'; css.textContent += 'table{border-collapse:collapse;width:100%;margin:20px 0}th,td{border:1px solid #dfe5d7;padding:12px;white-space:pre-wrap;text-align:left;vertical-align:top}th{background:#f3f6ed;font-weight:600}'; doc.head.append(css);
  if (articleTypography(copy.dataset.fontStyle)?.webFont) loadArticleFonts(doc);
  styleExportedArticle(copy);
  doc.body.append(copy);
  const blob = new Blob(['<!doctype html>\n' + doc.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = title.replace(/[\\/:*?"<>|]/g, '').slice(0, 70) + '.html'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast('사진과 수정한 글을 HTML 파일로 저장했어요.');
};
$('#reset').onclick = () => {
  if (busy || importing) return toast('진행 중인 작업이 끝나면 다시 시도해주세요.');
  if (!confirm('입력한 내용과 사진, 작성한 초안을 모두 지울까요?')) return;
  photos = []; photoOrderEdited = false; outputPhotos = []; draft = null; appliedPlace = null; form.reset(); renderPhotos();
  setFontStyle('default');
  $('#article').replaceChildren(); $('#article').hidden = true; $('#empty-preview').hidden = false;
  $('#posting-checklist').hidden = true; manualChecks.clear();
  $('#ai-settings').hidden = true; $('#disclosure-wrap').hidden = true; $('#copy-naver').disabled = true; $('#add-divider').disabled = true; $('#add-draft-photo').disabled = true; $('#draft-edit-status').textContent = ''; $('#copy').disabled = true; $('#download').disabled = true; $('#photo-zip').disabled = true;
  clearPlaceOptions();
  $('#draft-mode').textContent = '미리보기'; $('#photo-status').textContent = ''; $('#place-status').className = 'field-help'; $('#place-status').textContent = placeHelp;
  document.querySelectorAll('.step').forEach((s, i) => s.classList.toggle('current', i === 0)); window.scrollTo({ top: 0, behavior: 'smooth' });
};
window.addEventListener('beforeunload', event => { if (photos.length || draft || $('#name').value || $('#visit').value || $('#good').value) { event.preventDefault(); event.returnValue = ''; } });
fetch('/api/health').then(r => r.json()).then(data => {
  serverAi = data.aiConfigured;
  $('#ai-status').textContent = serverAi ? '사진 분석 + 내 말투로 작성 · 바로 사용 가능' : '운영자 연결 준비 중 · 지금은 메모 모드를 이용해주세요';
  if (serverAi) { form.querySelector('input[value="ai"]').checked = true; $('#ai-settings').hidden = false; }
}).catch(() => { $('#ai-status').textContent = '서버 연결을 확인해주세요'; toast('서버에 연결할 수 없어요. npm start로 앱을 실행해주세요.', true); });

$('#restore').onclick = () => $('#restore-file').click();
$('#restore-file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (busy || importing) throw new Error('진행 중인 작업이 끝난 뒤 불러와주세요.');
    if (file.size > 100 * 1024 * 1024) throw new Error('100MB 이하의 저장 파일을 선택해주세요.');
    const saved = new DOMParser().parseFromString(await file.text(), 'text/html');
    const source = saved.querySelector('article#article');
    if (!source?.querySelector('h1')) throw new Error('작업실의 저장 ↓ 버튼으로 받은 HTML 파일을 선택해주세요.');
    const restored = document.createElement('article');
    const tags = new Set(['H1','H2','P','BLOCKQUOTE','HR','IMG','TABLE','TBODY','THEAD','TR','TD','TH','A','BR','STRONG','B','EM','I','SPAN','DIV']);
    const classes = new Set(['post-tags','post-disclosure','post-info','post-quote','post-divider','photo-caption','post-table','post-related']);
    function clean(node) {
      if (node.nodeType === 3) return document.createTextNode(node.textContent);
      if (node.nodeType !== 1 || !tags.has(node.tagName)) return null;
      const copy = document.createElement(node.tagName.toLowerCase());
      copy.className = [...node.classList].filter(c => classes.has(c)).join(' ');
      if (node.tagName === 'IMG') {
        const src = node.getAttribute('src') || '';
        if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(src)) throw new Error('사진이 내장된 작업실 HTML 파일이 필요해요.');
        copy.src = src; copy.alt = node.getAttribute('alt') || '저장한 방문 사진';
      }
      if (node.tagName === 'A') {
        const href = node.getAttribute('href') || '';
        if (/^https?:\/\//i.test(href)) { copy.href = href; copy.rel = 'noopener noreferrer'; copy.target = '_blank'; }
      }
      for (const child of node.childNodes) { const safe = clean(child); if (safe) copy.append(safe); }
      return copy;
    }
    for (const child of source.childNodes) { const safe = clean(child); if (safe) restored.append(safe); }
    if ((draft || photos.length) && !confirm('현재 작성 중인 내용을 저장한 글로 바꿀까요?')) return;
    $('#copy-parts')?.remove();
    const article = $('#article');
    article.replaceChildren(...restored.childNodes);
    article.dataset.template = source.dataset.template === 'calm' ? 'calm' : 'warm';
    setFontStyle(source.dataset.fontStyle);
    article.hidden = false; $('#empty-preview').hidden = true;
    article.querySelectorAll('h1,h2,p,blockquote,td').forEach(node => {
      // Use the same plain-text paste handling as newly generated articles.
      if (node.querySelector('a')) return;
      const replacement = editable(node.tagName.toLowerCase(), node.className, node.textContent);
      node.replaceWith(replacement);
    });
    outputPhotos = [...article.querySelectorAll('img')].map(img => ({ image: img.src, caption: img.alt }));
    photos = outputPhotos.map(p => ({ ...p }));
    photoOrderEdited = true;
    draft = { mode: 'restored' };
    $('#draft-mode').textContent = '불러온 방문기';
    $('#copy-naver').disabled = false; $('#add-divider').disabled = false; $('#add-draft-photo').disabled = false; $('#draft-edit-status').textContent = ''; $('#copy').disabled = false; $('#download').disabled = false; $('#photo-zip').disabled = !photos.length;
    manualChecks.clear(); renderPhotos(); updateChecklist();
    article.querySelectorAll('img').forEach(img => img.addEventListener('load', updateChecklist, {once:true}));
    $('#photo-status').textContent = '저장한 글의 사진을 복원했어요. 새 초안을 만들면 현재 글이 바뀝니다.';
    toast('저장한 글과 사진을 불러왔어요. 바로 수정하거나 복사할 수 있어요.');
  } catch (e) { toast(e.message || '저장 파일을 읽지 못했어요.', true); }
  finally { event.target.value = ''; }
};

function photoActions(img) {
  const actions = el('div', 'photo-export-actions export-ignore');
  const copyImage = el('button', '', '이 사진 복사'); copyImage.type = 'button';
  copyImage.onclick = async () => {
    if (!navigator.clipboard?.write || !window.ClipboardItem) return toast('이 브라우저는 사진 복사를 지원하지 않아요. 사진 ZIP을 저장해 블로그에 업로드해주세요.', true);
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(img.src) })]);
      toast('사진 한 장을 복사했어요. 블로그 본문의 원하는 위치에서 붙여넣어보세요.');
    } catch { toast('사진 복사가 제한됐어요. 사진 ZIP을 저장해 블로그에 업로드해주세요.', true); }
  };

  actions.append(copyImage);
  return actions;
}
const previewArticle = $('#article');
let insertAnchor = null;
let photoAnchor = null;
previewArticle.addEventListener('focusin', event => {
  let node = event.target;
  while (node && node.parentElement !== previewArticle) node = node.parentElement;
  if (node && !node.classList.contains('export-ignore')) insertAnchor = node;
});
function placeInDraft(anchor, ...nodes) {
  if (anchor?.parentElement === previewArticle && !anchor.matches('h1,.post-tags')) anchor.after(...nodes);
  else {
    const tags = previewArticle.querySelector('.post-tags');
    if (tags) tags.before(...nodes); else previewArticle.append(...nodes);
  }
  insertAnchor = nodes.at(-1);
  $('#copy-parts')?.remove();
  $('#photo-zip').disabled = !previewArticle.querySelector('img');
  updateChecklist();
}
$('#add-divider').onclick = () => {
  if (!draft || busy || importing) return;
  placeInDraft(insertAnchor, el('hr', 'post-divider'));
  $('#draft-edit-status').textContent = '구분선을 추가했어요.';
};
$('#add-draft-photo').onclick = () => {
  if (!draft || busy || importing) return;
  photoAnchor = insertAnchor;
  $('#draft-photo-file').click();
};
$('#draft-photo-file').onchange = async event => {
  const files = [...event.target.files];
  event.target.value = '';
  if (!files.length || !draft || busy || importing) return;
  importing = true;
  $('#draft-edit-status').textContent = '사진을 준비하고 있어요…';
  try {
    const { added, errors } = await readPhotos(files, 20 - previewArticle.querySelectorAll('img').length);
    const nodes = added.flatMap(p => {
      const img = el('img'); img.alt = '추가한 방문 사진';
      img.addEventListener('load', updateChecklist, { once: true });
      img.src = p.image;
      return [img, photoActions(img)];
    });
    if (nodes.length) placeInDraft(photoAnchor, ...nodes);
    $('#draft-edit-status').textContent = photoSummary(added, errors);
  } finally { importing = false; }
};

$('#copy-naver').onclick = async () => {
  if (!draft) return;
  try {
    await navigator.clipboard.writeText(articleText(exportArticle(), true));
    $('#draft-edit-status').textContent = '본문을 복사했어요. 네이버에 붙여넣고, 사진 ZIP의 번호에 맞춰 사진을 첨부하세요.';
  } catch {
    $('#draft-edit-status').textContent = '복사가 제한됐어요. 사진 ZIP 안의 blog-text.txt를 열어 본문을 복사해주세요.';
  }
};

openPlaceFromHash();

