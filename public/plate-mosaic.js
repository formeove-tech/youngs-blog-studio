// Client-side license plate OCR. Photo pixels stay in this browser.
// Recognition is conservative: clearly recognized Korean plate text is
// pixelated. Partial/low-confidence detections require human review.
import { pixelateRect } from './face-mosaic.js';

const TESSERACT_MODULE = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';
let workerPromise;

async function ocrWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import(TESSERACT_MODULE);
      return createWorker(['kor', 'eng']);
    })().catch(error => { workerPromise = null; throw error; });
  }
  return workerPromise;
}

export function normalizePlateText(text) {
  return String(text || '').normalize('NFKC').replace(/[\s\-–—.·•:]/gu, '').toUpperCase();
}

// Ordinary 2/3-digit Korean vehicle registrations, including rental and
// commercial-use syllables. This is not a complete international detector.
const COMPLETE_PLATE = /\d{2,3}[가-힣]\d{4}/u;
const PARTIAL_PLATE = /\d{2,3}[가-힣]\d{1,3}|\d{2,3}[가-힣](?!\d)|[가-힣]\d{4}/u;
export function classifyPlateText(text, confidence = 100) {
  const compact = normalizePlateText(text);
  if (COMPLETE_PLATE.test(compact))
    return Number.isFinite(confidence) && confidence < 65 ? 'uncertain-match' : 'match';
  return PARTIAL_PLATE.test(compact) ? 'candidate' : 'none';
}

export function plateTextRegion(bbox, imageWidth, imageHeight) {
  if (!bbox || ![bbox.x0,bbox.y0,bbox.x1,bbox.y1,imageWidth,imageHeight].every(Number.isFinite))
    return null;
  const x0 = Math.max(0, bbox.x0), y0 = Math.max(0, bbox.y0);
  const x1 = Math.min(imageWidth, bbox.x1), y1 = Math.min(imageHeight, bbox.y1);
  const width = x1 - x0, height = y1 - y0;
  if (!(width > 0 && height > 0)) return null;
  const padX = Math.max(4, width * 0.12);
  const padY = Math.max(4, height * 0.65);
  const left = Math.max(0, Math.floor(x0 - padX));
  const top = Math.max(0, Math.floor(y0 - padY));
  const right = Math.min(imageWidth, Math.ceil(x1 + padX));
  const bottom = Math.min(imageHeight, Math.ceil(y1 + padY));
  return { left, top, width: right - left, height: bottom - top };
}

export function findPlateTextLines(blocks) {
  const results = [];
  for (const block of blocks || []) for (const paragraph of block.paragraphs || [])
    for (const line of paragraph.lines || []) {
      const classification = classifyPlateText(line.text, line.confidence);
      if (classification !== 'none' && line.bbox) results.push({
        kind: classification, bbox: line.bbox,
        confidence: Number.isFinite(line.confidence) ? line.confidence : null
      });
    }
  return results;
}

export async function autoPlateMosaic(imageDataUrl) {
  let worker;
  try { worker = await ocrWorker(); }
  catch { throw new Error('번호판 인식 모델을 불러오지 못했어요. 사진의 번호판을 직접 확인해주세요.'); }
  const image = new Image();
  image.src = imageDataUrl;
  await image.decode();
  let blocks;
  try {
    const { data } = await worker.recognize(image, {}, { blocks: true });
    if (!Array.isArray(data.blocks)) throw new Error('OCR blocks unavailable');
    blocks = data.blocks;
  } catch { throw new Error('번호판 인식에 실패했어요. 사진의 번호판을 직접 확인해주세요.'); }
  const lines = findPlateTextLines(blocks);
  const complete = lines.filter(item => item.kind === 'match' || item.kind === 'uncertain-match');
  const uncertain = lines.filter(item => item.kind !== 'match');
  if (!complete.length) return { image: imageDataUrl, count: 0, uncertainCount: uncertain.length };
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  let count = 0;
  for (const line of complete) {
    const region = plateTextRegion(line.bbox, canvas.width, canvas.height);
    if (region) { pixelateRect(ctx, region); count++; }
  }
  return { image: canvas.toDataURL('image/jpeg', 0.88), count, uncertainCount: uncertain.length };
}
