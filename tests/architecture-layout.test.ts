import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildArchitectureViewModel,
  type ArchitectureViewModel,
} from '../lib/canvas/architecture-view-model';
import {
  computeArchitectureFocusedLayout,
  computeArchitectureOverviewLayout,
  type ArchitectureLayoutNode,
  type ArchitectureLayoutResult,
} from '../lib/canvas/layout-engine';
import { parseMarkdownToGraph } from '../lib/parser/markdown-to-graph';
import type { DocCanvas } from '../lib/parser/types';

const BUILTINS = [
  ['vibe-track', 'documents/VibeTrack.md'],
  ['v2-pro', 'documents/v2.7-Pro.md'],
  ['playbook-v2', 'documents/Playbook-v2.md'],
] as const;

function loadBuiltin(id: string, path: string): DocCanvas {
  return parseMarkdownToGraph(readFileSync(path, 'utf8'), id, path);
}

function parseFixture(markdown: string, id = 'fixture'): DocCanvas {
  return parseMarkdownToGraph(markdown, id, `/${id}.md`);
}

function absoluteRectangles(layout: ArchitectureLayoutResult) {
  const byId = new Map(layout.nodes.map(node => [node.id, node]));
  const cache = new Map<string, { x: number; y: number }>();
  const absolutePosition = (node: ArchitectureLayoutNode): { x: number; y: number } => {
    const cached = cache.get(node.id);
    if (cached) return cached;
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    const parentPosition = parent ? absolutePosition(parent) : { x: 0, y: 0 };
    const position = {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y,
    };
    cache.set(node.id, position);
    return position;
  };

  return layout.nodes.map(node => ({ ...node, ...absolutePosition(node) }));
}

function assertNoPeerOverlap(layout: ArchitectureLayoutResult): void {
  const groups = new Map<string, ReturnType<typeof absoluteRectangles>>();
  for (const node of absoluteRectangles(layout)) {
    const key = node.parentId ?? '__root__';
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }

  for (const [parentId, nodes] of groups) {
    for (let left = 0; left < nodes.length; left++) {
      for (let right = left + 1; right < nodes.length; right++) {
        const a = nodes[left];
        const b = nodes[right];
        const overlaps =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        assert.equal(overlaps, false, `${a.id} overlaps ${b.id} under ${parentId}`);
      }
    }
  }
}

function assertOverviewGeometry(model: ArchitectureViewModel): void {
  const layout = computeArchitectureOverviewLayout(model);
  const topLevelCount = layout.nodes.filter(node => !node.parentId).length;
  const ratio = layout.bounds.width / layout.bounds.height;
  const fitZoom = Math.min(
    (1440 - 80) / layout.bounds.width,
    (900 - 80) / layout.bounds.height,
  );

  assert.ok(topLevelCount <= 12, `too many overview objects: ${topLevelCount}`);
  assert.ok(ratio >= 1.2 && ratio <= 2.4, `unexpected aspect ratio: ${ratio}`);
  assert.ok(fitZoom >= 0.35, `overview fit zoom too small: ${fitZoom}`);
  assert.ok(
    layout.nodes.filter(node => node.kind === 'floor').every(node => (node.regionIds?.length ?? 0) <= 4),
    'a floor contains more than four rooms',
  );
  assertNoPeerOverlap(layout);
}

test('real documents use the expected architecture mode and explicit stage headings only', () => {
  const models = Object.fromEntries(BUILTINS.map(([id, path]) => {
    const graph = loadBuiltin(id, path);
    assert.equal(graph.nodes.filter(node => node.metadata.isStageHeading === true).length, 9);
    return [id, buildArchitectureViewModel(graph)];
  }));

  assert.equal(models['vibe-track'].mode, 'lifecycle');
  assert.equal(models['v2-pro'].mode, 'lifecycle');
  assert.equal(models['playbook-v2'].mode, 'module');
  assert.ok(models['v2-pro'].regions.some(region =>
    (region.trackSummaries.find(track => track.track === 'pro')?.count ?? 0) > 0,
  ));

  const nestedLifecycle = models['playbook-v2'].regions.find(region =>
    region.title === '交付与自动化',
  );
  assert.ok(nestedLifecycle);
  assert.deepEqual(nestedLifecycle.nestedStageNumbers, [1, 2, 3, 4, 5, 6, 7, 8]);

  for (const model of Object.values(models)) assertOverviewGeometry(model);
});

