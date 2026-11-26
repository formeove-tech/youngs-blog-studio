// Runs on the blog studio. Adds a "네이버로 보내기" button that hands the current draft to the Naver tab.
(() => {
  const DIVIDER = '──────────';
  const $ = selector => document.querySelector(selector);
  const lines = (node, text) => {
    node.replaceChildren();
    text.split('\n').forEach((line, i) => { if (i) node.append(document.createElement('br')); node.append(document.createTextNode(line)); });
  };
  // Same look as the studio's own clipboard HTML, with photos as numbered placeholders.
  function buildPayload() {
    const article = $('#article');
    if (!article || article.hidden || !article.children.length) return null;
    const originals = [...article.querySelectorAll('[contenteditable]')];
    const copy = article.cloneNode(true);
    copy.querySelectorAll('[contenteditable]').forEach((node, i) => { node.textContent = originals[i].innerText; });
    copy.querySelectorAll('.export-ignore').forEach(node => node.remove());
    const title = (copy.querySelector('h1')?.textContent ?? '').trim().replace(/\s*\n\s*/g, ' ');
    copy.querySelector('h1')?.remove();
    const photos = [];
    copy.querySelectorAll('img').forEach(img => {
      const dataUrl = img.getAttribute('src') || '';
      if (!dataUrl.startsWith('data:image/')) { img.remove(); return; }
      const type = /^data:image\/(png|webp)/.exec(dataUrl)?.[1] ?? 'jpg';
      photos.push({ name: `${String(photos.length + 1).padStart(2, '0')}.${type}`, dataUrl });
      const mark = document.createElement('img');
      mark.setAttribute('src', `https://photo.invalid/${photos.length}`);
      mark.style.cssText = 'max-width:100%;height:auto;display:block;margin:20px 0;';
      img.replaceWith(mark);
    });
    copy.querySelectorAll('p,td').forEach(p => {
      p.style.cssText = p.tagName === 'TD' ? 'border:1px solid #dfe5d7;padding:10px 12px;font-size:13px;line-height:1.9;'
        : p.classList.contains('photo-caption') ? 'font-size:12px;line-height:1.8;text-align:center;color:#7b8374;margin:8px 0 22px;'
        : p.classList.contains('post-info') ? 'line-height:1.9;padding:16px;background-color:#f5f7f0;border-left:2px solid #9eaf8b;margin:20px 0;'
        : 'line-height:1.9;margin:14px 0;';
      if (!p.querySelector('a[href]')) lines(p, p.textContent);
    });
    copy.querySelectorAll('h2').forEach(h => { h.style.cssText = 'font-size:19px;line-height:1.8;font-weight:bold;margin:32px 0 14px;'; });
    copy.querySelectorAll('blockquote').forEach(q => { q.style.cssText = 'font-size:18px;line-height:1.9;padding:18px 20px;margin:30px 0;border-left:3px solid #9eae8d;color:#526449;'; lines(q, q.textContent); });
    copy.querySelectorAll('hr').forEach(hr => { const p = document.createElement('p'); p.textContent = DIVIDER; p.style.cssText = 'text-align:center;color:#526449;margin:24px 0;'; hr.replaceWith(p); });
    copy.querySelectorAll('table').forEach(t => { t.style.cssText = 'border-collapse:collapse;width:100%;margin:20px 0;border:1px solid #dfe5d7;'; });
    copy.querySelectorAll('th').forEach(th => { th.style.cssText = 'border:1px solid #dfe5d7;padding:10px 12px;background:#f3f6ed;text-align:left;font-size:13px;font-weight:bold;'; });
    copy.querySelectorAll('[class],[data-name],[role],[aria-label],[data-placeholder]').forEach(node => ['class', 'data-name', 'role', 'aria-label', 'data-placeholder'].forEach(a => node.removeAttribute(a)));
    return { title, html: copy.innerHTML, photos, at: Date.now() };
  }
  function addButton() {
    const tools = $('.copy-toolbar .preview-tools');
    if (!tools || $('#send-to-naver')) return;
    const button = document.createElement('button');
    button.id = 'send-to-naver'; button.type = 'button'; button.textContent = '네이버로 보내기';
    button.title = '확장 프로그램: 네이버 글쓰기 화면을 열고 제목·본문·사진을 넣어요';
    button.onclick = async () => {
      const status = $('#draft-edit-status');
      const payload = buildPayload();
      if (!payload) { if (status) status.textContent = '보낼 글이 없어요. 먼저 초안을 만들거나 저장한 글을 불러와주세요.'; return; }
      try {
        await chrome.storage.local.set({ pending: payload });
        const result = await chrome.runtime.sendMessage({ type: 'open-naver-write' });
        if (!result?.ok) throw new Error(result?.error || '탭을 열지 못했어요.');
        if (status) status.textContent = `네이버 글쓰기 화면을 열었어요. 그 화면 오른쪽 아래 ‘블로그 작업실 글 넣기’를 눌러주세요. (사진 ${payload.photos.length}장)`;
      } catch (error) {
        if (status) status.textContent = '네이버로 보내지 못했어요: ' + (error?.message || error) + ' — 확장 프로그램을 새로고침한 뒤 이 페이지도 새로고침해주세요.';
      }
    };
    tools.append(button);
  }
  addButton();
  new MutationObserver(addButton).observe(document.documentElement, { childList: true, subtree: true });
})();
