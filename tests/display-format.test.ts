import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatDisplayInteger,
} from '../lib/shared/display-format';

const root = resolve(import.meta.dirname, '..');

test('server and browser display metadata with deterministic UTC+8 text', () => {
  assert.equal(formatDisplayDateTime('2026-07-11T17:08:08.000Z'), '2026-07-12 01:08:08 CST');
  assert.equal(formatDisplayDate('2026-07-11T17:08:08.000Z'), '2026-07-12 CST');
  assert.equal(formatDisplayInteger(93611), '93,611');
});

test('hydrated dashboard and canvas metadata avoid locale-dependent rendering', () => {
  const dashboard = readFileSync(resolve(root, 'components/canvas/WorkspaceDashboard.tsx'), 'utf8');
  const viewer = readFileSync(resolve(root, 'components/canvas/CanvasViewer.tsx'), 'utf8');

  assert.doesNotMatch(dashboard, /\.toLocale(?:String|DateString|TimeString)\(/);
  assert.doesNotMatch(viewer, /\.toLocale(?:String|DateString|TimeString)\(/);
  assert.match(dashboard, /formatDisplayDateTime\(entry\.mtime\)/);
  assert.match(viewer, /formatDisplayDate\(fileMetadata\.mtime\)/);
});
