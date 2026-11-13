import test from 'node:test';
import assert from 'node:assert/strict';
import { faceRegion } from '../public/face-mosaic.js';

test('face regions include padding and stay inside the photo', () => {
  assert.deepEqual(faceRegion({originX: 20,originY:20,width:40,height:40},100,100),
    {left:7,top:5,width:66,height:71});
});

test('face regions clamp to borders', () => {
  const region = faceRegion({originX:-5,originY:-5,width:40,height:40},50,50);
  assert.equal(region.left,0);
  assert.equal(region.top,0);
  assert.ok(region.width <= 50 && region.height <= 50);
});

test('invalid rectangles are ignored', () => {
  assert.equal(faceRegion({originX:0,originY:0,width:-1,height:10},100,100),null);
  assert.equal(faceRegion({originX:0,originY:0,width:10,height:10},0,100),null);
  assert.equal(faceRegion(null,100,100),null);
});
