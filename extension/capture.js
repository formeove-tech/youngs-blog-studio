// Runs only in the extension popup or the explicitly selected Studio tab.
globalThis.youngsExtractArticle = function (root) {
  const article = root.querySelector('article#article');
  if (!article || article.hidden) throw Error('완성한 글이 없습니다. 블로그 작업실에서 초안을 만들거나 저장한 HTML을 불러온 뒤 다시 눌러주세요.');
  const text = node => (node?.innerText || node?.textContent || '').trim();
  const title = text(article.querySelector('h1'));
  if (!title) throw Error('완성한 글에서 제목을 찾지 못했어요.');
  const blocks = [];
  let imageCount = 0;
  for (const node of article.children) {
    if (node.matches('.export-ignore,h1')) continue;
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || '';
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(src))
        throw Error(`${imageCount + 1}번 사진이 파일에 포함되지 않았어요. 블로그 작업실의 ‘저장 ↓’으로 받은 HTML을 사용해주세요.`);
      blocks.push({type:'image', src, alt:node.getAttribute('alt') || ''}); imageCount++;
    } else if (node.tagName === 'HR') blocks.push({type:'divider', text:'──────────'});
    else {
      let content = text(node);
      if (node.tagName === 'TABLE') content = [...node.rows].map(row => [...row.cells].map(text).join(' : ')).join('\n');
      const link = node.querySelector('a[href]');
      if (link && /^https?:\/\//i.test(link.getAttribute('href') || '')) content += '\n' + link.getAttribute('href');
      if (content) blocks.push({type:node.tagName === 'H2' ? 'heading' : node.tagName === 'BLOCKQUOTE' ? 'quote' : 'text', text:content});
    }
  }
  if (!blocks.length) throw Error('제목 외에 가져올 본문이나 사진이 없어요.');
  return {version:1, title, blocks, capturedAt:Date.now()};
};
