import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const viewer = readFileSync(resolve(root, 'components/canvas/CanvasViewer.tsx'), 'utf8');
const toolbar = readFileSync(resolve(root, 'components/canvas/CanvasToolbar.tsx'), 'utf8');
const saveIndicator = readFileSync(resolve(root, 'components/canvas/SaveIndicator.tsx'), 'utf8');
const exportIndicator = readFileSync(resolve(root, 'components/canvas/ExportIndicator.tsx'), 'utf8');
const css = [
  readFileSync(resolve(root, 'app/globals.css'), 'utf8'),
  readFileSync(resolve(root, 'app/canvas.css'), 'utf8'),
].join('\n');

test('save copy names the browser-local action as saving a view', () => {
  assert.match(toolbar, />保存视图<\/button>/u);
  assert.match(toolbar, /保存个人视图/u);
  assert.match(saveIndicator, /正在保存视图/u);
  assert.match(saveIndicator, /视图已保存/u);
  assert.match(saveIndicator, /role="status"/u);
  assert.match(saveIndicator, /aria-live="polite"/u);
  assert.doesNotMatch(saveIndicator, /transition-all/u);
  assert.doesNotMatch(`${viewer}\n${toolbar}`, />保存<\/button>/u);
});

test('Markdown export verifies the response before downloading and reports both outcomes', () => {
  assert.match(viewer, /fetch\(`\/api\/export\/markdown\?documentId=\$\{document\.id\}`\)/u);
  assert.match(viewer, /if \(!response\.ok\) throw new Error/u);
  assert.match(viewer, /await response\.blob\(\)/u);
  assert.match(viewer, /URL\.createObjectURL/u);
  assert.match(viewer, /正在导出 Markdown/u);
  assert.match(viewer, /Markdown 已导出/u);
  assert.match(viewer, /Markdown 导出未完成/u);
});

test('PNG and Markdown feedback remains visible outside the desktop-only header', () => {
  assert.match(viewer, /<ExportIndicator/u);
  assert.match(viewer, /status=\{exportFeedback\.status\}/u);
  assert.match(exportIndicator, /role="status"/u);
  assert.match(exportIndicator, /aria-live="polite"/u);
  assert.match(exportIndicator, /export-indicator--\$\{status\}/u);
  assert.match(css, /\.export-indicator\s*\{/u);
  assert.match(css, /\.export-indicator--success/u);
  assert.match(css, /\.export-indicator--error/u);
  assert.match(viewer, /PNG 已导出/u);
  assert.match(viewer, /PNG 导出未完成/u);
});
