import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlateText, classifyPlateText, plateTextRegion, findPlateTextLines } from '../public/plate-mosaic.js';

test('recognizes typical Korean plate numbers with spaces and hyphens', () => {
  assert.equal(classifyPlateText('123가 4567', 92), 'match');
  assert.equal(classifyPlateText('12하-3456', 90), 'match');
  assert.equal(normalizePlateText(' 123 가-4567 '), '123가4567');
});
test('low confidence and incomplete readings request human review', () => {
  assert.equal(classifyPlateText('123가4567', 31), 'uncertain-match');
  assert.equal(classifyPlateText('123가456', 85), 'candidate');
  assert.equal(classifyPlateText('맛있는 닭볶음탕', 100), 'none');
});
test('OCR line blocks yield plate candidates without reading personal numbers into UI', () => {
  const blocks = [{ paragraphs: [{ lines: [
    { text: '123가4567', confidence: 90, bbox: { x0: 20,y0:20,x1:125,y1:38 } },
    { text: '123가45', confidence: 60, bbox: { x0: 40,y0:60,x1:130,y1:80 } }
  ] }] }];
  const entries = findPlateTextLines(blocks);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(e => e.kind), ['match','candidate']);
});
test('plate rectangle is padded and clipped at image boundaries', () => {
  const rect = plateTextRegion({x0:0,y0:0,x1:60,y1:20},100,100);
  assert.equal(rect.left,0);
  assert.equal(rect.top,0);
  assert.ok(rect.width > 60 && rect.height > 20);
  assert.equal(plateTextRegion({x0:10,y0:20,x1:5,y1:25},100,100),null);
});
