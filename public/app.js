const $ = s => document.querySelector(s);
const form = $('#draft-form');
let photos = [];
let draft = null;
let outputPhotos = [];
let busy = false;
let toastTimer;
let serverAi = false;
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
function renderPhotos() {
  $('#photo-count').textContent = `${photos.length} / 20`;
  $('#photo-list').replaceChildren();
  photos.forEach((p, i) => {
    const card = el('div', 'photo-item');
    const top = el('div', 'photo-top');
    const img = el('img'); img.src = p.image; img.alt = p.caption || `방문 사진 ${i + 1}`;
    const controls = el('div', 'photo-controls');
    for (const [text, title, action, disabled] of [
      ['←', '사진 앞으로 이동', () => { [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]]; renderPhotos(); }, i === 0],
      ['→', '사진 뒤로 이동', () => { [photos[i + 1], photos[i]] = [photos[i], photos[i + 1]]; renderPhotos(); }, i === photos.length - 1],
      ['×', '사진 삭제', () => { photos.splice(i, 1); renderPhotos(); }, false]
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
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WEBP 사진을 넣어주세요.');
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
async function addPhotos(files) {
  if (importing || busy) return toast('진행 중인 작업이 끝나면 사진을 추가해주세요.');
  if (photos.length + files.length > 20) return toast('사진은 최대 20장까지 넣을 수 있어요.', true);
  importing = true; $('#photo-status').textContent = '사진을 준비하고 있어요…'; $('#generate').disabled = true;
  let count = 0;
  for (const file of files) {
    try { photos.push({ image: await imageData(file), caption: '' }); count++; } catch (e) { toast(e.message, true); }
  }
  importing = false; $('#generate').disabled = false; $('#photo-status').textContent = count ? `${count}장 추가했어요. 사진 설명을 적고, 화살표로 순서를 바꿔보세요.` : '';
  renderPhotos(); $('#photos').value = '';
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
$('#fetch-place').onclick = async () => {
  const url = $('#place-url').value.trim();
  if (!url) return toast('플레이스 주소를 먼저 넣어주세요.', true);
  const button = $('#fetch-place'); button.disabled = true; button.textContent = '확인 중…';
  $('#place-status').textContent = '네이버에서 가게 이름을 확인하고 있어요…';
  try {
    const result = await api('/api/place', { url });
    if (!$('#name').value.trim()) $('#name').value = result.name;
    $('#place-status').className = 'field-help';
    $('#place-status').textContent = `${result.name} · ${result.source}. 가게 이름과 나머지 정보를 확인해주세요.`;
    toast('가게 이름을 확인했어요.');
  } catch (e) {
    $('#place-status').className = 'field-help error';
    $('#place-status').textContent = e.message + ' 주소·영업시간·주차·메뉴를 직접 입력해도 글을 만들 수 있어요.';
  } finally { button.disabled = false; button.textContent = '불러오기 ↗'; }
};
form.addEventListener('change', event => {
  if (event.target.name === 'mode') $('#ai-settings').hidden = event.target.value !== 'ai';
});
$('#sponsorship').onchange = () => {
  const choice = $('#sponsorship').value;
  $('#disclosure-wrap').hidden = choice === 'none';
  $('#disclosure').value = choice === 'self' ? '직접 결제하고 다녀온 후기입니다.' : '';
};
function renderDraft(data) {
  const article = $('#article'); article.replaceChildren(); article.hidden = false; $('#empty-preview').hidden = true;
  $('#draft-mode').textContent = data.mode === 'ai' ? 'AI 방문기' : '메모 초안';
  if (data.mode === 'memo') article.append(el('div', 'generation-warning export-ignore', '입력한 메모로 구성한 초안이에요. 사진을 분석하거나 AI로 문장을 다듬지는 않았어요. 글을 클릭해 수정해보세요.'));
  const chooser = el('div', 'title-options export-ignore'); chooser.append(el('span', '', '마음에 드는 제목을 골라보세요'));
  const heading = editable('h1', '', data.titles[0]);
  data.titles.forEach((title, i) => {
    const button = el('button', i === 0 ? 'selected' : '', title); button.type = 'button';
    button.onclick = () => { heading.textContent = title; chooser.querySelectorAll('button').forEach(b => b.classList.remove('selected')); button.classList.add('selected'); };
    chooser.append(button);
  });
  article.append(chooser);
  if (data.disclosure) article.append(editable('p', 'post-disclosure', data.disclosure));
  article.append(el('div', 'post-label export-ignore', 'YOUNG’S VISIT DIARY'), heading, editable('p', '', data.intro, '방문 계기를 적어주세요.'));
  if (data.info) article.append(editable('p', 'post-info', data.info));
  for (const section of data.sections) {
    if (section.heading) article.append(editable('h2', '', section.heading));
    if (Number.isInteger(section.photoIndex) && outputPhotos[section.photoIndex]) {
      const img = el('img'); img.src = outputPhotos[section.photoIndex].image; img.alt = outputPhotos[section.photoIndex].caption || `방문 사진 ${section.photoIndex + 1}`; article.append(img);
    }
    article.append(editable('p', '', section.text, '이 사진에 담긴 이야기를 적어주세요.'));
  }
  article.append(editable('h2', '', '다녀온 이야기, 마무리'), editable('p', '', data.closing), editable('p', 'post-tags', data.hashtags, '#해시태그'));
  $('#copy').disabled = false; $('#download').disabled = false;
}
form.onsubmit = async event => {
  event.preventDefault();
  if (busy || importing) return;
  const data = Object.fromEntries(new FormData(form));
  data.photos = photos.map(p => ({ ...p, image: data.mode === 'ai' ? p.image : '' }));
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
  copy.querySelectorAll('.export-ignore').forEach(n => n.remove());
  copy.querySelectorAll('[contenteditable]').forEach(n => { n.removeAttribute('contenteditable'); n.removeAttribute('role'); n.removeAttribute('aria-label'); n.removeAttribute('data-placeholder'); });
  return copy;
}
$('#copy').onclick = async () => {
  const copy = exportArticle();
  const text = [...copy.children].filter(n => n.tagName !== 'IMG').map(n => n.innerText || n.textContent).filter(Boolean).join('\n\n');
  try { await navigator.clipboard.writeText(text); toast('글을 복사했어요. 사진은 HTML 저장 파일에서 함께 확인할 수 있어요.'); }
  catch { toast('복사 권한이 없어요. 글을 직접 선택하거나 저장 기능을 이용해주세요.', true); }
};
$('#download').onclick = () => {
  const copy = exportArticle();
  const title = copy.querySelector('h1')?.textContent || '영쓰의 방문기';
  const doc = document.implementation.createHTMLDocument(title); doc.documentElement.lang = 'ko';
  const charset = doc.createElement('meta'); charset.setAttribute('charset', 'utf-8'); doc.head.prepend(charset);
  const viewport = doc.createElement('meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width,initial-scale=1'; doc.head.append(viewport);
  const css = doc.createElement('style'); css.textContent = 'body{max-width:760px;margin:40px auto;padding:0 22px;font-family:system-ui,sans-serif;color:#303b30;line-height:2}img{width:100%;height:auto;margin:20px 0}p{white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:26px;line-height:1.6}h2{font-size:19px}.post-info{padding:20px;background:#f3f6ed}.post-tags{color:#547448}.post-disclosure{font-size:12px;color:#777}'; doc.head.append(css);
  doc.body.append(copy);
  const blob = new Blob(['<!doctype html>\n' + doc.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = title.replace(/[\\/:*?"<>|]/g, '').slice(0, 70) + '.html'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast('사진과 수정한 글을 HTML 파일로 저장했어요.');
};
$('#reset').onclick = () => {
  if (busy || importing) return toast('진행 중인 작업이 끝나면 다시 시도해주세요.');
  if (!confirm('입력한 내용과 사진, 작성한 초안을 모두 지울까요?')) return;
  photos = []; outputPhotos = []; draft = null; form.reset(); renderPhotos();
  $('#article').replaceChildren(); $('#article').hidden = true; $('#empty-preview').hidden = false;
  $('#ai-settings').hidden = true; $('#disclosure-wrap').hidden = true; $('#copy').disabled = true; $('#download').disabled = true;
  $('#draft-mode').textContent = '미리보기'; $('#photo-status').textContent = ''; $('#place-status').className = 'field-help'; $('#place-status').textContent = '가게 이름을 불러와요. 주소·영업시간·가격은 확인 후 입력해주세요.';
  document.querySelectorAll('.step').forEach((s, i) => s.classList.toggle('current', i === 0)); window.scrollTo({ top: 0, behavior: 'smooth' });
};
window.addEventListener('beforeunload', event => { if (photos.length || draft || $('#name').value || $('#visit').value || $('#good').value) { event.preventDefault(); event.returnValue = ''; } });
fetch('/api/health').then(r => r.json()).then(data => {
  serverAi = data.aiConfigured;
  $('#ai-status').textContent = serverAi ? '사진 분석 + 내 말투로 작성 · 바로 사용 가능' : '운영자 연결 준비 중 · 지금은 메모 모드를 이용해주세요';
  if (serverAi) { form.querySelector('input[value="ai"]').checked = true; $('#ai-settings').hidden = false; }
}).catch(() => { $('#ai-status').textContent = '서버 연결을 확인해주세요'; toast('서버에 연결할 수 없어요. npm start로 앱을 실행해주세요.', true); });
