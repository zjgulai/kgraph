import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { afterEach } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { parse as parseYaml } from 'yaml';
import { loadKnowledgeLibrary } from '../lib/server/knowledge-library';
import {
  buildBlueprintScaffold,
  buildKnowledgeRevisionFingerprint,
  type SolutionScaffoldInput,
} from '../lib/solutions/blueprint-scaffold';
import {
  BlueprintWorkspaceError,
  createBlueprintCandidate,
  listBlueprintCandidates,
  loadBlueprintCandidate,
  updateBlueprintCandidate,
} from '../lib/server/blueprint-workspace-store';
import {
  compileBlueprintArtifact,
  type BlueprintArtifactManifest,
} from '../lib/server/blueprint-artifact-store';
import { SolutionStudioWorkspace } from '../components/workspace/SolutionStudioWorkspace';
import { BlueprintWorkspace } from '../components/workspace/BlueprintWorkspace';
import { POST as SCAFFOLD } from '../app/api/solutions/scaffold/route';
import { GET as LIST_BLUEPRINTS, POST as CREATE_BLUEPRINT } from '../app/api/blueprints/route';
import { GET as GET_BLUEPRINT, PATCH as UPDATE_BLUEPRINT } from '../app/api/blueprints/[blueprintId]/route';
import { POST as COMPILE_BLUEPRINT } from '../app/api/blueprints/[blueprintId]/compile/route';
import type { ProductBlueprint } from '../../scripts/lib/blueprint-contract';
import type { BlueprintCandidateRecord } from '../lib/server/blueprint-workspace-store';

const root = resolve(import.meta.dirname, '..');
const packPath = resolve(root, '../product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json');
const approvedFixturePath = resolve(root, '../product/blueprint-fixtures/valid-approved-blueprint.yaml');
const original = {
  root: process.env.DOCCANVAS_ROOT,
  pack: process.env.DOCCANVAS_KNOWLEDGE_PACK_PATH,
  knowledgeStore: process.env.DOCCANVAS_KNOWLEDGE_STORE_PATH,
  blueprintStore: process.env.DOCCANVAS_BLUEPRINT_STORE_PATH,
  artifactPath: process.env.DOCCANVAS_BLUEPRINT_ARTIFACT_PATH,
  mode: process.env.DOCCANVAS_WRITE_MODE,
  nodeEnv: process.env.NODE_ENV,
};
const mutableEnv = process.env as Record<string, string | undefined>;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('DOCCANVAS_ROOT', original.root);
  restore('DOCCANVAS_KNOWLEDGE_PACK_PATH', original.pack);
  restore('DOCCANVAS_KNOWLEDGE_STORE_PATH', original.knowledgeStore);
  restore('DOCCANVAS_BLUEPRINT_STORE_PATH', original.blueprintStore);
  restore('DOCCANVAS_BLUEPRINT_ARTIFACT_PATH', original.artifactPath);
  restore('DOCCANVAS_WRITE_MODE', original.mode);
  if (original.nodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = original.nodeEnv;
});

function fixtureInput(evidenceIds: string[]): SolutionScaffoldInput {
  return {
    blueprintId: 'blueprint.knowledge-copilot',
    productName: 'Knowledge Copilot',
    goal: '把可审计知识转化为可复核的产品方案',
    problem: 'AI 产品方案缺少证据边界和可执行治理门',
    targetUsers: ['AI 产品负责人'],
    notSolving: ['自动生产发布', '替代人工批准'],
    successMetrics: ['方案可追溯到知识对象', '草稿通过 Blueprint v1.1 校验'],
    capabilityGene: {
      dimension: 'knowledge_memory',
      value: 'bitemporal_governed_knowledge',
      riskLevel: 'high',
    },
    primaryOption: {
      title: '受控知识编译工作流',
      description: '以显式证据、硬门和人工决策生成候选 Blueprint',
    },
    alternativeOption: {
      title: '文档模板工作流',
      description: '先以人工模板沉淀方案，再逐步接入结构化编译',
    },
    hardGateCriterion: '所有关键主张必须能定位到当前知识 revision',
    commercialHypothesis: {
      customerJob: '缩短 AI 产品方案从想法到可执行规格的时间',
      valueProposition: '用可审计证据和治理门降低返工风险',
      valueUnit: '每个通过人工复核的 Blueprint',
      experiment: '选择三个真实产品任务比较返工次数与交付周期',
    },
    evidenceIds,
  };
}

