import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  shouldBlockWorkbenchNavigation,
  type WorkbenchDirtyRegistry,
} from '../lib/workbench/draft-navigation';
import {
  goldDraftStorageKey,
  parseGoldWorkspaceDraft,
  serializeGoldWorkspaceDraft,
} from '../lib/knowledge/gold-workspace-draft';

const root = resolve(import.meta.dirname, '..');

test('UI-014 blocks cross-workspace navigation for every dirty editor unless explicitly bypassed', () => {
  const registry: WorkbenchDirtyRegistry = {
    capture: true,
    review: true,
    enrichment: true,
    solutions: true,
    blueprints: true,
  };

  for (const view of Object.keys(registry) as Array<keyof WorkbenchDirtyRegistry>) {
    assert.equal(shouldBlockWorkbenchNavigation(view, 'work', registry, false), true, view);
    assert.equal(shouldBlockWorkbenchNavigation(view, view, registry, false), false, view);
    assert.equal(shouldBlockWorkbenchNavigation(view, 'work', registry, true), false, view);
  }
});

test('Human Gold browser draft is versioned, bounded and fails closed', () => {
  const value = {
    captureId: 'capture-3a8ec1e432abed2edf51d9d3',
    sourceHash: 'sha256:source',
    baseRevision: 2,
    baseAnnotationHash: 'sha256:annotation',
    draft: {
      title: '人工标题',
      summary: '人工摘要',
      keyPoints: '一\n二',
      objectType: 'claim',
      primary: 'fact',
      subform: 'observation',
      domains: 'ai-product.knowledge',
      startLine: 1,
      endLine: 4,
    },
  };
  const serialized = serializeGoldWorkspaceDraft(value);
  assert.deepEqual(parseGoldWorkspaceDraft(serialized), value);
  assert.equal(goldDraftStorageKey(value.captureId), `doccanvas:gold-draft:v1:${value.captureId}`);
  assert.equal(parseGoldWorkspaceDraft('{"schemaVersion":"old"}'), null);
  assert.throws(() => serializeGoldWorkspaceDraft({ ...value, draft: { ...value.draft, summary: 'x'.repeat(40_000) } }), /invalid/u);
  assert.equal(parseGoldWorkspaceDraft('x'.repeat(40_000)), null);
});

test('all workbench editors report dirty state to the shared navigation guard', () => {
  const workspace = readFileSync(resolve(root, 'components/workspace/KnowledgeWorkspace.tsx'), 'utf8');
  const capture = readFileSync(resolve(root, 'components/workspace/CaptureWorkspace.tsx'), 'utf8');
  const solution = readFileSync(resolve(root, 'components/workspace/SolutionStudioWorkspace.tsx'), 'utf8');
  const blueprint = readFileSync(resolve(root, 'components/workspace/BlueprintWorkspace.tsx'), 'utf8');
  const enrichment = readFileSync(resolve(root, 'components/workspace/EnrichmentWorkspace.tsx'), 'utf8');

  assert.match(workspace, /shouldBlockWorkbenchNavigation/u);
  for (const view of ['capture', 'review', 'enrichment', 'solutions', 'blueprints']) {
    assert.match(workspace, new RegExp(`setWorkbenchDirty\\('${view}'`, 'u'));
  }
  assert.match(solution, /onDirtyChange\?\.\(touched\)/u);
  assert.match(blueprint, /onDirtyChange\?\.\(dirty\)/u);
  assert.match(enrichment, /onDirtyChange\?\.\(goldDirty\)/u);
  assert.match(enrichment, /parseGoldWorkspaceDraft|serializeGoldWorkspaceDraft/u);
  assert.match(capture, /const warn = \(event: BeforeUnloadEvent\) => \{\s+persistDraft\(\);/u);
});

test('UI-072 and UI-073 are backed by explicit employee governance and deterministic portrait contracts', () => {
  const cockpit = readFileSync(resolve(root, 'components/workspace/EvolutionCockpit.tsx'), 'utf8');
  const projection = readFileSync(resolve(root, 'lib/product/operations-projection.ts'), 'utf8');
  const employee = readFileSync(resolve(root, 'components/canvas/DigitalEmployee.tsx'), 'utf8');
  const inspector = readFileSync(resolve(root, 'components/canvas/FactoryOwnerInspector.tsx'), 'utf8');

  for (const field of ['queueCount', 'capabilities', 'permissions', 'lastOutput', 'blockedBy', 'humanGate']) {
    assert.match(projection, new RegExp(field, 'u'));
  }
  assert.match(projection, /canExecute: false/u);
  assert.match(cockpit, /真实队列，不是头像墙/u);
  assert.match(cockpit, /employee\.permissions/u);
  assert.match(cockpit, /employee\.humanGate/u);
  assert.match(employee, /digital-employee__fallback/u);
  assert.match(employee, /\/digital-employees\//u);
  assert.match(inspector, /4:5 裁剪预览/u);
  assert.match(inspector, /最大 5MB、1200 万像素；自动裁为 4:5 WebP/u);
});
