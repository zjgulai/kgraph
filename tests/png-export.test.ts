import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPngPixelRatio } from '../lib/canvas/png-export';

test('selects the highest safe PNG pixel ratio using a squared ratio budget', () => {
  assert.equal(selectPngPixelRatio(1_000, 1_000), 2);
  assert.equal(selectPngPixelRatio(4_000, 4_000), 2);
  assert.equal(selectPngPixelRatio(4_001, 4_000), 1);
  assert.equal(selectPngPixelRatio(5_000, 4_000), 1);
  assert.equal(selectPngPixelRatio(1_620, 20_480), 1);
  assert.equal(selectPngPixelRatio(8_000, 8_000), 1);
  assert.equal(selectPngPixelRatio(8_001, 8_000), null);
});

test('rejects invalid or overflowing PNG dimensions', () => {
  assert.equal(selectPngPixelRatio(0, 1_000), null);
  assert.equal(selectPngPixelRatio(1_000, 0), null);
  assert.equal(selectPngPixelRatio(-1, 1_000), null);
  assert.equal(selectPngPixelRatio(1_000, -1), null);
  assert.equal(selectPngPixelRatio(Number.NaN, 1_000), null);
  assert.equal(selectPngPixelRatio(1_000, Number.POSITIVE_INFINITY), null);
  assert.equal(selectPngPixelRatio(Number.NEGATIVE_INFINITY, 1_000), null);
  assert.equal(selectPngPixelRatio(Number.MAX_VALUE, 2), null);
});
