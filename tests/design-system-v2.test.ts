import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionButton } from '../components/ui/ActionButton';
import { AsyncState } from '../components/ui/AsyncState';
import { Field } from '../components/ui/Field';
import { StatusBadge } from '../components/ui/StatusBadge';

const root = resolve(import.meta.dirname, '..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('design system v2 exposes semantic interaction, status and layer tokens', () => {
  const tokens = source('opendesign/design-systems/doccanvas-product-factory/tokens/colors_and_type.css');

  for (const token of [
    '--factory-control-surface',
    '--factory-control-hover',
    '--factory-focus-ring',
    '--factory-status-success',
    '--factory-status-warning',
    '--factory-status-danger',
    '--factory-status-info',
    '--factory-layer-navigation',
    '--factory-layer-overlay',
  ]) assert.match(tokens, new RegExp(`${token}:`, 'u'));
});

test('button, field, status and async primitives render semantic states', () => {
  const html = renderToStaticMarkup(React.createElement('div', null,
    React.createElement(ActionButton, { variant: 'primary' }, '保存候选'),
    Field({
      label: '来源链接',
      controlId: 'source-url',
      hint: '输入可复核的原始来源。',
      error: '链接格式无效，请输入完整 URL。',
      children: React.createElement('input', { id: 'source-url', name: 'source-url', type: 'url' }),
    }),
    StatusBadge({ tone: 'warning', children: '等待人工复核' }),
    React.createElement(AsyncState, { state: 'error', title: '加载失败', description: '检查网络后重试。' }),
  ));

  assert.match(html, /ds-button ds-button--primary/u);
  assert.match(html, /<label for="source-url">来源链接<\/label>/u);
  assert.match(html, /aria-describedby="source-url-hint source-url-error"/u);
  assert.match(html, /role="alert"/u);
  assert.match(html, /ds-status ds-status--warning/u);
});

test('overlay and collection primitives own the required keyboard contracts', () => {
  const dialog = source('components/ui/Dialog.tsx');
  const menu = source('components/ui/Menu.tsx');
  const tabs = source('components/ui/Tabs.tsx');
  const styles = source('components/ui/primitives.css');

  assert.match(dialog, /aria-modal="true"/u);
  assert.match(dialog, /event\.key === 'Escape'/u);
  assert.match(dialog, /event\.key !== 'Tab'/u);
  assert.match(dialog, /explicitReturnTarget \?\? previousFocusRef\.current/u);
  assert.match(dialog, /setTimeout\(\(\) => returnTarget\?\.focus/u);
  assert.match(menu, /role="menu"/u);
  assert.match(menu, /ArrowDown/u);
  assert.match(menu, /Home/u);
  assert.match(tabs, /role="tablist"/u);
  assert.match(tabs, /aria-controls/u);
  assert.match(tabs, /ArrowLeft/u);
  assert.match(styles, /prefers-reduced-motion: reduce/u);
  assert.doesNotMatch(styles, /transition:\s*all/u);
});

test('workbench sample consumes shared primitives instead of private dialog and status markup', () => {
  const palette = source('components/workbench/CommandPalette.tsx');
  const queue = source('components/workbench/WorkQueue.tsx');
  const library = source('components/workspace/KnowledgeLibrary.tsx');
  const artifacts = source('components/workspace/ArtifactWorkspace.tsx');

  assert.match(palette, /from '@\/components\/ui\/Dialog'/u);
  assert.match(queue, /from '@\/components\/ui\/AsyncState'/u);
  assert.match(queue, /from '@\/components\/ui\/StatusBadge'/u);
  assert.match(library, /from '@\/components\/ui\/Field'/u);
  assert.match(artifacts, /from '@\/components\/ui\/Tabs'/u);
});
