import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KnowledgeLibrary } from '../components/workspace/KnowledgeLibrary';
import {
  calculateKnowledgeVirtualWindow,
  sortKnowledgeItems,
} from '../lib/knowledge/library-view';
import { loadKnowledgeLibrary } from '../lib/server/knowledge-library';
import { parseWorkbenchRoute, workbenchHref } from '../lib/workbench/routes';

const root = resolve(import.meta.dirname, '..');
const packPath = resolve(root, '../product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json');

test('UI-022 round-trips Library sort, density, layout and exact selection through the URL', () => {
  const route = parseWorkbenchRoute(new URLSearchParams(
    'view=knowledge&object=knowledge.mcp_servers.context7&sort=observed&density=compact&layout=grid',
  ));

  assert.equal(route.objectId, 'knowledge.mcp_servers.context7');
  assert.deepEqual(route.libraryView, {
    sort: 'observed',
    density: 'compact',
    layout: 'grid',
  });
  assert.match(workbenchHref(route), /sort=observed&density=compact&layout=grid/u);

  const invalid = parseWorkbenchRoute(new URLSearchParams(
    'view=knowledge&sort=random&density=tiny&layout=wall',
  ));
  assert.deepEqual(invalid.libraryView, {
    sort: 'relevance',
    density: 'comfortable',
    layout: 'list',
  });
});

test('UI-022 sorting is stable and never mutates the source projection', () => {
  const items = loadKnowledgeLibrary(packPath).items.slice(0, 8);
  const sourceOrder = items.map(item => item.objectId);
  const byTitle = sortKnowledgeItems(items, 'title');
  const byObserved = sortKnowledgeItems(items, 'observed');

  assert.deepEqual(items.map(item => item.objectId), sourceOrder);
  assert.deepEqual(byTitle, [...byTitle].sort((left, right) => (
    left.title.localeCompare(right.title, 'zh-CN') || left.objectId.localeCompare(right.objectId)
  )));
  assert.deepEqual(byObserved, [...byObserved].sort((left, right) => (
    Date.parse(right.observedAt) - Date.parse(left.observedAt) || left.objectId.localeCompare(right.objectId)
  )));
});

test('UI-023 virtual window bounds 1000 objects and keeps selected/focused rows reachable', () => {
  const top = calculateKnowledgeVirtualWindow({
    itemCount: 1000,
    columnCount: 1,
    rowHeight: 80,
    viewportHeight: 640,
    scrollTop: 0,
    overscanRows: 3,
  });
  const middle = calculateKnowledgeVirtualWindow({
    itemCount: 1000,
    columnCount: 2,
    rowHeight: 132,
    viewportHeight: 660,
    scrollTop: 20_000,
    overscanRows: 2,
  });

  assert.deepEqual(top, {
    startIndex: 0,
    endIndex: 11,
    offsetTop: 0,
    totalHeight: 80_000,
  });
  assert.ok(middle.startIndex > 0);
  assert.ok(middle.endIndex - middle.startIndex <= 20);
  assert.equal(middle.startIndex % 2, 0);
  assert.equal(middle.totalHeight, 66_000);
});

test('UI-023 Library renders a bounded DOM window for a 1000-object projection', () => {
  const seed = loadKnowledgeLibrary(packPath).items[0]!;
  const items = Array.from({ length: 1000 }, (_, index) => ({
    ...seed,
    objectId: `knowledge.synthetic.${String(index).padStart(4, '0')}`,
    title: `Synthetic ${index}`,
  }));
  const html = renderToStaticMarkup(React.createElement(KnowledgeLibrary, {
    allItems: items,
    items,
    filters: {
      query: '',
      domain: '',
      knowledgeForm: '',
      evidenceGrade: '',
      assetMaturity: '',
      lifecycle: '',
    },
    viewState: { sort: 'relevance', density: 'comfortable', layout: 'list' },
    selectedId: items[0]!.objectId,
    hrefForObject: objectId => `/?view=knowledge&object=${objectId}`,
    onFiltersChange: () => undefined,
    onViewStateChange: () => undefined,
    onSelect: () => undefined,
  }));
  const renderedOptions = html.match(/role="option"/gu)?.length ?? 0;

  assert.match(html, /data-virtualized="true"/u);
  assert.ok(renderedOptions > 0);
  assert.ok(renderedOptions <= 20, `expected bounded DOM window, rendered ${renderedOptions} options`);
  assert.doesNotMatch(html, /Synthetic 999/u);
});

test('UI-023–025 components expose keyboard virtualization, evidence-first Inspector and queue/source/diff Review', () => {
  const library = readFileSync(resolve(root, 'components/workspace/KnowledgeLibrary.tsx'), 'utf8');
  const inspector = readFileSync(resolve(root, 'components/workspace/KnowledgeInspector.tsx'), 'utf8');
  const review = readFileSync(resolve(root, 'components/workspace/KnowledgeReviewWorkspace.tsx'), 'utf8');

  assert.match(library, /VIRTUALIZE_KNOWLEDGE_AFTER/u);
  assert.match(library, /ArrowDown|ArrowUp/u);
  assert.match(library, /aria-activedescendant/u);
  assert.match(library, /data-virtualized/u);
  assert.match(inspector, /可信度/u);
  assert.match(inspector, /边界与阻断/u);
  assert.match(inspector, /下一允许动作/u);
  assert.match(inspector, /技术元数据/u);
  assert.match(review, /aria-label="来源证据"/u);
  assert.match(review, /aria-label="字段差异与候选修订"/u);
  assert.match(review, /data-evidence-locator/u);
  assert.match(review, /changedFields/u);
});
