import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { test } from 'node:test';
import { join } from 'path';
import { buildArchitectureViewModel } from '../lib/canvas/architecture-view-model';
import {
  createFactorySpatialIndex,
  materializeFactoryScene,
  pointAlongPolyline,
  polylineLength,
  queryFactorySpatialIndex,
} from '../lib/canvas/factory-scene';
import { computeArchitectureFocusedLayout, computeArchitectureOverviewLayout } from '../lib/canvas/layout-engine';
import { parseMarkdownToGraph } from '../lib/parser/markdown-to-graph';

const root = process.cwd();

function playbookModel() {
  const filePath = join(root, 'documents/Playbook-v2.md');
  const graph = parseMarkdownToGraph(readFileSync(filePath, 'utf8'), 'playbook-v2', filePath);
  return buildArchitectureViewModel(graph);
}

test('factory scene renders every focused model relation without React Flow handle lookup', () => {
  const model = playbookModel();
  const region = model.regions.find(candidate => candidate.id === 'region:module:self-evolution');
  assert.ok(region);
  const sourceRelations = model.sourceEdges.filter(edge => (
    region.nodeIds.includes(edge.source) && region.nodeIds.includes(edge.target)
  ));
  const layout = computeArchitectureFocusedLayout(model, region.id);
  const scene = materializeFactoryScene(layout);

  assert.equal(sourceRelations.length, 8);
  assert.equal(layout.edges.length, sourceRelations.length);
  assert.equal(scene.edges.length, sourceRelations.length);
  assert.ok(scene.edges.every(edge => edge.length > 24));
  assert.ok(scene.edges.every(edge => /^M [\d.-]+ [\d.-]+(?: L [\d.-]+ [\d.-]+)+$/.test(edge.path)));
});

test('factory overview arrows retain visible line body and use true path midpoint labels', () => {
  const layout = computeArchitectureOverviewLayout(playbookModel());
  const scene = materializeFactoryScene(layout);

  for (const edge of scene.edges) {
    assert.ok(edge.length >= 24, `${edge.id} line body is ${edge.length}`);
    assert.deepEqual(edge.labelPoint, pointAlongPolyline(edge.waypoints, 0.5));
    assert.equal(polylineLength(edge.waypoints), edge.length);
  }
});

test('dragging a content node moves its endpoint and keeps all segments orthogonal', () => {
  const model = playbookModel();
  const region = model.regions.find(candidate => candidate.id === 'region:module:self-evolution');
  assert.ok(region);
  const layout = computeArchitectureFocusedLayout(model, region.id);
  const moving = layout.nodes.find(node => node.kind === 'content' && layout.edges.some(edge => edge.source === node.id));
  assert.ok(moving);
  const baseline = materializeFactoryScene(layout);
  const baselineNode = baseline.nodes.find(node => node.id === moving.id)!;
  const moved = materializeFactoryScene(layout, {
    [moving.id]: {
      x: baselineNode.absolutePosition.x + 8,
      y: baselineNode.absolutePosition.y + 8,
    },
  });
  const changed = moved.edges.find(edge => edge.source === moving.id || edge.target === moving.id);
  assert.ok(changed);
  assert.ok(changed.waypoints.every((point, index) => (
    index === 0
    || point.x === changed.waypoints[index - 1].x
    || point.y === changed.waypoints[index - 1].y
  )));
  assert.notDeepEqual(changed.waypoints, baseline.edges.find(edge => edge.id === changed.id)?.waypoints);
});

test('spatial index limits scene candidates to viewport cells without losing intersecting relations', () => {
  const scene = materializeFactoryScene(computeArchitectureOverviewLayout(playbookModel()));
  const index = createFactorySpatialIndex(scene.nodes, scene.edges, 160);
  const target = scene.nodes.find(node => node.kind === 'room');
  assert.ok(target);
  const query = queryFactorySpatialIndex(index, {
    left: target.absolutePosition.x,
    top: target.absolutePosition.y,
    right: target.absolutePosition.x + target.width,
    bottom: target.absolutePosition.y + target.height,
  });
  assert.ok(query.nodeIds.has(target.id));
  assert.ok(query.nodeIds.size < scene.nodes.length);
  const connected = scene.edges.filter(edge => edge.source === target.id || edge.target === target.id);
  assert.ok(connected.length > 0);
  assert.ok(connected.some(edge => query.edgeIds.has(edge.id)));
});
