export function articleText(article, markers = false) {
  let photo = 0;
  return [...article.children].map(node => node.tagName === 'IMG'
    ? (markers ? `[사진 ${String(++photo).padStart(2, '0')}]` : '')
    : (node.innerText || node.textContent)).filter(Boolean).join('\n\n');
}

export function clipboardHtml(article) {
  const copy = article.cloneNode(true);
  copy.querySelectorAll('p').forEach(p => {
    p.style.cssText = 'line-height:1.9;margin:14px 0;';
    const lines = (p.innerText || p.textContent).split('\n');
    p.replaceChildren();
    lines.forEach((line, i) => { if (i) p.append(document.createElement('br')); p.append(document.createTextNode(line)); });
  });
  copy.querySelectorAll('img').forEach(img => { img.style.cssText = 'max-width:100%;height:auto;display:block;margin:20px 0;'; });
  return '<!doctype html><html><body><!--StartFragment-->' + copy.innerHTML + '<!--EndFragment--></body></html>';
}

export async function pngBlob(source) {
  const image = new Image(); image.src = source; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  canvas.getContext('2d').drawImage(image, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('사진을 변환하지 못했어요.')), 'image/png'));
}

// ZIP with stored entries: no external library or image-hosting service required.
export function zipFiles(files) {
  const encoder = new TextEncoder(); const local = []; const central = []; let offset = 0; let centralSize = 0;
  const crc32 = bytes => {
    let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
    return (crc ^ 0xffffffff) >>> 0;
  };
  for (const file of files) {
    const name = encoder.encode(file.name); const bytes = file.bytes; const crc = crc32(bytes);
    const header = new Uint8Array(30 + name.length); const h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint16(12, 33, true);
    h.setUint32(14, crc, true); h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true); h.setUint16(26, name.length, true); header.set(name, 30);
    local.push(header, bytes);
    const entry = new Uint8Array(46 + name.length); const e = new DataView(entry.buffer);
    e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x800, true); e.setUint16(14, 33, true);
    e.setUint32(16, crc, true); e.setUint32(20, bytes.length, true); e.setUint32(24, bytes.length, true); e.setUint16(28, name.length, true); e.setUint32(42, offset, true); entry.set(name, 46);
    central.push(entry); centralSize += entry.length; offset += header.length + bytes.length;
  }
  const end = new Uint8Array(22); const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true); view.setUint32(12, centralSize, true); view.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: 'application/zip' });
}
