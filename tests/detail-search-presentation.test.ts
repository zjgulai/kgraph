import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { NodeDetailSheet } from '../components/canvas/NodeDetailSheet';
import type { NodePresentation } from '../lib/canvas/document-presentation';
import type { MarkdownBlockNode } from '../lib/markdown/presentation';
import type { DocNode } from '../lib/parser/types';
import {
  resolveSearchNavigationTarget,
  type SearchNavigationTarget,
} from '../lib/canvas/search-navigation';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const search = read('components/canvas/SearchPanel.tsx');
const detail = read('components/canvas/NodeDetailSheet.tsx');
const viewer = read('components/canvas/CanvasViewer.tsx');

test('search delegates raw and display matching to the document presentation index', () => {
  assert.match(search, /DocumentPresentation/);
  assert.match(search, /presentations\.search\(debouncedQuery/);
  assert.match(search, /presentationByNodeId/);
  assert.doesNotMatch(search, /n\.title\.toLowerCase|n\.content\.toLowerCase/);
  assert.match(search, /\{result\.displayTitle\}/);
  assert.match(search, /来源：\{result\.sourceLabel\}/);
});

test('search keeps navigation by node id without decorative text glyphs', () => {
  assert.match(search, /handleNavigate\(result\)/);
  assert.doesNotMatch(search, /[§↑↓→]/u);
  assert.doesNotMatch(
    search,
    /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u20E3]/u,
  );
});

test('search navigation target retains query, exact ids, and source presentation', () => {
  assert.match(search, /SearchNavigationTarget/);
  assert.match(search, /query:\s*query\.trim\(\)/);
  assert.match(search, /nodeId:\s*result\.nodeId/);
  assert.match(search, /regionId:\s*regionIdByNodeId\[result\.nodeId\]/);
  assert.match(search, /displayTitle:\s*result\.displayTitle/);
  assert.match(search, /sourceLabel:\s*result\.sourceLabel/);
  assert.match(search, /resumeContext\?\.query/);
});

test('exact search navigation fails closed when a node or region mapping changes', () => {
  const target: SearchNavigationTarget = {
    query: '进化宪章',
    nodeId: 'node-security',
    regionId: 'region:security',
    displayTitle: '进化宪章',
    sourceLabel: '安全与治理',
  };
  const index = {
    nodeIds: new Set(['node-security']),
    nodeRegionId: { 'node-security': 'region:security' },
    regionKindById: { 'region:security': 'room' as const },
  };

  assert.deepEqual(resolveSearchNavigationTarget(target, index), {
    kind: 'focused-node',
    nodeId: 'node-security',
    regionId: 'region:security',
  });
  assert.deepEqual(resolveSearchNavigationTarget(target, {
    ...index,
    nodeIds: new Set(),
  }), { kind: 'stale', reason: 'node-missing' });
  assert.deepEqual(resolveSearchNavigationTarget(target, {
    ...index,
    nodeRegionId: { 'node-security': 'region:other' },
  }), { kind: 'stale', reason: 'region-changed' });
});

test('viewer enters the exact room, highlights the node, and opens detail in one navigation', () => {
  assert.match(viewer, /resolveSearchNavigationTarget/);
  assert.match(viewer, /setSearchContext\(target\)/);
  assert.match(viewer, /setCanvasView\(\{ kind: 'focused-region', regionId: resolution\.regionId \}\)/);
  assert.match(viewer, /setHighlightedSearchNodeId\(target\.nodeId\)/);
  assert.match(viewer, /openDocNode\(target\.nodeId\)/);
  assert.match(viewer, /resumeContext=\{searchContext\}/);
  assert.match(viewer, /searchOrigin=\{selectedNodeId === searchContext\?\.nodeId/);
});

test('search consumes Escape before canvas navigation and cancels pending debounce work', () => {
  assert.match(search, /stopImmediatePropagation\(\)/);
  assert.match(search, /addEventListener\('keydown', handler, true\)/);
  assert.match(search, /removeEventListener\('keydown', handler, true\)/);
  assert.match(search, /clearTimeout\(debounceRef\.current\)/);
});

test('detail defaults to a productized read surface and gates raw inputs behind owner edit mode', () => {
  assert.match(detail, /NodePresentation/);
  assert.match(detail, /MarkdownBlockNode/);
  assert.match(detail, /useState<'read' \| 'edit'>\('read'\)/);
  assert.match(detail, /readOnly \? 'read'/);
  assert.match(detail, /activeTab === 'edit'/);
  assert.match(detail, /<SafeMarkdown/);
  assert.match(detail, /presentation\.displayTitle/);
  assert.match(detail, /来源章节/);
  assert.match(detail, /presentation\.sourceLabel/);
});

test('closing detail unmounts editor session state before another node can open', () => {
  assert.match(viewer, /\{detailOpen && selectedNode && selectedNodePresentation && \(/);
});

test('detail preserves raw copy and save payloads while sanitizing visible auxiliary content', () => {
  assert.match(detail, /onSave\?\.\(title, content, nodeType\)/);
  assert.match(detail, /handleCopy\(block\.content\)/);
  assert.match(detail, /handleCopy\(prompt\)/);
  assert.match(detail, /cleanPresentationCode/);
  assert.doesNotMatch(detail, /[§↑↓→]/u);
  assert.doesNotMatch(
    detail,
    /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u20E3]/u,
  );
});

const rawNode: DocNode = {
  id: 'node-1',
  type: 'section',
  title: '🚀 **原始标题**',
  content: 'Raw ✅ **Markdown**',
  summary: 'Raw 🚦 summary',
  level: 2,
  position: { x: 0, y: 0 },
  contentBlocks: [{
    type: 'code',
    language: 'ts 🚀',
    content: 'const section = "§3";\nstep → next 🚀',
  }],
  toolReferences: ['[KB: 🛠️ build.tool]'],
  promptTemplates: ['请执行 🚀 deploy'],
  metadata: {},
  children: [],
};

const nodePresentation: NodePresentation = {
  nodeId: rawNode.id,
  displayTitle: '交付准备',
  displaySummary: '验证发布条件',
  sourceLabel: '原始标题',
  badges: [{ kind: 'stage', label: '阶段 4' }],
  previewKind: 'code',
  accessibleLabel: '交付准备。验证发布条件。来源：原始标题',
};

const displayMarkdownBlocks: readonly MarkdownBlockNode[] = [{
  type: 'paragraph',
  children: [{ type: 'text', value: 'Markdown 已渲染' }],
}];

function renderDetail(readOnly: boolean): string {
  return renderToStaticMarkup(createElement(NodeDetailSheet, {
    node: rawNode,
    presentation: nodePresentation,
    displayMarkdownBlocks,
    open: true,
    readOnly,
    onClose: () => undefined,
  }));
}

test('readonly and owner-default detail render the safe reader without mounting raw source editors', () => {
  for (const readOnly of [true, false]) {
    const html = renderDetail(readOnly);
    assert.match(html, /交付准备/);
    assert.match(html, /来源章节：原始标题/);
    assert.match(html, /Markdown 已渲染/);
    assert.doesNotMatch(html, /id="node-source-title"|id="node-source-content"|<textarea/u);
    assert.doesNotMatch(html, /\*\*原始标题\*\*|Raw .*Markdown/u);
    assert.doesNotMatch(html, /[§↑↓→←]/u);
    assert.doesNotMatch(
      html,
      /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u20E3]/u,
    );
  }
  assert.equal(rawNode.contentBlocks[0].content, 'const section = "§3";\nstep → next 🚀');
});
