import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KnowledgeWorkspace } from '../components/workspace/KnowledgeWorkspace';
import {
  loadKnowledgeLibrary,
  parseKnowledgeLibraryPack,
} from '../lib/server/knowledge-library';
import type { DocumentEntry } from '../lib/shared/document-registry';
import { buildProductOperationsProjection } from '../lib/product/operations-projection';

const root = resolve(import.meta.dirname, '..');
const packPath = resolve(root, '../product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json');
const packRaw = readFileSync(packPath, 'utf8');

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

test('candidate pack becomes a complete readonly library projection', () => {
  const library = loadKnowledgeLibrary(packPath);

  assert.equal(library.items.length, 37);
  assert.equal(library.stats.reviewRequired, 37);
  assert.equal(library.stats.warningCount, 77);
  assert.equal(new Set(library.items.map(item => item.objectId)).size, 37);
  assert.ok(library.items.every(item => item.promotionState === 'human_review_required'));

  const context7 = library.items.find(item => item.objectId === 'knowledge.mcp_servers.context7');
  assert.equal(context7?.legacy.category, 'mcp_servers');
  assert.equal(context7?.legacy.status, 'active');
  assert.equal(context7?.legacy.recommendationRank, 'primary');
  assert.match(context7?.legacy.recommendationContext ?? '', /所有产品原型必装/u);
  assert.equal(context7?.reviewReasons.includes('valid_from_unknown'), true);
  assert.equal(context7?.source.locator.endsWith(':line:1'), true);
});

test('candidate pack tampering and incomplete review coverage fail fast', () => {
  const tamperedObject = JSON.parse(packRaw) as Record<string, unknown> & { objects: Array<Record<string, unknown>> };
  tamperedObject.objects[0]!.title = 'tampered';
  assert.throws(
    () => parseKnowledgeLibraryPack(JSON.stringify(tamperedObject)),
    /KNOWLEDGE_PACK_OBJECT_HASH_MISMATCH/u,
  );

  const incompleteReview = JSON.parse(packRaw) as Record<string, unknown> & { review_queue: unknown[] };
  incompleteReview.review_queue = incompleteReview.review_queue.slice(1);
  assert.throws(
    () => parseKnowledgeLibraryPack(JSON.stringify(incompleteReview)),
    /KNOWLEDGE_PACK_REVIEW_COVERAGE_INVALID/u,
  );
});

test('workspace renders the library, inspector and legacy Documents entry without write controls', () => {
  const library = loadKnowledgeLibrary(packPath);
  const html = renderToStaticMarkup(React.createElement(KnowledgeWorkspace, {
    initialLibrary: library,
    initialOperations: buildProductOperationsProjection({ library, blueprints: [], artifacts: [] }),
    initialEntries: entries,
    initialCaptures: [],
    writePolicy: { mode: 'readonly', writable: false, tokenRequired: false },
  }));

  assert.match(html, /Knowledge Product Workspace/);
  assert.match(html, /知识资产库/);
  assert.match(html, /37/);
  assert.match(html, /Context7/);
  assert.match(html, /人工复核/);
  assert.match(html, /Documents/);
  assert.match(html, /aria-label="搜索知识对象"/u);
  assert.match(html, /来源与时态/);
  assert.match(html, /role="listitem" class="knowledge-row-item"><button/u);
  assert.doesNotMatch(html, /创建并打开|<form|sessionStorage|X-DocCanvas-Token/u);
});

test('workspace stays separate from CanvasViewer and packages the candidate snapshot', () => {
  const workspace = readFileSync(resolve(root, 'components/workspace/KnowledgeWorkspace.tsx'), 'utf8');
  const library = readFileSync(resolve(root, 'components/workspace/KnowledgeLibrary.tsx'), 'utf8');
  const inspector = readFileSync(resolve(root, 'components/workspace/KnowledgeInspector.tsx'), 'utf8');
  const css = readFileSync(resolve(root, 'app/globals.css'), 'utf8');
  const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');
  const buildScript = readFileSync(resolve(root, 'scripts/tencent/build-linux-image.sh'), 'utf8');
  const standalonePrepare = readFileSync(resolve(root, 'scripts/prepare-standalone-e2e.ts'), 'utf8');
  const productSource = [workspace, library, inspector].join('\n');

  assert.doesNotMatch(productSource, /CanvasViewer|@xyflow\/react|sessionStorage/u);
  assert.doesNotMatch(productSource, /#[a-fA-F0-9]{3,8}\b/u);
  assert.match(workspace, /window\.addEventListener\('keydown', focusSearch\)/u);
  assert.match(workspace, /event\.metaKey && !event\.ctrlKey/u);
  assert.match(css, /\.knowledge-workspace\s*\{/u);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.knowledge-workspace/u);
  assert.match(dockerfile, /shared-knowledge-v1-candidate-pack\.json/u);
  assert.match(dockerfile, /\/workspace\/product\/knowledge-object-fixtures\/shared-knowledge-v1-candidate-pack\.json/u);
  assert.match(dockerfile, /scripts\/lib\/knowledge-object-contract\.ts/u);
  assert.match(dockerfile, /scripts\/lib\/knowledge-object-store\.ts/u);
  assert.match(buildScript, /shared-knowledge-v1-candidate-pack\.json/u);
  assert.match(buildScript, /KNOWLEDGE_RUNTIME_SOURCE/u);
  assert.match(standalonePrepare, /shared-knowledge-v1-candidate-pack\.json/u);
});
