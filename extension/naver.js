// Runs in every frame of blog.naver.com. In the frame that holds the SmartEditor ONE write screen it
// shows a small panel that uploads the studio's photos, then puts the title and body in place.
// It never presses 발행: the writer checks the post and publishes it.
(() => {
  if (window.__blogStudioHelper) return;
  window.__blogStudioHelper = true;

  const FRESH_MS = 30 * 60 * 1000;
  const TITLE = ['.se-section-documentTitle .se-module-text', '.se-documentTitle .se-module-text', '#title_input', 'input[placeholder*="제목"]', 'textarea[placeholder*="제목"]', '.se-documentTitle [contenteditable="true"]'];
  const BODY = ['.se-section-text .se-module-text', '.se-section-text div[contenteditable="true"]', '.se-main-container div[contenteditable="true"]', 'div.se-component-content[contenteditable="true"]'];
  const PHOTO_IMG = 'img.se-image-resource, .se-module-image img, .se-component img';
  const FILE_INPUT = ['input[type="file"][accept*="image"]', 'input[type="file"][name*="image"]', 'input[type="file"]'];
  const DROP_TARGET = ['.se-canvas', '.se-content', '.se-container', '.se-main-container'];
  const COMPONENT = '.se-component:not([class*="documentTitle"])';

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const first = (selectors, root = document) => { for (const s of selectors) { const node = root.querySelector(s); if (node) return node; } return null; };
  const hasEditor = () => !!document.querySelector('.se-container, .se-canvas, .se-toolbar, [class*="se-documentTitle"]');
  const report = [];
  let panel, statusLine, logBox;

  function log(message) {
    report.push(`${new Date().toISOString().slice(11, 19)} ${message}`);
    if (logBox) logBox.textContent = report.join('\n');
  }
  function status(message, error = false) {
    if (statusLine) { statusLine.textContent = message; statusLine.style.color = error ? '#b3402a' : '#2f4a35'; }
    log((error ? '! ' : '') + message);
  }

  // ---- editor plumbing -------------------------------------------------------------------------
  function bufferDocument() {
    for (const frame of document.querySelectorAll('iframe')) {
      if (!(frame.name || frame.id || '').startsWith('input_buffer')) continue;
      try { if (frame.contentDocument) return frame.contentDocument; } catch { /* cross-origin */ }
    }
    return null;
  }
  function click(node) {
    const rect = node.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, view: window, clientX: rect.left + Math.min(rect.width / 2, 40), clientY: rect.top + Math.min(rect.height / 2, 12), button: 0 };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) node.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, init));
  }
  // Where SmartEditor listens for typing and pasting: the hidden input_buffer frame, or the focused editable.
  function inputTarget() {
    const buffer = bufferDocument();
    if (buffer) return { doc: buffer, node: buffer.activeElement || buffer.body, via: 'input_buffer' };
    return { doc: document, node: document.activeElement || document.body, via: 'document' };
  }
  function paste(data) {
    const { doc, node, via } = inputTarget();
    const view = doc.defaultView || window;
    const transfer = new view.DataTransfer();
    for (const [type, value] of Object.entries(data)) transfer.setData(type, value);
    node.dispatchEvent(new view.ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    return via;
  }
  function key(name, code, keyCode, ctrl = false) {
    const { doc, node } = inputTarget();
    const view = doc.defaultView || window;
    const mac = /Mac/i.test(navigator.platform);
    const init = { key: name, code, keyCode, which: keyCode, bubbles: true, cancelable: true, ctrlKey: ctrl && !mac, metaKey: ctrl && mac };
    for (const type of ['keydown', 'keyup']) node.dispatchEvent(new view.KeyboardEvent(type, init));
  }
  function bodySignals() {
    const nodes = [...document.querySelectorAll(COMPONENT)];
    let text = '';
    for (const node of nodes) {
      const copy = node.cloneNode(true);
      copy.querySelectorAll('[class*="placeholder"]').forEach(n => n.remove());
      text += copy.textContent.replace(/\s+/g, '');
    }
    return { components: nodes.length, images: photoUrls().length, text: text.length };
  }
  function photoUrls() {
    const urls = [];
    for (const img of document.querySelectorAll(PHOTO_IMG)) {
      const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
      if (isNaverPhoto(src) && !urls.includes(src)) urls.push(src);
    }
    return urls;
  }
  async function settle(read, rounds = 3, gap = 400, limit = 15000) {
    let last = JSON.stringify(read()), same = 0;
    for (const end = Date.now() + limit; Date.now() < end;) {
      await sleep(gap);
      const now = JSON.stringify(read());
      same = now === last ? same + 1 : 0;
      last = now;
      if (same >= rounds) break;
    }
    return JSON.parse(last);
  }

  // ---- steps -----------------------------------------------------------------------------------
  async function toFile({ name, dataUrl }) {
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], name, { type: blob.type || 'image/jpeg', lastModified: Date.now() });
  }
  function pickSeparatePhotos() {
    // When several photos arrive Naver asks how to place them; we need one photo per component.
    for (const node of document.querySelectorAll('button, label, a, li, span')) {
      const text = node.textContent.replace(/\s+/g, '');
      if (text === '개별사진' && node.offsetParent !== null) { click(node); log('배치 선택: 개별사진'); return true; }
    }
    return false;
  }
  async function uploadPhotos(photos) {
    const before = new Set(photoUrls());
    const files = await Promise.all(photos.map(toFile));
    const transfer = new DataTransfer();
    files.forEach(file => transfer.items.add(file));
    const input = first(FILE_INPUT) || (window.top !== window ? (() => { try { return first(FILE_INPUT, window.top.document); } catch { return null; } })() : null);
    if (input) {
      input.files = transfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      log(`사진 ${files.length}장을 파일 입력으로 넘김 (${input.getAttribute('accept') || 'accept 없음'})`);
    } else {
      const target = first(DROP_TARGET);
      if (!target) throw new Error('사진을 넣을 자리를 찾지 못했어요 (파일 입력·끌어놓기 영역 없음).');
      const rect = target.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: rect.left + rect.width / 2, clientY: rect.top + Math.min(rect.height / 2, 200) };
      for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, init));
      log(`사진 ${files.length}장을 끌어놓기로 넘김 (${target.className.toString().slice(0, 60)})`);
    }
    let picked = false;
    for (const end = Date.now() + 120000; Date.now() < end;) {
      await sleep(500);
      if (!picked) picked = pickSeparatePhotos();
      const fresh = photoUrls().filter(url => !before.has(url));
      status(`사진 올리는 중… ${Math.min(fresh.length, files.length)}/${files.length}`);
      if (fresh.length >= files.length) return fresh;
    }
    const fresh = photoUrls().filter(url => !before.has(url));
    throw new Error(`사진이 ${fresh.length}/${files.length}장만 올라왔어요. 네이버 화면에 뜬 안내를 확인한 뒤 다시 눌러주세요.`);
  }
  async function fillTitle(title) {
    const node = first(TITLE);
    if (!node) { log('제목 칸을 찾지 못함'); return false; }
    const read = () => (node.value ?? node.textContent ?? '').replace(/\s+/g, ' ').trim();
    const done = () => read().includes(title.replace(/\s+/g, ' ').trim());
    if ('value' in node && node.tagName !== 'DIV') {
      node.focus(); node.value = title; node.dispatchEvent(new Event('input', { bubbles: true }));
      return done();
    }
    click(node); await sleep(300);
    const via = paste({ 'text/plain': title });
    await sleep(500);
    if (done()) { log(`제목: 붙여넣기 성공 (${via})`); return true; }
    const { doc } = inputTarget();
    try { doc.execCommand('insertText', false, title); } catch { /* not supported */ }
    await sleep(400);
    if (done()) { log('제목: insertText 성공'); return true; }
    log(`제목: 자동 입력 실패 (칸에 보이는 글: "${read().slice(0, 30)}")`);
    return false;
  }
  async function clearBody() {
    const body = first(BODY) || first(DROP_TARGET);
    if (body) { click(body); await sleep(300); }
    key('a', 'KeyA', 65, true); await sleep(200);
    key('Backspace', 'Backspace', 8); await sleep(200);
    const after = await settle(bodySignals, 2, 300, 4000);
    log(`본문 비우기 뒤: 컴포넌트 ${after.components}, 사진 ${after.images}, 글자 ${after.text}`);
    return after.images === 0 && after.text === 0;
  }
  async function fillBody(html, photoCount) {
    const before = bodySignals();
    const body = first(BODY) || first(DROP_TARGET);
    if (body) { click(body); await sleep(300); }
    const via = paste({ 'text/html': `<html><body><!--StartFragment-->${html}<!--EndFragment--></body></html>`, 'text/plain': new DOMParser().parseFromString(html, 'text/html').body.textContent });
    const after = await settle(bodySignals);
    log(`본문 붙여넣기 (${via}): 사진 ${before.images}→${after.images}, 글자 ${before.text}→${after.text}`);
    return after.text > before.text && after.images >= photoCount;
  }
  function copyToClipboard(html, text) {
    const onCopy = event => { event.stopImmediatePropagation(); event.preventDefault(); if (html) event.clipboardData.setData('text/html', html); event.clipboardData.setData('text/plain', text); };
    document.addEventListener('copy', onCopy, { capture: true, once: true });
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.removeEventListener('copy', onCopy, { capture: true });
    return ok;
  }

  // ---- panel -----------------------------------------------------------------------------------
  function button(label, onclick, primary = false) {
    const node = document.createElement('button');
    node.type = 'button'; node.textContent = label;
    node.style.cssText = `font:600 12px system-ui,sans-serif;padding:7px 11px;border-radius:6px;cursor:pointer;margin:4px 4px 0 0;border:1px solid ${primary ? '#3b5543' : '#cfd9c5'};background:${primary ? '#3b5543' : '#fff'};color:${primary ? '#fff' : '#3b5543'};`;
    node.onclick = onclick;
    return node;
  }
  function showPanel(payload) {
    panel = document.createElement('div');
    panel.id = 'blog-studio-helper';
    panel.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;width:300px;padding:13px 14px;background:#f7f9f2;border:1px solid #cfd9c5;border-radius:10px;box-shadow:0 6px 24px #0002;font:12px/1.6 system-ui,sans-serif;color:#29392f;';
    const heading = document.createElement('strong'); heading.textContent = '블로그 작업실 글 넣기'; heading.style.fontSize = '13px';
    const summary = document.createElement('div'); summary.textContent = `「${payload.title.slice(0, 28) || '제목 없음'}」 · 사진 ${payload.photos.length}장`;
    statusLine = document.createElement('div'); statusLine.style.cssText = 'margin:6px 0 2px;min-height:18px;';
    const actions = document.createElement('div');
    const manual = document.createElement('div');
    logBox = document.createElement('pre'); logBox.style.cssText = 'display:none;max-height:140px;overflow:auto;margin:8px 0 0;padding:6px;background:#fff;border:1px solid #e1e6d9;border-radius:6px;font:10px/1.5 ui-monospace,monospace;white-space:pre-wrap;';
    let busy = false;
    const start = button('글 넣기', async () => {
      if (busy) return;
      busy = true; start.disabled = true; manual.replaceChildren();
      try { await run(payload, manual); } catch (error) { status(error?.message || String(error), true); }
      busy = false; start.disabled = false; start.textContent = '다시 넣기';
    }, true);
    const details = button('진행 기록', () => { logBox.style.display = logBox.style.display === 'none' ? 'block' : 'none'; });
    const copyLog = button('기록 복사', () => status(copyToClipboard('', report.join('\n')) ? '진행 기록을 복사했어요.' : '기록 복사가 막혔어요. 진행 기록을 열어 직접 복사해주세요.'));
    const close = button('닫기', async () => { await chrome.storage.local.remove('pending'); panel.remove(); });
    actions.append(start, details, copyLog, close);
    panel.append(heading, summary, statusLine, actions, manual, logBox);
    document.body.append(panel);
    status('글 넣기를 누르면 사진을 올리고 제목·본문을 넣어요. 발행은 직접 눌러주세요.');
  }

  async function run(payload, manual) {
    log(`시작: 프레임 ${window === window.top ? 'top' : 'iframe'} · ${location.pathname} · input_buffer ${bufferDocument() ? '있음' : '없음'} · 파일 입력 ${document.querySelectorAll('input[type=file]').length}개`);
    let html = payload.html;
    const count = payload.photos.length;
    if (count) {
      const order = orderNaverPhotos(await uploadPhotos(payload.photos), count);
      if (!order) throw new Error('올라간 사진 수가 본문 사진 수와 달라요. 본문의 사진을 지우고 다시 눌러주세요.');
      log(`사진 주소 ${count}개 확보 (${order.by === 'number' ? '번호로 정렬' : '올린 순서'}) 예: ${order.urls[0].slice(0, 90)}`);
      order.urls.forEach((url, i) => { html = html.split(`https://photo.invalid/${i + 1}"`).join(`${url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`); });
      await settle(bodySignals, 2, 400, 6000);
    }
    const titleDone = payload.title ? await fillTitle(payload.title) : true;
    const cleared = count ? await clearBody() : true;
    const bodyDone = cleared ? await fillBody(html, count) : false;
    const text = new DOMParser().parseFromString(html, 'text/html').body.textContent;
    if (!titleDone) manual.append(button('제목 복사', () => status(copyToClipboard('', payload.title) ? '제목을 복사했어요. 제목 칸을 누르고 Ctrl+V 하세요.' : '복사가 막혔어요.', false)));
    if (!bodyDone) manual.append(button('본문 복사', () => status(copyToClipboard(`<html><body><!--StartFragment-->${html}<!--EndFragment--></body></html>`, text) ? '본문을 복사했어요. 네이버 본문을 누르고 Ctrl+A → Ctrl+V 하세요.' : '복사가 막혔어요.', false), true));
    if (titleDone && bodyDone) {
      await chrome.storage.local.set({ pending: { ...payload, doneAt: Date.now() } });
      status('제목·본문·사진을 넣었어요. 내용을 확인하고 발행을 눌러주세요.');
    } else if (bodyDone) status('본문과 사진을 넣었어요. 제목은 아래 ‘제목 복사’로 붙여넣어주세요.');
    else status(`사진 ${count}장은 네이버에 올렸어요. ${cleared ? '본문 자동 입력이 안 됐어요.' : '올린 사진을 자동으로 비우지 못했어요.'} 아래 ‘본문 복사’를 누른 뒤 네이버 본문에서 Ctrl+A → Ctrl+V 하세요.`, true);
  }

  async function boot() {
    for (let i = 0; i < 40 && !hasEditor(); i++) await sleep(500);
    if (!hasEditor() || document.querySelector('#blog-studio-helper')) return;
    const { pending } = await chrome.storage.local.get('pending');
    if (!pending || pending.doneAt || Date.now() - pending.at > FRESH_MS) return;
    showPanel(pending);
  }
  boot();
})();