function workspaceError(code: string) {
  return (error: unknown) => error instanceof BlueprintWorkspaceError && error.code === code;
}

test('Solution scaffold is deterministic, evidence-bound and valid as a draft Blueprint', () => {
  const library = loadKnowledgeLibrary(packPath);
  const evidenceIds = library.items.slice(0, 2).map(item => item.objectId);
  const knowledgeRevision = buildKnowledgeRevisionFingerprint(library);
  const first = buildBlueprintScaffold(fixtureInput(evidenceIds), library, '2026-07-18T15:00:00Z');
  const second = buildBlueprintScaffold(fixtureInput([...evidenceIds].reverse()), library, '2026-07-18T15:00:00Z');

  assert.deepEqual(first, second);
  assert.equal(first.status, 'draft');
  assert.equal(first.version, 1);
  assert.equal(first.base_knowledge_revision, knowledgeRevision);
  assert.deepEqual(first.evidence_matrix[0]?.evidence_ids, [...evidenceIds].sort());
  assert.equal(first.decision.decision_status, 'pending_human');
  assert.equal(first.human_gates.every(gate => gate.status === 'pending'), true);
  assert.equal('execution' in first, false);

  assert.throws(
    () => buildBlueprintScaffold(fixtureInput(['knowledge.missing']), library, '2026-07-18T15:00:00Z'),
    /SOLUTION_EVIDENCE_NOT_FOUND/u,
  );
});

test('Blueprint candidate store creates immutable revisions and rejects stale CAS', () => {
  const storeDir = join(mkdtempSync(join(tmpdir(), 'doccanvas-blueprint-store-')), 'blueprints');
  const library = loadKnowledgeLibrary(packPath);
  const blueprint = buildBlueprintScaffold(
    fixtureInput([library.items[0]!.objectId]),
    library,
    '2026-07-18T15:00:00Z',
  );
  const created = createBlueprintCandidate({
    storeDir,
    blueprint,
    actor: 'owner.test',
    mutationId: 'blueprint.create.1',
    mutatedAt: '2026-07-18T15:01:00Z',
  });
  assert.equal(created.revision, 1);
  assert.equal(created.blueprint.status, 'draft');
  assert.deepEqual(listBlueprintCandidates({ storeDir }).map(item => item.blueprintId), [blueprint.blueprint_id]);

  const updated = updateBlueprintCandidate({
    storeDir,
    blueprint: { ...created.blueprint, version: 2, status: 'review' },
    baseRevision: created.revision,
    baseDocumentHash: created.documentHash,
    actor: 'owner.test',
    mutationId: 'blueprint.update.2',
    mutatedAt: '2026-07-18T15:02:00Z',
  });
  assert.equal(updated.revision, 2);
  assert.equal(updated.blueprint.status, 'review');
  assert.deepEqual(loadBlueprintCandidate({ storeDir, blueprintId: blueprint.blueprint_id }).revisions, [2, 1]);
  assert.throws(() => updateBlueprintCandidate({
    storeDir,
    blueprint: { ...created.blueprint, version: 2 },
    baseRevision: created.revision,
    baseDocumentHash: created.documentHash,
    actor: 'owner.test',
    mutationId: 'blueprint.update.stale',
    mutatedAt: '2026-07-18T15:03:00Z',
  }), workspaceError('BLUEPRINT_CAS_CONFLICT'));
});

test('Blueprint reads have no side effects and reject invalid directory names', () => {
  const parent = mkdtempSync(join(tmpdir(), 'doccanvas-blueprint-read-'));
  const storeDir = join(parent, 'missing');
  assert.deepEqual(listBlueprintCandidates({ storeDir }), []);
  assert.equal(existsSync(storeDir), false);
});

