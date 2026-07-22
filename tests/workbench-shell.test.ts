import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KnowledgeWorkspace } from '../components/workspace/KnowledgeWorkspace';
import { parseWorkbenchRoute } from '../lib/workbench/routes';
import { loadKnowledgeLibrary } from '../lib/server/knowledge-library';
import { buildProductOperationsProjection } from '../lib/product/operations-projection';
import type { DocumentEntry } from '../lib/shared/document-registry';

const root = resolve(import.meta.dirname, '..');
const packPath = resolve(root, '../product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json');
const entries: DocumentEntry[] = [{
  id: 'vibe-track',
  kind: 'builtin',
  title: '骨干路线图 VibeTrack',
  subtitle: '零基础到产品上线',
  description: '默认路径。8 阶段 SOP。',
  path: './documents/VibeTrack.md',
  color: '#000000',
  exists: true,
}];

function renderWorkspace(search = ''): string {
  const library = loadKnowledgeLibrary(packPath);
  return renderToStaticMarkup(React.createElement(KnowledgeWorkspace, {
    initialLibrary: library,
    initialOperations: buildProductOperationsProjection({ library, blueprints: [], artifacts: [] }),
    initialEntries: entries,
    initialCaptures: [],
    initialRoute: parseWorkbenchRoute(new URLSearchParams(search)),
    writePolicy: { mode: 'readonly', writable: false, tokenRequired: false },
  }));
}

test('governed shell defaults to a real work queue and four grouped domains', () => {
  const html = renderWorkspace();

  assert.match(html, /工作队列/u);
  assert.match(html, /当前证据生成的任务/u);
  assert.match(html, /搜索对象与命令/u);
  for (const group of ['知识', '产品', '运营', '来源']) assert.match(html, new RegExp(`>${group}<`, 'u'));
  assert.doesNotMatch(html, /<b>04<\/b>|<b>05<\/b>/u);
});

test('knowledge object selection and filters render as shareable links', () => {
  const objectId = 'knowledge.mcp_servers.context7';
  const html = renderWorkspace(`view=knowledge&object=${objectId}&domain=ai-product.tooling.mcp&q=context`);

  assert.match(html, /知识资产库/u);
  assert.match(html, /aria-label="搜索知识对象"/u);
  assert.ok(html.includes(`object=${objectId}`));
  assert.match(html, /class="knowledge-row" data-selected="true" aria-current="true"/u);
  assert.match(html, /value="context"/u);
});
