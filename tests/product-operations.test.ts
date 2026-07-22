import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { afterEach } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import { loadKnowledgeLibrary } from '../lib/server/knowledge-library';
import { createBlueprintCandidate, loadBlueprintCandidate } from '../lib/server/blueprint-workspace-store';
import { compileBlueprintArtifact } from '../lib/server/blueprint-artifact-store';
import {
  ArtifactCatalogError,
  listBlueprintArtifacts,
} from '../lib/server/artifact-catalog';
import { buildProductOperationsProjection } from '../lib/product/operations-projection';
import { ArtifactWorkspace } from '../components/workspace/ArtifactWorkspace';
import { WorkflowWorkspace } from '../components/workspace/WorkflowWorkspace';
import { TimelineWorkspace } from '../components/workspace/TimelineWorkspace';
import { EvolutionCockpit } from '../components/workspace/EvolutionCockpit';
import { GET as GET_OPERATIONS } from '../app/api/operations/route';

const root = resolve(import.meta.dirname, '..');
const packPath = resolve(root, '../product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json');
const approvedFixturePath = resolve(root, '../product/blueprint-fixtures/valid-approved-blueprint.yaml');
const original = {
  pack: process.env.DOCCANVAS_KNOWLEDGE_PACK_PATH,
  knowledgeStore: process.env.DOCCANVAS_KNOWLEDGE_STORE_PATH,
  blueprintStore: process.env.DOCCANVAS_BLUEPRINT_STORE_PATH,
  artifactPath: process.env.DOCCANVAS_BLUEPRINT_ARTIFACT_PATH,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('DOCCANVAS_KNOWLEDGE_PACK_PATH', original.pack);
  restore('DOCCANVAS_KNOWLEDGE_STORE_PATH', original.knowledgeStore);
  restore('DOCCANVAS_BLUEPRINT_STORE_PATH', original.blueprintStore);
  restore('DOCCANVAS_BLUEPRINT_ARTIFACT_PATH', original.artifactPath);
});

function compiledFixture() {
  const workspace = mkdtempSync(join(tmpdir(), 'doccanvas-operations-'));
  const storeDir = join(workspace, 'blueprints');
  const artifactDir = join(workspace, 'artifacts');
  const approved = parseYaml(readFileSync(approvedFixturePath, 'utf8'));
  createBlueprintCandidate({
    storeDir,
    blueprint: approved,
    actor: 'owner.test',
    mutationId: 'operations.approved.create',
    mutatedAt: '2026-07-18T15:00:00Z',
  });
  compileBlueprintArtifact({
    storeDir,
    artifactDir,
    blueprintId: 'blueprint.support-gpt',
    compiledAt: '2026-07-18T15:06:00Z',
  });
  return { workspace, storeDir, artifactDir };
}

test('artifact catalog validates provenance and deterministically compiles four product views', () => {
  const { artifactDir } = compiledFixture();
  const first = listBlueprintArtifacts({ artifactDir });
  const second = listBlueprintArtifacts({ artifactDir });
  assert.deepEqual(first, second);
  assert.equal(first.length, 1);
  const artifact = first[0]!;
  assert.equal(artifact.manifest.blueprintId, 'blueprint.support-gpt');
  assert.equal(artifact.views.source.genomeHash, artifact.manifest.genomeHash);
  assert.equal(artifact.views.source.productionStatus, 'unchanged');
  assert.equal(artifact.views.prd.productName, 'SupportGPT');
  assert.equal(artifact.views.architecture.frontend.framework, 'next.js');
  assert.equal(artifact.views.evaluation.gates.length, 3);
  assert.equal(artifact.views.delivery.releaseState, 'candidate_only');
});

test('artifact catalog fails fast on checksum drift and missing reads have no side effects', () => {
  const parent = mkdtempSync(join(tmpdir(), 'doccanvas-artifact-read-'));
  const missing = join(parent, 'missing');
  assert.deepEqual(listBlueprintArtifacts({ artifactDir: missing }), []);
  assert.equal(existsSync(missing), false);

  const { artifactDir } = compiledFixture();
  const artifact = listBlueprintArtifacts({ artifactDir })[0]!;
  writeFileSync(artifact.genomePath, `${readFileSync(artifact.genomePath, 'utf8')}\n# tampered\n`, 'utf8');
  assert.throws(
    () => listBlueprintArtifacts({ artifactDir }),
    (error: unknown) => error instanceof ArtifactCatalogError && error.code === 'ARTIFACT_GENOME_HASH_MISMATCH',
  );
});

