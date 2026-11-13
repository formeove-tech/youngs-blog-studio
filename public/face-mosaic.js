// Face detection is performed in the visitor's browser. Only the WASM code and
// model files are downloaded; uploaded photo pixels are not sent to this CDN.
const SDK = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22';
const MODEL_ROOT = 'https://storage.googleapis.com/mediapipe-models/face_detector/';
const MODELS = [
  'blaze_face_full_range/float16/1/blaze_face_full_range.tflite',
  'blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
];
let detectorsPromise;

async function detectors() {
  if (!detectorsPromise) {
    detectorsPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import(SDK + '/vision_bundle.mjs');
      const vision = await FilesetResolver.forVisionTasks(SDK + '/wasm');
      return Promise.all(MODELS.map(path => FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_ROOT + path, delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.35
      })));
    })();
  }
  return detectorsPromise;
}

export function faceRegion(box, imageWidth, imageHeight) {
  if (!box || !Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) ||
      imageWidth <= 0 || imageHeight <= 0 ||
      ![box.originX, box.originY, box.width, box.height].every(Number.isFinite) ||
      box.width <= 0 || box.height <= 0) return null;
  const left = Math.max(0, Math.floor(box.originX - box.width * 0.32));
  const top = Math.max(0, Math.floor(box.originY - box.height * 0.36));
  const right = Math.min(imageWidth, Math.ceil(box.originX + box.width * 1.32));
  const bottom = Math.min(imageHeight, Math.ceil(box.originY + box.height * 1.38));
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

export function pixelateRect(ctx, region) {
  const { left, top, width, height } = region;
  if (!(width > 0 && height > 0)) return;
  const sample = document.createElement('canvas');
  // Deliberately coarse: around 8–12 large blocks across a face.
  sample.width = Math.max(1, Math.ceil(width / Math.max(12, width / 10)));
  sample.height = Math.max(1, Math.ceil(height / Math.max(12, height / 10)));
  const source = sample.getContext('2d');
  source.drawImage(ctx.canvas, left, top, width, height, 0, 0, sample.width, sample.height);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sample, 0, 0, sample.width, sample.height, left, top, width, height);
  ctx.restore();
}

function overlaps(a, b) {
  const x = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  const intersection = x * y;
  return intersection / Math.min(a.width * a.height, b.width * b.height) > 0.55;
}

export async function autoMosaic(imageDataUrl) {
  let models;
  try { models = await detectors(); }
  catch { throw new Error('얼굴 인식 모델을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요. 원본은 등록하지 않았어요.'); }
  const image = new Image();
  image.src = imageDataUrl;
  await image.decode();
  let detections;
  try { detections = models.flatMap(model => model.detect(image).detections ?? []); }
  catch { throw new Error('얼굴 인식에 실패했어요. 원본은 등록하지 않았어요.'); }
  const regions = detections.map(d => faceRegion(d.boundingBox, image.naturalWidth, image.naturalHeight))
    .filter(Boolean).sort((a, b) => b.width * b.height - a.width * a.height);
  const unique = regions.filter((region, i) => !regions.slice(0, i).some(other => overlaps(region, other)));
  if (!unique.length) return { image: imageDataUrl, count: 0 };
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  for (const rect of unique) pixelateRect(ctx, rect);
  return { image: canvas.toDataURL('image/jpeg', 0.88), count: unique.length };
}
