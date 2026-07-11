import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const viewer = readFileSync(resolve(root, 'components/canvas/CanvasViewer.tsx'), 'utf8');
const page = readFileSync(resolve(root, 'app/canvas/[documentId]/page.tsx'), 'utf8');

test('canvas receives the server write policy and readonly saves stay browser-local', () => {
  assert.match(page, /writePolicy=\{getWritePolicy\(\)\}/);
  assert.match(viewer, /if \(!writePolicy\.writable\)/);
  const readonlyGate = viewer.indexOf('if (!writePolicy.writable)');
  const serverWrite = viewer.indexOf("fetch('/api/canvas-state'");
  assert.ok(readonlyGate >= 0 && readonlyGate < serverWrite);
});

test('server restore accepts any non-empty position set', () => {
  assert.match(viewer, /Object\.keys\(state\.nodePositions\)\.length > 0/);
  assert.doesNotMatch(viewer, /Object\.keys\(state\.nodePositions\)\.length > 5/);
});

test('PNG export enforces a rendered pixel budget including pixel ratio', () => {
  assert.match(viewer, /imageWidth \* imageHeight \* PNG_PIXEL_RATIO \* PNG_PIXEL_RATIO/);
  assert.match(viewer, /renderedPixels > MAX_PNG_PIXELS/);
});