test('view model and both layouts are deterministic and map every graph node to a region', () => {
  const graph = loadBuiltin('vibe-track', 'documents/VibeTrack.md');
  const first = buildArchitectureViewModel(graph);
  const second = buildArchitectureViewModel({
    ...graph,
    metadata: { ...graph.metadata, lastParsed: new Date(Date.now() + 60_000).toISOString() },
  });

  assert.equal(first.graphFingerprint, second.graphFingerprint);
  assert.deepEqual(first, second);
  assert.deepEqual(
    computeArchitectureOverviewLayout(first),
    computeArchitectureOverviewLayout(second),
  );
  assert.deepEqual(
    Object.keys(first.nodeRegionId).sort(),
    graph.nodes.map(node => node.id).sort(),
  );

  const stageThree = first.regions.find(region => region.stageNumber === 3);
  assert.ok(stageThree);
  const focused = computeArchitectureFocusedLayout(first, stageThree.id);
  assert.deepEqual(focused, computeArchitectureFocusedLayout(second, stageThree.id));
  assert.equal(focused.nodes.filter(node => node.kind === 'lane').length, 3);
  assertNoPeerOverlap(focused);
});

test('long focused rooms use deterministic multi-column lanes with at least 32px peer gaps', () => {
  const graph = loadBuiltin('playbook-v2', 'documents/Playbook-v2.md');
  const model = buildArchitectureViewModel(graph);
  const region = model.regions.find(candidate => candidate.title === '交付与自动化');
  assert.ok(region);
  const focused = computeArchitectureFocusedLayout(model, region.id);
  const content = focused.nodes.filter(node => node.kind === 'content');
  const distinctX = new Set(content.map(node => node.position.x));

  assert.ok(distinctX.size >= 3, 'long room should use at least three content columns');
  assert.equal(focused.nodes.filter(node => node.kind === 'lane').length, 1);
  assert.ok(focused.bounds.width / focused.bounds.height >= 0.9);
  assertNoPeerOverlap(focused);
});

test('tablet overview preserves the same building hierarchy in a compact deterministic width', () => {
  const graph = loadBuiltin('vibe-track', 'documents/VibeTrack.md');
  const model = buildArchitectureViewModel(graph);
  const desktop = computeArchitectureOverviewLayout(model);
  const tablet = computeArchitectureOverviewLayout(model, 'tablet');

  assert.equal(tablet.bounds.width, 1000);
  assert.ok(tablet.bounds.width < desktop.bounds.width);
  assert.deepEqual(
    tablet.nodes.map(node => ({ id: node.id, kind: node.kind, regionIds: node.regionIds })),
    desktop.nodes.map(node => ({ id: node.id, kind: node.kind, regionIds: node.regionIds })),
  );
  assert.deepEqual(tablet, computeArchitectureOverviewLayout(model, 'tablet'));
  assertNoPeerOverlap(tablet);
});

test('overview exposes every room as an independently connectable child node', () => {
  for (const [id, path] of BUILTINS) {
    const model = buildArchitectureViewModel(loadBuiltin(id, path));
    const layout = computeArchitectureOverviewLayout(model);
    const expectedRooms = model.regions.filter(region => region.kind === 'room');
    const roomNodes = layout.nodes.filter(node => node.kind === 'room');
    const nodeIds = new Set(layout.nodes.map(node => node.id));

    assert.equal(roomNodes.length, expectedRooms.length, id);
    assert.deepEqual(
      roomNodes.map(node => node.regionId).sort(),
      expectedRooms.map(region => region.id).sort(),
      id,
    );
    assert.ok(roomNodes.every(node => node.parentId?.startsWith('floor:')), id);
    assert.ok(layout.edges.length >= Math.max(0, expectedRooms.length - 1), id);
    assert.ok(layout.edges.every(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)), id);
    assert.ok(layout.edges.every(edge => !edge.source.startsWith('floor:') && !edge.target.startsWith('floor:')), id);
    assert.ok(layout.edges.every(edge => edge.sourceHandle.endsWith('-out')), id);
    assert.ok(layout.edges.every(edge => edge.targetHandle.endsWith('-in')), id);
    assert.ok(layout.edges.every(edge => edge.marker === 'arrow-closed'), id);
    assert.ok(layout.edges.every(edge => edge.waypoints.length >= 2), id);
  }
});

test('Playbook overview includes ordered flow plus an explicit governance relation', () => {
  const model = buildArchitectureViewModel(loadBuiltin('playbook-v2', 'documents/Playbook-v2.md'));
  const layout = computeArchitectureOverviewLayout(model);

  assert.equal(layout.edges.filter(edge => edge.kind === 'flow').length, 7);
  assert.ok(layout.edges.some(edge => edge.kind === 'governance'));
  assert.ok(layout.edges.every(edge => edge.animated === false));
});

