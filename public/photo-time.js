const decoder = new TextDecoder();

function jpegExif(data) {
  let offset = 2;
  while (offset + 4 <= data.byteLength && data.getUint8(offset) === 0xff) {
    while (offset < data.byteLength && data.getUint8(offset) === 0xff) offset++;
    if (offset + 3 > data.byteLength) return;
    const marker = data.getUint8(offset++);
    if (marker === 0xda || marker === 0xd9) return;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = data.getUint16(offset);
    if (length < 2 || offset + length > data.byteLength) return;
    // JPEG stores the TIFF data after the APP1 length and the Exif identifier.
    if (marker === 0xe1 && length >= 8 && data.getUint32(offset + 2) === 0x45786966 && data.getUint16(offset + 6) === 0) {
      return new DataView(data.buffer, offset + 8, length - 8);
    }
    offset += length;
  }
}

function chunkExif(data, png) {
  const exifType = png ? 0x65584966 : 0x45584946; // PNG eXIf or WebP EXIF
  let offset = png ? 8 : 12;
  while (offset + 8 <= data.byteLength) {
    const type = data.getUint32(offset + (png ? 4 : 0));
    const length = data.getUint32(offset + (png ? 0 : 4), !png);
    const start = offset + 8;
    offset = start + length + (png ? 4 : length % 2);
    if (offset > data.byteLength) return;
    if (type === exifType) return new DataView(data.buffer, start, length);
  }
}

function exifData(data) {
  if (data.byteLength < 12) return;
  if (data.getUint16(0) === 0xffd8) return jpegExif(data);
  if (data.getUint32(0) === 0x89504e47 && data.getUint32(4) === 0x0d0a1a0a) return chunkExif(data, true);
  if (data.getUint32(0) === 0x52494646 && data.getUint32(8) === 0x57454250) return chunkExif(data, false);
}

function findTag(tiff, directory, tag, littleEndian) {
  if (directory < 8 || directory + 2 > tiff.byteLength) return;
  const start = directory + 2;
  const end = start + tiff.getUint16(directory, littleEndian) * 12;
  if (end > tiff.byteLength) return;
  for (let entry = start; entry < end; entry += 12) {
    if (tiff.getUint16(entry, littleEndian) === tag) return entry;
  }
}

function captureTime(tiff) {
  if (!tiff || tiff.byteLength < 8) return;
  // Some WebP encoders include the Exif identifier before the TIFF header.
  if (tiff.getUint32(0) === 0x45786966 && tiff.getUint16(4) === 0) {
    tiff = new DataView(tiff.buffer, tiff.byteOffset + 6, tiff.byteLength - 6);
    if (tiff.byteLength < 8) return;
  }
  const byteOrder = tiff.getUint16(0);
  const littleEndian = byteOrder === 0x4949;
  if ((!littleEndian && byteOrder !== 0x4d4d) || tiff.getUint16(2, littleEndian) !== 42) return;

  const exifPointer = findTag(tiff, tiff.getUint32(4, littleEndian), 0x8769, littleEndian);
  if (exifPointer === undefined || tiff.getUint16(exifPointer + 2, littleEndian) !== 4 ||
      tiff.getUint32(exifPointer + 4, littleEndian) !== 1) return;
  const directory = tiff.getUint32(exifPointer + 8, littleEndian);
  function readAscii(tag) {
    const entry = findTag(tiff, directory, tag, littleEndian);
    if (entry === undefined || tiff.getUint16(entry + 2, littleEndian) !== 2) return '';
    const length = tiff.getUint32(entry + 4, littleEndian);
    const offset = length <= 4 ? entry + 8 : tiff.getUint32(entry + 8, littleEndian);
    if (length > 64 || offset + length > tiff.byteLength) return '';
    return decoder.decode(new Uint8Array(tiff.buffer, tiff.byteOffset + offset, length)).split('\0', 1)[0].trim();
  }

  const original = readAscii(0x9003).match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/);
  if (!original) return;
  const [, year, month, day, clock] = original;
  const fraction = readAscii(0x9291).match(/^\d+/)?.[0] || '';
  const iso = `${year}-${month}-${day}T${clock}.${fraction.slice(0, 3).padEnd(3, '0')}`;
  const utc = new Date(iso + 'Z');
  if (!Number.isFinite(utc.getTime()) || utc.toISOString() !== iso + 'Z') return;
  const zone = readAscii(0x9011);
  const time = Date.parse(iso + (/^[+-](?:[01]\d|2[0-3]):[0-5]\d$/.test(zone) ? zone : ''));
  if (Number.isFinite(time)) return time;
}

export async function photoTime(file) {
  try {
    const metadata = exifData(new DataView(await file.arrayBuffer()));
    return captureTime(metadata) ?? file.lastModified;
  } catch {
    return file.lastModified;
  }
}
