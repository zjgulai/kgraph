import assert from 'node:assert/strict';
import test from 'node:test';

import type { NodePresentation } from '../lib/canvas/document-presentation';
import { createDocumentSearchIndex } from '../lib/canvas/search-index';
import type { DocNode } from '../lib/parser/types';

function node(id: string, title: string, summary: string, content: string): DocNode {
  return {
    id,
    type: 'section',
    title,
    summary,
    content,
    level: 2,
    position: { x: 0, y: 0 },
    contentBlocks: [],
    metadata: {},
    children: [],
  };
}

function presentation(nodeId: string, displayTitle: string, sourceLabel: string): NodePresentation {
  return {
    nodeId,
    displayTitle,
    displaySummary: `${displayTitle}的产品摘要`,
    sourceLabel,
    badges: [],
    previewKind: 'prose',
    accessibleLabel: `${displayTitle}。来源:${sourceLabel}`,
  };
}

test('raw and display queries resolve to the same display-only result payload', () => {
  const nodes = [
    node(
      'release',
      '🚀 阶段⑥：上线、发布与持续运行',
      '发布前固定候选。',
      'rollback-owner-only-secret',
    ),
    node('research', '阶段①：调研', '理解用户问题。', 'interview-five-users'),
  ];
  const byNodeId = new Map<string, NodePresentation>([
    ['release', presentation('release', '发布与运行', '阶段6:上线、发布与持续运行')],
    ['research', presentation('research', '机会与需求', '阶段1:调研')],
  ]);
  const index = createDocumentSearchIndex(nodes, byNodeId, {
    release: 'release-region',
    research: 'research-region',
  });

  const rawTitleHit = index.search('持续运行');
  const rawContentHit = index.search('rollback-owner-only-secret');
  const displayHit = index.search('发布与运行');

  assert.equal(rawTitleHit[0]?.nodeId, 'release');
  assert.equal(rawContentHit[0]?.nodeId, 'release');
  assert.equal(displayHit[0]?.nodeId, 'release');
  assert.deepEqual(Object.keys(rawContentHit[0] ?? {}).sort(), [
    'accessibleLabel',
    'displaySummary',
    'displayTitle',
    'nodeId',
    'regionId',
    'sourceLabel',
  ]);
  assert.doesNotMatch(JSON.stringify(rawContentHit), /rollback-owner-only-secret/u);
  assert.doesNotMatch(JSON.stringify(index.entries), /rollback-owner-only-secret/u);
  assert.ok(Object.isFrozen(index.entries));
  assert.ok(index.entries.every(entry => Object.isFrozen(entry)));
});

test('search ranking, limits, normalization, and repeated builds are deterministic', () => {
  const nodes = [
    node('first', 'First RAW release', '', 'shared keyword'),
    node('second', 'Second RAW release', '', 'shared keyword'),
  ];
  const byNodeId = new Map<string, NodePresentation>([
    ['first', presentation('first', 'Release Center', 'First release')],
    ['second', presentation('second', 'Release Operations', 'Second release')],
  ]);
  const first = createDocumentSearchIndex(nodes, byNodeId);
  const second = createDocumentSearchIndex(nodes, byNodeId);

  assert.deepEqual(first.entries, second.entries);
  assert.deepEqual(first.search('  RELEASE   '), second.search('release'));
  assert.deepEqual(first.search('shared keyword').map(result => result.nodeId), ['first', 'second']);
  assert.deepEqual(first.search('shared keyword', 1).map(result => result.nodeId), ['first']);
  assert.deepEqual(first.search('shared keyword', 0), []);
  assert.deepEqual(first.search(''), []);
});
