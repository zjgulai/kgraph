import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceDashboard } from '../components/canvas/WorkspaceDashboard';
import type { DocumentEntry } from '../lib/shared/document-registry';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'components/canvas/WorkspaceDashboard.tsx'), 'utf8');
const css = readFileSync(resolve(root, 'app/globals.css'), 'utf8');

const entries: DocumentEntry[] = [{
  id: 'vibe-track',
  kind: 'builtin',
  title: '骨干路线图 VibeTrack',
  subtitle: '零基础到产品上线',
  description: '默认路径。8 阶段 SOP。',
  path: './documents/VibeTrack.md',
  color: '#000000',
  exists: true,
  bytes: 93611,
  mtime: '2026-07-11T17:08:08.000Z',
}];

test('production readonly dashboard renders an entrance lobby without form or token controls', () => {
  const html = renderToStaticMarkup(React.createElement(WorkspaceDashboard, {
    initialEntries: entries,
    writePolicy: { mode: 'readonly', writable: false, tokenRequired: false },
  }));

  assert.match(html, /产品工厂入口大厅/);
  assert.match(html, /生产只读工作台/);
  assert.match(html, /生产只读/);
  assert.match(html, /骨干路线图 VibeTrack/);
  assert.match(html, /更新 2026-07-12 01:08:08 CST/);
  assert.doesNotMatch(html, /<form|<input|<textarea|Owner token|创建并打开/u);
});

test('writable dashboard keeps dev creation and hides owner controls until HttpOnly session auth', () => {
  const dev = renderToStaticMarkup(React.createElement(WorkspaceDashboard, {
    initialEntries: entries,
    writePolicy: { mode: 'dev', writable: true, tokenRequired: false },
  }));
  const owner = renderToStaticMarkup(React.createElement(WorkspaceDashboard, {
    initialEntries: entries,
    writePolicy: { mode: 'owner', writable: true, tokenRequired: true },
  }));

  assert.match(dev, /<form/);
  assert.match(dev, /创建并打开/);
  assert.doesNotMatch(dev, /Owner token/);
  assert.match(owner, /编辑能力尚未解锁/);
  assert.match(owner, /Owner 解锁/);
  assert.doesNotMatch(owner, /创建并打开|name="canvas-title"|sessionStorage|X-DocCanvas-Token/u);
  assert.match(source, /fetch\('\/api\/canvases'/);
  assert.match(source, /OwnerSessionControl/);
});

test('workspace lobby consumes factory tokens and avoids a generic rounded-card grid', () => {
  assert.match(source, /workspace-lobby/);
  assert.match(source, /workspace-document__scene/);
  assert.match(css, /\.workspace-lobby\s*\{/u);
  assert.match(css, /\.workspace-lobby__title h1[\s\S]*?var\(--factory-h1\)/u);
  assert.match(css, /\.workspace-document\s*\{/u);
  assert.doesNotMatch(source, /disabled=\{writesDisabled\}/);
});
