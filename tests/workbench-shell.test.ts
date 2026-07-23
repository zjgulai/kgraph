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
import { readFileSync } from 'node:fs';

const root = resolve(import.meta.dirname, '..');
const packPath = resolve(root, '../product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json');
const workbenchCss = readFileSync(resolve(root, 'components/workbench/workbench.css'), 'utf8');
const workspaceSource = readFileSync(resolve(root, 'components/workspace/KnowledgeWorkspace.tsx'), 'utf8');
const globalCss = readFileSync(resolve(root, 'app/globals.css'), 'utf8');
const knowledgeWorkspaceCss = readFileSync(resolve(root, 'app/knowledge-workspace.css'), 'utf8');
const governedCss = [
  globalCss,
  knowledgeWorkspaceCss,
  readFileSync(resolve(root, 'app/canvas.css'), 'utf8'),
  readFileSync(resolve(root, 'app/product-workbench.css'), 'utf8'),
  readFileSync(resolve(root, 'app/operations-evidence.css'), 'utf8'),
  workbenchCss,
  readFileSync(resolve(root, 'components/ui/primitives.css'), 'utf8'),
].join('\n');
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
  assert.match(html, /知识候选人工复核/u);
  assert.match(html, /生产状态保持不变/u);
  assert.doesNotMatch(html, /knowledge_review|productionStatus=unchanged|>Evidence review</u);
});

test('knowledge object selection and filters render as shareable links', () => {
  const objectId = 'knowledge.mcp_servers.context7';
  const html = renderWorkspace(`view=knowledge&object=${objectId}&domain=ai-product.tooling.mcp&q=context`);

  assert.match(html, /知识资产库/u);
  assert.match(html, /aria-label="搜索知识对象"/u);
  assert.ok(html.includes(`object=${objectId}`));
  assert.match(html, /class="knowledge-row" role="option"[^>]*data-selected="true"[^>]*aria-current="true"/u);
  assert.match(html, /value="context"/u);
});

test('D7 shell uses compact tablet rail through 1279px and a safe-area mobile bottom navigation', () => {
  assert.match(workbenchCss, /@media \(min-width: 768px\) and \(max-width: 1279px\)/u);
  assert.match(workbenchCss, /@media \(max-width: 767px\)/u);
  assert.match(workbenchCss, /\.workbench-mobile-domains[\s\S]*?position:\s*fixed[\s\S]*?env\(safe-area-inset-bottom\)/u);
  assert.match(workbenchCss, /\.workbench-mobile-domains a[\s\S]*?min-height:\s*48px[\s\S]*?touch-action:\s*manipulation/u);
  assert.match(workbenchCss, /\.workbench-shell[\s\S]*?overscroll-behavior-x:\s*none/u);
});

test('D8 lazy-loads heavy work surfaces and gives Knowledge workspace CSS an explicit owner', () => {
  assert.match(workspaceSource, /import dynamic from 'next\/dynamic'/u);
  for (const moduleName of ['KnowledgeReviewWorkspace', 'KnowledgeCanvasWorkspace', 'ProviderOperationsWorkspace']) {
    assert.match(workspaceSource, new RegExp(`dynamic\\([\\s\\S]*?import\\('\\./${moduleName}'\\)`, 'u'));
    assert.doesNotMatch(workspaceSource, new RegExp(`import \\{ ${moduleName} \\} from`, 'u'));
  }
  assert.match(workspaceSource, /workspace-surface-loading/u);
  assert.match(globalCss, /@import "\.\/knowledge-workspace\.css"/u);
  assert.match(knowledgeWorkspaceCss, /Knowledge product workspace/u);
  assert.doesNotMatch(knowledgeWorkspaceCss, /#[0-9a-f]{3,8}\b/iu);
  assert.doesNotMatch(knowledgeWorkspaceCss, /transition:\s*all\b/iu);
  assert.match(workspaceSource, /startClientPerformanceObservers/u);
  assert.match(workspaceSource, /recordClientPerformance\(pending\.metric/u);
});

test('D8 enforces the CSS budget and documents the only accessibility overrides', () => {
  assert.doesNotMatch(governedCss, /#[0-9a-f]{3,8}\b/iu);
  assert.doesNotMatch(governedCss, /transition:\s*all\b/iu);
  assert.equal(governedCss.match(/!important/gu)?.length, 6);
  assert.equal(governedCss.match(/Accessibility override must win over component-scoped motion declarations\./gu)?.length, 2);
  assert.equal(globalCss.split('\n').length < 1_400, true);
});
