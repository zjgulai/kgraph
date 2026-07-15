import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FACTORY_EMPLOYEE_ROLES,
  buildFactoryPresentationMap,
  resolveFactoryPresentation,
} from '../lib/canvas/factory-presentation';
import { buildArchitectureViewModel } from '../lib/canvas/architecture-view-model';
import { parseMarkdownToGraph } from '../lib/parser/markdown-to-graph';
import type { ArchitectureRegion } from '../lib/canvas/architecture-view-model';
import type { DocCanvas } from '../lib/parser/types';

function loadBuiltin(id: string, path: string): DocCanvas {
  return parseMarkdownToGraph(readFileSync(path, 'utf8'), id, path);
}

test('factory registry defines eight unique, asset-addressable digital employee roles', () => {
  assert.equal(FACTORY_EMPLOYEE_ROLES.length, 8);
  assert.equal(new Set(FACTORY_EMPLOYEE_ROLES.map(role => role.id)).size, 8);
  assert.equal(new Set(FACTORY_EMPLOYEE_ROLES.map(role => role.displayName)).size, 8);
  assert.equal(new Set(FACTORY_EMPLOYEE_ROLES.map(role => role.portraitKey)).size, 8);
  assert.equal(new Set(FACTORY_EMPLOYEE_ROLES.map(role => role.environmentKey)).size, 8);

  for (const role of FACTORY_EMPLOYEE_ROLES) {
    assert.ok(role.roleTitle.length >= 4, role.id);
    assert.ok(role.responsibility.length >= 8, role.id);
    assert.equal(role.defaultStatus, 'needs-validation');
  }
});
test('Playbook capability rooms map one-to-one to the eight shared factory roles', () => {
  const model = buildArchitectureViewModel(loadBuiltin('playbook-v2', 'documents/Playbook-v2.md'));
  const presentations = buildFactoryPresentationMap(model);
  const rooms = model.regions.filter(region => region.kind === 'room');

  assert.deepEqual(rooms.map(region => presentations.get(region.id)?.employee?.id), [
    'product-navigation-consultant',
    'factory-operations-designer',
    'product-knowledge-architect',
    'security-governance-officer',
    'evolution-evaluator',
    'delivery-engineer',
    'business-analyst',
    'boundary-auditor',
  ]);
  assert.equal(new Set(rooms.map(region => presentations.get(region.id)?.employee?.id)).size, 8);
  assert.ok(rooms.every(region => presentations.get(region.id)?.roomCode.startsWith('M')));
});

test('lifecycle stages reuse all eight roles through an explicit semantic mapping', () => {
  const model = buildArchitectureViewModel(loadBuiltin('vibe-track', 'documents/VibeTrack.md'));
  const presentations = buildFactoryPresentationMap(model);
  const stages = model.regions
    .filter(region => region.stageNumber !== undefined)
    .sort((left, right) => left.stageNumber! - right.stageNumber!);

  assert.equal(presentations.get('region:stage:0')?.employee, null);
  assert.deepEqual(stages.slice(1).map(region => presentations.get(region.id)?.employee?.id), [
    'product-navigation-consultant',
    'factory-operations-designer',
    'product-knowledge-architect',
    'delivery-engineer',
    'boundary-auditor',
    'security-governance-officer',
    'business-analyst',
    'evolution-evaluator',
  ]);
  assert.ok(stages.slice(1).every(region => presentations.get(region.id)?.roomCode.startsWith('S')));
});

test('factory presentation is deterministic and unknown regions use a neutral fallback', () => {
  const model = buildArchitectureViewModel(loadBuiltin('v2-pro', 'documents/v2.7-Pro.md'));
  const first = [...buildFactoryPresentationMap(model).entries()];
  const second = [...buildFactoryPresentationMap(model).entries()];
  assert.deepEqual(first, second);

  const unknown: ArchitectureRegion = {
    id: 'region:module:future-capability',
    kind: 'room',
    title: '未来能力',
    sourceTitle: '未来能力',
    sourceTitles: ['未来能力'],
    sourceLabels: ['未来能力'],
    summary: '尚未分配岗位',
    order: 99,
    headingNodeIds: [],
    nodeIds: [],
    previewNodeIds: [],
    trackSummaries: [],
    resources: {
      count: 0,
      toolNodeIds: [],
      promptNodeIds: [],
      referenceNodeIds: [],
      previews: [],
    },
    nestedStageNumbers: [],
  };
  const fallback = resolveFactoryPresentation(unknown, 'module');

  assert.equal(fallback.employee, null);
  assert.equal(fallback.environment.id, 'unassigned-room');
  assert.equal(fallback.status, 'needs-validation');
  assert.equal(fallback.accentTone, 'neutral');
});
