import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDocNodeHiddenByTrack,
  removeDocNodeFromView,
  updateDocNodeAfterSave,
} from '../lib/canvas/doc-node-state';
import type { DocNode } from '../lib/parser/types';

function node(id: string): DocNode {
  return {
    id,
    type: 'subsection',
    title: `Title ${id}`,
    content: `Content ${id}`,
    summary: `Summary ${id}`,
    level: 3,
    position: { x: 0, y: 0 },
    contentBlocks: [],
    metadata: { sectionHash: `hash-${id}` },
    children: [],
  };
}

test('updates title, content, summary and hash in canonical DocNode state', () => {
  const first = node('one');
  const second = node('two');
  const before = [first, second];

  const after = updateDocNodeAfterSave(before, {
    id: first.id,
    title: 'Updated title',
    content: '\nUpdated body\nsecond line',
    hash: 'updated-hash',
  });

  assert.notEqual(after, before);
  assert.notEqual(after[0], first);
  assert.equal(after[1], second);
  assert.deepEqual(
    {
      title: after[0].title,
      content: after[0].content,
      summary: after[0].summary,
      hash: after[0].metadata.sectionHash,
    },
    {
      title: 'Updated title',
      content: '\nUpdated body\nsecond line',
      summary: 'Updated body',
      hash: 'updated-hash',
    },
  );
});

test('removes a marked node from canonical view state without mutating the input', () => {
  const before = [node('one'), node('two')];
  const after = removeDocNodeFromView(before, 'one');

  assert.deepEqual(after.map(item => item.id), ['two']);
  assert.deepEqual(before.map(item => item.id), ['one', 'two']);
});

test('collapses only Vibe or Pro nodes and never hides shared track content', () => {
  const vibe = { ...node('vibe'), stageNumber: 1, track: 'vibe' as const };
  const shared = { ...node('shared'), stageNumber: 1, track: 'both' as const };

  assert.equal(isDocNodeHiddenByTrack(vibe, new Set()), true);
  assert.equal(isDocNodeHiddenByTrack(vibe, new Set(['stage1-vibe'])), false);
  assert.equal(isDocNodeHiddenByTrack(shared, new Set()), false);
});