test('compiler blocks drafts and creates a validated, provenance-bound Genome artifact', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'doccanvas-blueprint-compile-'));
  const storeDir = join(workspace, 'blueprints');
  const artifactDir = join(workspace, 'artifacts');
  const library = loadKnowledgeLibrary(packPath);
  const draft = buildBlueprintScaffold(
    fixtureInput([library.items[0]!.objectId]),
    library,
    '2026-07-18T15:00:00Z',
  );
  createBlueprintCandidate({
    storeDir, blueprint: draft, actor: 'owner.test', mutationId: 'compile.draft.create', mutatedAt: '2026-07-18T15:01:00Z',
  });
  assert.throws(() => compileBlueprintArtifact({
    storeDir,
    artifactDir,
    blueprintId: draft.blueprint_id,
    compiledAt: '2026-07-18T15:04:00Z',
  }), workspaceError('BLUEPRINT_NOT_COMPILE_READY'));
  assert.equal(existsSync(artifactDir), false);

  const approved = parseYaml(readFileSync(approvedFixturePath, 'utf8'));
  const created = createBlueprintCandidate({
    storeDir, blueprint: approved, actor: 'owner.test', mutationId: 'compile.approved.create', mutatedAt: '2026-07-18T15:05:00Z',
  });
  const artifact = compileBlueprintArtifact({
    storeDir,
    artifactDir,
    blueprintId: created.blueprint.blueprint_id,
    compiledAt: '2026-07-18T15:06:00Z',
  });
  assert.equal(artifact.manifest.blueprintRevision, 1);
  assert.equal(artifact.manifest.blueprintDocumentHash, created.documentHash);
  assert.match(artifact.manifest.genomeHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(artifact.manifest.validation.errors.length, 0);
  assert.match(artifact.genomeYaml, /blueprint_ref:/u);
  assert.equal(existsSync(artifact.genomePath), true);
  assert.equal(existsSync(artifact.manifestPath), true);
  const persisted = JSON.parse(readFileSync(artifact.manifestPath, 'utf8')) as BlueprintArtifactManifest;
  assert.equal(persisted.genomeHash, artifact.manifest.genomeHash);
});

test('Genome artifacts are create-only and never overwrite an existing compile', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'doccanvas-blueprint-create-only-'));
  const storeDir = join(workspace, 'blueprints');
  const artifactDir = join(workspace, 'artifacts');
  const approved = parseYaml(readFileSync(approvedFixturePath, 'utf8'));
  createBlueprintCandidate({
    storeDir, blueprint: approved, actor: 'owner.test', mutationId: 'create-only.approved', mutatedAt: '2026-07-18T15:05:00Z',
  });
  const options = {
    storeDir,
    artifactDir,
    blueprintId: 'blueprint.support-gpt',
    compiledAt: '2026-07-18T15:06:00Z',
  };
  compileBlueprintArtifact(options);
  const before = readdirSync(artifactDir, { recursive: true }).map(String).sort();
  assert.throws(() => compileBlueprintArtifact(options), workspaceError('BLUEPRINT_ARTIFACT_EXISTS'));
  assert.deepEqual(readdirSync(artifactDir, { recursive: true }).map(String).sort(), before);
});

