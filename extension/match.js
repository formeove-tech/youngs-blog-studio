// Shared with the studio's export.js logic: which addresses are Naver-hosted photos, and how to order them.
const NAVER_PHOTO_HOST = /(^|\.)(postfiles\d*|blogfiles|blogthumb|mblogthumb-phinf|blogthumb-phinf)\.pstatic\.net$|(^|\.)phinf\.pstatic\.net$/i;
function isNaverPhoto(src) {
  try { const url = new URL(src); return url.protocol === 'https:' && NAVER_PHOTO_HOST.test(url.hostname); } catch { return false; }
}
function photoNumber(src) {
  let name = '';
  try { name = decodeURIComponent(new URL(src).pathname.split('/').pop() || ''); } catch { return null; }
  const match = /^(\d{2})\.[a-z0-9]{2,5}$/i.exec(name);
  return match ? Number(match[1]) : null;
}
// The extension uploads files named 01.jpg, 02.jpg… so the number in the address is the photo's place in the article.
function orderNaverPhotos(urls, count) {
  if (urls.length !== count) return null;
  const numbers = urls.map(photoNumber);
  if (numbers.every(n => n !== null) && new Set(numbers).size === count && numbers.every(n => n >= 1 && n <= count))
    return { urls: urls.map((url, i) => [numbers[i], url]).sort((a, b) => a[0] - b[0]).map(([, url]) => url), by: 'number' };
  return { urls: [...urls], by: 'order' };
}
if (typeof module !== 'undefined') module.exports = { isNaverPhoto, photoNumber, orderNaverPhotos };