test('focused room projects source graph relationships between visible content nodes', () => {
  const model = buildArchitectureViewModel(loadBuiltin('playbook-v2', 'documents/Playbook-v2.md'));
  const room = model.regions.find(region => region.id === 'region:module:delivery-automation');
  assert.ok(room);
  const layout = computeArchitectureFocusedLayout(model, room.id);
  const contentIds = new Set(
    layout.nodes.filter(node => node.kind === 'content').map(node => node.id),
  );

  assert.ok(layout.edges.length > 0);
  assert.ok(layout.edges.every(edge => contentIds.has(edge.source) && contentIds.has(edge.target)));
  assert.ok(layout.edges.every(edge => ['flow', 'dependency', 'governance', 'resource'].includes(edge.kind)));
  assert.ok(layout.edges.every(edge => edge.waypoints.length >= 2));
});

test('module fallback keeps duplicate and long H2 headings in unique rooms with four rooms per floor', () => {
  const longTitle = '非常长的模块标题'.repeat(18);
  const graph = parseFixture(`# Architecture notes

## Repeat

First module.

### Shared details

Details.

## Repeat

Second module.

## ${longTitle}

Long title content.

## Last module

Last.

## Fifth module

Fifth.
`, 'module-fallback');
  const model = buildArchitectureViewModel(graph);
  const repeated = model.regions.filter(region => region.sourceTitle === 'Repeat');

  assert.equal(model.mode, 'module');
  assert.equal(repeated.length, 2);
  assert.deepEqual(repeated.map(region => region.title), ['Repeat', 'Repeat 02']);
  assert.notEqual(repeated[0].id, repeated[1].id);
  const longRegion = model.regions.find(region => region.sourceTitle === longTitle);
  assert.ok(longRegion);
  assert.ok([...longRegion.title].length <= 36);
  assert.ok(model.floors.every(floor => floor.regionIds.length <= 4));
  assertOverviewGeometry(model);
});

test('missing stages and a single track retain lifecycle semantics without inventing rooms', () => {
  const graph = parseFixture(`# Sparse lifecycle

## 阶段①：Discover

### 🚀 Vibe Track

#### Interview

Talk to users.

## 阶段④：Build

### Implementation

Build it.

## 阶段⑧：Evolve

### Review

Improve it.
`, 'sparse-lifecycle');
  const model = buildArchitectureViewModel(graph);

  assert.equal(model.mode, 'lifecycle');
  assert.deepEqual(
    model.regions.flatMap(region => region.stageNumber === undefined ? [] : [region.stageNumber]),
    [1, 4, 8],
  );
  assert.equal(model.regions.some(region => region.stageNumber === 2), false);
  assertOverviewGeometry(model);
});

test('focused layout aggregates tools, prompts and references instead of laying them out as cards', () => {
  const graph = parseFixture(`# Resource-heavy lifecycle

## 阶段①：Discover

### 🚀 Vibe Track

#### Prototype

Use **Mastra**, **LangGraph**, **Playwright**, and **Supabase**.

\`\`\`text
Codex prompt: produce a validated prototype and report the evidence.
\`\`\`

## 阶段②：Build

### Implementation

Build it.

## 阶段③：Ship

### Delivery

Ship it.
`, 'resource-heavy');
  const model = buildArchitectureViewModel(graph);
  const firstStage = model.regions.find(region => region.stageNumber === 1);
  assert.ok(firstStage);
  assert.ok(firstStage.resources.referenceNodeIds.length >= 4);
  assert.ok(firstStage.resources.promptNodeIds.length >= 1);

  const focused = computeArchitectureFocusedLayout(model, firstStage.id);
  const contentIds = new Set(
    focused.nodes.filter(node => node.kind === 'content').map(node => node.nodeId),
  );
  assert.ok(firstStage.resources.referenceNodeIds.every(nodeId => !contentIds.has(nodeId)));
  assert.ok(
    firstStage.resources.promptNodeIds.some(nodeId => contentIds.has(nodeId)),
    'a prompt-bearing content host remains visible while its prompt is aggregated',
  );
  assert.equal(focused.nodes.filter(node => node.kind === 'resource').length, 1);
  assertNoPeerOverlap(focused);
});

test('focused layout rejects an unknown region instead of silently falling back', () => {
  const graph = loadBuiltin('vibe-track', 'documents/VibeTrack.md');
  const model = buildArchitectureViewModel(graph);
  assert.throws(
    () => computeArchitectureFocusedLayout(model, 'region:missing'),
    /Unknown architecture region/,
  );
});
