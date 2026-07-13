import assert from 'node:assert/strict';
import test from 'node:test';
import { isPngPaintSurfaceReady, selectPngPixelRatio } from '../lib/canvas/png-export';

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

test('requires a committed and paintable desktop panorama before PNG capture', () => {
  const ready = {
    shellExporting: true,
    canvasDisplay: 'block',
    canvasVisibility: 'visible',
    viewportVisibility: 'visible',
    nodeVisibility: 'visible',
    canvasWidth: 2_400,
    canvasHeight: 1_800,
    viewportWidth: 2_400,
    viewportHeight: 1_800,
    nodeWidth: 2_080,
    nodeHeight: 1_530,
  };

  assert.equal(isPngPaintSurfaceReady(ready), true);
  assert.equal(isPngPaintSurfaceReady({ ...ready, shellExporting: false }), false);
  assert.equal(isPngPaintSurfaceReady({ ...ready, canvasDisplay: 'none' }), false);
  assert.equal(isPngPaintSurfaceReady({ ...ready, canvasVisibility: 'hidden' }), false);
  assert.equal(isPngPaintSurfaceReady({ ...ready, viewportVisibility: 'hidden' }), false);
  assert.equal(isPngPaintSurfaceReady({ ...ready, nodeVisibility: 'hidden' }), false);
  assert.equal(isPngPaintSurfaceReady({ ...ready, canvasWidth: 0 }), false);
  assert.equal(isPngPaintSurfaceReady({ ...ready, viewportHeight: 0 }), false);
  assert.equal(isPngPaintSurfaceReady({ ...ready, nodeWidth: 0 }), false);
});
