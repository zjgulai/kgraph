import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesignSystemFixture } from '../components/ui/DesignSystemFixture';
import { MutationStatus } from '../components/ui/MutationStatus';
import { governanceGateLabel, humanLabel, workflowLabel } from '../lib/presentation/human-labels';

const root = resolve(import.meta.dirname, '..');

test('human label registry covers governed status, workflow and authorization surfaces', () => {
  assert.equal(humanLabel('draft'), '草稿');
  assert.equal(humanLabel('not_verified'), '尚未验证');
  assert.equal(humanLabel('public_reference'), '公开参考');
  assert.equal(workflowLabel('production', 'Production release'), '生产发布');
  assert.equal(governanceGateLabel('exact_release_authorization'), '精确发布授权');
  assert.equal(humanLabel('unregistered_value'), '未知状态');
});

test('mutation status exposes six explicit live-region states without raw enum copy', () => {
  for (const state of ['draft', 'dirty', 'saving', 'saved', 'conflict', 'failed'] as const) {
    const html = renderToStaticMarkup(React.createElement(MutationStatus, { state }));
    assert.match(html, new RegExp(`data-state="${state}"`, 'u'));
    assert.match(html, /role="(?:status|alert)"/u);
    assert.doesNotMatch(html, new RegExp(`>${state}<`, 'u'));
  }
});

test('D9 state fixture exposes every required acceptance state and a named mobile command action', () => {
  const fixture = renderToStaticMarkup(React.createElement(DesignSystemFixture));
  for (const state of ['loading', 'empty', 'error', 'stale', 'conflict', 'unauthorized', 'expired']) {
    assert.match(fixture, new RegExp(`data-governance-state="${state}"`, 'u'));
  }
  const shell = readFileSync(resolve(root, 'components/workbench/WorkbenchShell.tsx'), 'utf8');
  assert.match(shell, /aria-label="搜索对象与命令"/u);
  const css = readFileSync(resolve(root, 'components/workbench/workbench.css'), 'utf8');
  assert.match(css, /\.workbench-commandbar__search\s*\{[^}]*width:\s*44px;[^}]*min-height:\s*44px;/u);
});