test('Solution and Blueprint routes preserve readonly, Owner write and CAS boundaries', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'doccanvas-blueprint-api-'));
  process.env.DOCCANVAS_ROOT = workspace;
  process.env.DOCCANVAS_KNOWLEDGE_PACK_PATH = packPath;
  process.env.DOCCANVAS_KNOWLEDGE_STORE_PATH = join(workspace, 'knowledge-candidates');
  process.env.DOCCANVAS_BLUEPRINT_STORE_PATH = join(workspace, 'blueprint-candidates');
  process.env.DOCCANVAS_BLUEPRINT_ARTIFACT_PATH = join(workspace, 'blueprint-artifacts');
  const library = loadKnowledgeLibrary(packPath);
  const input = fixtureInput([library.items[0]!.objectId]);
  const scaffoldResponse = await SCAFFOLD(new NextRequest('http://localhost/api/solutions/scaffold', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  }));
  assert.equal(scaffoldResponse.status, 200);
  const scaffold = await scaffoldResponse.json() as { blueprint: ProductBlueprint };

  process.env.DOCCANVAS_WRITE_MODE = 'readonly';
  mutableEnv.NODE_ENV = 'production';
  const readonlyCreate = await CREATE_BLUEPRINT(new NextRequest('https://example.test/api/blueprints', {
    method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' }, body: JSON.stringify({ blueprint: scaffold.blueprint }),
  }));
  assert.equal(readonlyCreate.status, 403);

  delete process.env.DOCCANVAS_WRITE_MODE;
  mutableEnv.NODE_ENV = 'development';
  const createResponse = await CREATE_BLUEPRINT(new NextRequest('http://localhost/api/blueprints', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ blueprint: scaffold.blueprint }),
  }));
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json() as BlueprintCandidateRecord;
  const context = { params: Promise.resolve({ blueprintId: created.blueprintId }) };
  const listResponse = await LIST_BLUEPRINTS();
  assert.equal(listResponse.status, 200);
  assert.equal(((await listResponse.json()) as { blueprints: unknown[] }).blueprints.length, 1);
  assert.equal((await GET_BLUEPRINT(new NextRequest(`http://localhost/api/blueprints/${created.blueprintId}`), context)).status, 200);

  const updateBody = {
    baseRevision: created.revision,
    baseDocumentHash: created.documentHash,
    blueprint: { ...created.blueprint, version: 2, status: 'review' },
  };
  const updateResponse = await UPDATE_BLUEPRINT(new NextRequest(`http://localhost/api/blueprints/${created.blueprintId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(updateBody),
  }), context);
  assert.equal(updateResponse.status, 200);
  const staleResponse = await UPDATE_BLUEPRINT(new NextRequest(`http://localhost/api/blueprints/${created.blueprintId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(updateBody),
  }), context);
  assert.equal(staleResponse.status, 409);
  const compileResponse = await COMPILE_BLUEPRINT(new NextRequest(`http://localhost/api/blueprints/${created.blueprintId}/compile`, {
    method: 'POST',
  }), context);
  assert.equal(compileResponse.status, 409);
  assert.equal((await compileResponse.json() as { code: string }).code, 'BLUEPRINT_NOT_COMPILE_READY');
});

test('Solution and Blueprint workspaces expose governance boundaries without fake AI claims', () => {
  const library = loadKnowledgeLibrary(packPath);
  const readonly = { mode: 'readonly', writable: false, tokenRequired: false } as const;
  const solutionHtml = renderToStaticMarkup(React.createElement(SolutionStudioWorkspace, {
    library, writePolicy: readonly, onBlueprintSaved: () => undefined,
  }));
  const blueprintHtml = renderToStaticMarkup(React.createElement(BlueprintWorkspace, { writePolicy: readonly }));
  assert.match(solutionHtml, /Solution Studio|从证据到候选方案/u);
  assert.match(solutionHtml, /不调用模型|provider_call=false/u);
  assert.doesNotMatch(solutionHtml, /AI 已推荐|已自动验证/u);
  assert.match(blueprintHtml, /Blueprint Compiler/u);
  assert.doesNotMatch(blueprintHtml, /保存 revision|编译 Genome|下载 Genome/u);

  const workspaceSource = readFileSync(resolve(root, 'components/workspace/KnowledgeWorkspace.tsx'), 'utf8');
  const blueprintSource = readFileSync(resolve(root, 'components/workspace/BlueprintWorkspace.tsx'), 'utf8');
  assert.match(workspaceSource, /data-active=\{view === 'solutions'\}/u);
  assert.match(workspaceSource, /data-active=\{view === 'blueprints'\}/u);
  assert.doesNotMatch(workspaceSource, /\{ label: 'Solutions'.*规划中|\{ label: 'Blueprints'.*规划中/u);
  assert.match(blueprintSource, /record\.blueprint\.status !== 'approved' \|\| !record\.blueprint\.execution/u);
  assert.match(blueprintSource, /aria-label="已治理 Blueprint 状态"/u);
});
