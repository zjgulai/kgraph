import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildKnowledgeCanvasProjection } from '../lib/knowledge/canvas-projection';
import { materializeFactoryScene } from '../lib/canvas/factory-scene';
import { KnowledgeCanvasWorkspace } from '../components/workspace/KnowledgeCanvasWorkspace';
import { loadKnowledgeLibrary } from '../lib/server/knowledge-library';
import {
  knowledgeReviewPatchFromObject,
  loadKnowledgeReviewObject,
  updateKnowledgeReviewObject,
} from '../lib/server/knowledge-review-store';

const root = resolve(import.meta.dirname, '..');
const packPath = resolve(root, '../product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json');

test('candidate objects project into deterministic domain groups without invented relations', () => {
  const library = loadKnowledgeLibrary(packPath);
  const first = buildKnowledgeCanvasProjection(library.items);
  const second = buildKnowledgeCanvasProjection([...library.items].reverse());

  assert.deepEqual(first, second);
  assert.equal(first.groups.length, 8);
  assert.equal(first.objects.length, 37);
  assert.equal(first.relations.length, 0);
  assert.equal(first.layout.nodes.length, 45);
  assert.equal(first.layout.edges.length, 0);
  assert.equal(materializeFactoryScene(first.layout).edges.length, 0);
  assert.equal(first.layout.nodes.filter(node => node.kind === 'group').length, 8);
  assert.equal(first.layout.nodes.filter(node => node.kind === 'content').length, 37);
});

test('explicit Knowledge Object relations map to routed scene edges one-for-one', () => {
  const library = loadKnowledgeLibrary(packPath);
  const targetId = library.items[4]!.objectId;
  const relationTypes = [
    ['requires', 'dependency'],
    ['supports', 'resource'],
    ['contradicts', 'governance'],
    ['derived_from', 'flow'],
  ] as const;
  const items = library.items.map((item, index) => index < relationTypes.length ? {
    ...item,
    relations: [{
      relationType: relationTypes[index]![0],
      targetId,
      rationale: `fixture ${relationTypes[index]![0]}`,
    }],
  } : item);
  const projection = buildKnowledgeCanvasProjection(items);
  const scene = materializeFactoryScene(projection.layout);

  assert.equal(projection.relations.length, 4);
  assert.equal(projection.layout.edges.length, 4);
  assert.equal(scene.edges.length, 4);
  assert.deepEqual(new Set(scene.edges.map(edge => edge.kind)), new Set(relationTypes.map(([, kind]) => kind)));
  for (const edge of scene.edges) {
    assert.equal(edge.path.startsWith('M '), true);
    assert.equal(edge.waypoints.length >= 2, true);
    for (let index = 1; index < edge.waypoints.length; index += 1) {
      const previous = edge.waypoints[index - 1]!;
      const current = edge.waypoints[index]!;
      assert.equal(previous.x === current.x || previous.y === current.y, true, edge.id);
    }
  }
});

test('a relation target outside the complete projection fails fast', () => {
  const library = loadKnowledgeLibrary(packPath);
  const items = library.items.map((item, index) => index === 0 ? {
    ...item,
    relations: [{ relationType: 'requires' as const, targetId: 'knowledge.missing.target' }],
  } : item);
  assert.throws(
    () => buildKnowledgeCanvasProjection(items),
    /KNOWLEDGE_CANVAS_RELATION_TARGET_MISSING/u,
  );
});

test('workspace read model overlays saved candidate revisions without write side effects', () => {
  const storeDir = join(mkdtempSync(join(tmpdir(), 'doccanvas-canvas-overlay-')), 'knowledge-candidates');
  const current = loadKnowledgeReviewObject({
    objectId: 'knowledge.mcp_servers.context7',
    packPath,
    storeDir,
  });
  const patch = knowledgeReviewPatchFromObject(current.object);
  patch.title = 'Context7 · current overlay';
  patch.valid_time = { from: '2026-07-04T00:00:00Z', until: null };
  const saved = updateKnowledgeReviewObject({
    objectId: current.object.object_id,
    baseRevision: current.revision,
    baseObjectHash: current.objectHash,
    patch,
    actor: 'owner.canvas-test',
    mutationId: 'canvas.overlay.r2',
    mutatedAt: '2026-07-18T13:00:00Z',
    packPath,
    storeDir,
  });
  const before = readdirSync(storeDir, { recursive: true }).map(String).sort();
  const library = loadKnowledgeLibrary(packPath, storeDir);
  const after = readdirSync(storeDir, { recursive: true }).map(String).sort();
  const item = library.items.find(candidate => candidate.objectId === current.object.object_id);

  assert.equal(item?.title, saved.object.title);
  assert.equal(item?.revision, 2);
  assert.equal(item?.objectHash, saved.objectHash);
  assert.deepEqual(after, before);
});

test('Knowledge Canvas states the zero-relation boundary and stays outside CanvasViewer', () => {
  const library = loadKnowledgeLibrary(packPath);
  const html = renderToStaticMarkup(React.createElement(KnowledgeCanvasWorkspace, {
    library,
    onSelectKnowledge: () => undefined,
  }));
  assert.match(html, /Knowledge Canvas/u);
  assert.match(html, /尚无语义关系/u);
  assert.match(html, /没有自动推断或伪造连接线/u);
  assert.match(html, /37/u);
  assert.doesNotMatch(html, /编辑关系|保存关系|canonical promotion/u);
});