test('operations projection uses evidence for workflow, bitemporal timeline and candidate-only evolution', () => {
  const { storeDir, artifactDir } = compiledFixture();
  const library = loadKnowledgeLibrary(packPath);
  const blueprint = loadBlueprintCandidate({ storeDir, blueprintId: 'blueprint.support-gpt' });
  const projection = buildProductOperationsProjection({
    library,
    blueprints: [blueprint],
    artifacts: listBlueprintArtifacts({ artifactDir }),
  });
  assert.equal(projection.artifacts.length, 1);
  assert.equal(projection.workflow.find(stage => stage.id === 'artifact')?.state, 'complete');
  assert.equal(projection.workflow.find(stage => stage.id === 'evolution')?.state, 'blocked');
  assert.equal(
    projection.timeline.observed.events.length,
    projection.evidenceRegistry.items.filter(item => item.observedAt !== null).length,
  );
  assert.equal(projection.timeline.events.every(event => projection.evidenceRegistry.items.some(item => item.evidenceId === event.evidenceId)), true);
  assert.equal(projection.timeline.valid.unknownCount, library.items.filter(item => item.validTime.from === null).length);
  assert.equal(projection.evolution.checks.some(check => check.status === 'not_measured'), true);
  assert.equal(projection.evolution.checks.some(check => check.evidence.includes('simulated')), false);
  assert.equal(projection.evolution.actions.every(action => action.executed === false), true);
  assert.equal(projection.evolution.employees.every(employee => employee.canExecute === false), true);
});

test('operations API is read-only and empty data roots remain side-effect free', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'doccanvas-operations-api-'));
  process.env.DOCCANVAS_KNOWLEDGE_PACK_PATH = packPath;
  process.env.DOCCANVAS_KNOWLEDGE_STORE_PATH = join(workspace, 'knowledge');
  process.env.DOCCANVAS_BLUEPRINT_STORE_PATH = join(workspace, 'blueprints');
  process.env.DOCCANVAS_BLUEPRINT_ARTIFACT_PATH = join(workspace, 'artifacts');
  const response = await GET_OPERATIONS();
  assert.equal(response.status, 200);
  const projection = await response.json() as { artifacts: unknown[]; evolution: { actions: Array<{ executed: boolean }> } };
  assert.deepEqual(projection.artifacts, []);
  assert.equal(projection.evolution.actions.every(action => action.executed === false), true);
  assert.equal(existsSync(process.env.DOCCANVAS_BLUEPRINT_STORE_PATH), false);
  assert.equal(existsSync(process.env.DOCCANVAS_BLUEPRINT_ARTIFACT_PATH), false);
});

test('UI-5 workspaces expose honest states and no execution controls', () => {
  const { storeDir, artifactDir } = compiledFixture();
  const projection = buildProductOperationsProjection({
    library: loadKnowledgeLibrary(packPath),
    blueprints: [loadBlueprintCandidate({ storeDir, blueprintId: 'blueprint.support-gpt' })],
    artifacts: listBlueprintArtifacts({ artifactDir }),
  });
  const html = [
    React.createElement(ArtifactWorkspace, { projection }),
    React.createElement(WorkflowWorkspace, { projection }),
    React.createElement(TimelineWorkspace, { projection }),
    React.createElement(EvolutionCockpit, { projection }),
  ].map(element => renderToStaticMarkup(element)).join('\n');
  assert.match(html, /Compiled Views|PRD|Architecture|Evaluation|Delivery/u);
  assert.match(html, /valid time|observed time|未知有效起点/u);
  assert.match(html, /not_measured|尚无真实指标证据/u);
  assert.match(html, /executed=false|候选行动/u);
  assert.doesNotMatch(html, /执行进化|自动批准|立即部署/u);

  const workspaceSource = readFileSync(resolve(root, 'components/workspace/KnowledgeWorkspace.tsx'), 'utf8');
  assert.match(workspaceSource, /view === 'workflow'/u);
  assert.match(workspaceSource, /view === 'timeline'/u);
  assert.match(workspaceSource, /view === 'artifacts'/u);
  assert.match(workspaceSource, /view === 'evolution'/u);
  assert.doesNotMatch(workspaceSource, /Artifacts.*规划中|Evolution.*规划中/u);
});
