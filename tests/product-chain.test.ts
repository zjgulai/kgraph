import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';
import type { ProductBlueprint } from '../../scripts/lib/blueprint-contract';
import { buildBlueprintRevisionComparison } from '../lib/product/blueprint-diff';
import { buildProductChains } from '../lib/product/product-chain';
import { loadKnowledgeLibrary } from '../lib/server/knowledge-library';
import { buildSolutionScaffold } from '../lib/solutions/blueprint-scaffold';
import {
  approveBlueprintCandidate,
  createBlueprintCandidate,
  loadBlueprintCandidate,
  updateBlueprintCandidate,
} from '../lib/server/blueprint-workspace-store';
import {
  compileBlueprintArtifact,
  previewBlueprintArtifact,
} from '../lib/server/blueprint-artifact-store';
import { listBlueprintArtifacts } from '../lib/server/artifact-catalog';

const root = resolve(import.meta.dirname, '..');
const packPath = resolve(root, '../product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json');
const approvedFixturePath = resolve(root, '../product/blueprint-fixtures/valid-approved-blueprint.yaml');

test('Solution scaffold preserves a first-class Product Task and field-level provenance', () => {
  const library = loadKnowledgeLibrary(packPath);
  const evidenceIds = library.items.slice(0, 2).map(item => item.objectId);
  const result = buildSolutionScaffold({
    blueprintId: 'blueprint.audit-copilot',
    taskId: 'task.audit-copilot',
    productName: 'Audit Copilot',
    goal: '把审计证据转成可执行产品规格',
    problem: '产品决策缺少可追溯证据',
    targetUsers: ['AI 产品负责人'],
    notSolving: ['自动批准生产发布'],
    successMetrics: ['Artifact 可回溯到任务与证据'],
    capabilityGene: { dimension: 'knowledge_memory', value: 'governed_trace', riskLevel: 'high' },
    primaryOption: {
      title: '证据编译工作流', description: '用受控证据构建规格',
      assumptions: ['Owner 会复核关键主张'], risks: ['证据可能过期'], tradeoffs: ['速度换可审计性'],
    },
    alternativeOption: {
      title: '人工模板工作流', description: '用模板手工组织规格',
      assumptions: ['团队维护模板'], risks: ['一致性较弱'], tradeoffs: ['低自动化换低门槛'],
    },
    hardGateCriterion: '关键主张有当前 revision',
    commercialHypothesis: {
      customerJob: '减少产品返工', valueProposition: '证据约束的规格编译',
      valueUnit: '每个获批 Blueprint', experiment: '比较三个任务的返工次数',
    },
    evidenceIds,
  }, library, '2026-07-22T06:00:00Z');

  assert.equal(result.blueprint.product_task.task_id, 'task.audit-copilot');
  assert.deepEqual(result.blueprint.options[0]?.assumptions, ['Owner 会复核关键主张']);
  assert.equal(result.lineage.some(item => item.origin === 'knowledge_evidence'), true);
  assert.equal(result.lineage.some(item => item.origin === 'deterministic_rule'), true);
  assert.equal(result.lineage.some(item => item.origin === 'provider_candidate'), false);
});

test('Blueprint diff reports knowledge drift, field impact and deterministic recompile scope', () => {
  const before = parseYaml(readFileSync(approvedFixturePath, 'utf8')) as ProductBlueprint;
  const after = structuredClone(before);
  after.version = before.version + 1;
  after.base_knowledge_revision = 'knowledge-set:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  after.product_task.problem = '新的问题边界';
  after.evaluation.golden_set = 'eval/golden-v2.jsonl';

  const comparison = buildBlueprintRevisionComparison({
    from: { revision: 1, documentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', blueprint: before },
    to: { revision: 2, documentHash: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', blueprint: after },
    affectedArtifactKeys: ['r000001-20260718T150600Z'],
  });

  assert.equal(comparison.knowledgeBaselineDrift, true);
  assert.deepEqual(comparison.recompileScope, ['architecture', 'delivery', 'evaluation', 'prd']);
  assert.equal(comparison.changes.some(change => change.path === 'product_task.problem'), true);
  assert.deepEqual(comparison.affectedArtifactKeys, ['r000001-20260718T150600Z']);
});

test('compile preview is side-effect free and exact inputs bind the created Artifact lineage', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'doccanvas-product-chain-'));
  const storeDir = join(workspace, 'blueprints');
  const artifactDir = join(workspace, 'artifacts');
  const approved = parseYaml(readFileSync(approvedFixturePath, 'utf8')) as ProductBlueprint;
  const created = createBlueprintCandidate({
    storeDir, blueprint: approved, actor: 'owner.test', mutationId: 'product-chain.create', mutatedAt: '2026-07-22T06:00:00Z',
  });
  const compiledAt = '2026-07-22T06:10:00Z';
  const preview = previewBlueprintArtifact({
    storeDir, artifactDir, blueprintId: created.blueprintId, compiledAt,
    baseRevision: created.revision, baseDocumentHash: created.documentHash,
  });

  assert.equal(listBlueprintArtifacts({ artifactDir }).length, 0);
  assert.equal(preview.inputHash, created.documentHash);
  assert.equal(preview.productTaskId, approved.product_task.task_id);
  assert.deepEqual(preview.outputs, ['manifest.json', 'product-genome.yaml']);

  compileBlueprintArtifact({
    storeDir, artifactDir, blueprintId: created.blueprintId, compiledAt,
    baseRevision: created.revision, baseDocumentHash: created.documentHash,
  });
  const artifact = listBlueprintArtifacts({ artifactDir })[0]!;
  assert.equal(artifact.manifest.input?.productTaskId, approved.product_task.task_id);
  assert.equal(artifact.manifest.input?.inputHash, created.documentHash);
  assert.equal(artifact.manifest.input?.compilerVersion, 'blueprint-compiler-v1.1');
  assert.equal(artifact.manifest.replay?.status, 'replayable');

  const chains = buildProductChains({ blueprints: [loadBlueprintCandidate({ storeDir, blueprintId: created.blueprintId })], artifacts: [artifact] });
  assert.equal(chains[0]?.taskId, approved.product_task.task_id);
  assert.deepEqual(chains[0]?.evidenceIds, [...new Set(approved.evidence_matrix.flatMap(item => item.evidence_ids))].sort());
  assert.equal(chains[0]?.artifacts[0]?.inputHash, created.documentHash);
});

test('compile rejects a preview whose Blueprint revision has drifted', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'doccanvas-preview-cas-'));
  const storeDir = join(workspace, 'blueprints');
  const artifactDir = join(workspace, 'artifacts');
  const approved = parseYaml(readFileSync(approvedFixturePath, 'utf8')) as ProductBlueprint;
  const created = createBlueprintCandidate({
    storeDir, blueprint: approved, actor: 'owner.test', mutationId: 'preview-cas.create', mutatedAt: '2026-07-22T06:00:00Z',
  });
  updateBlueprintCandidate({
    storeDir,
    blueprint: { ...approved, version: 2, product_task: { ...approved.product_task, goal: `${approved.product_task.goal} v2` } },
    baseRevision: created.revision,
    baseDocumentHash: created.documentHash,
    actor: 'owner.test', mutationId: 'preview-cas.update', mutatedAt: '2026-07-22T06:05:00Z',
  });

  assert.throws(() => compileBlueprintArtifact({
    storeDir, artifactDir, blueprintId: created.blueprintId, compiledAt: '2026-07-22T06:10:00Z',
    baseRevision: created.revision, baseDocumentHash: created.documentHash,
  }), /BLUEPRINT_COMPILE_INPUT_DRIFT/u);
});

test('Blueprint approval is a distinct CAS mutation and refuses missing execution', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'doccanvas-approval-'));
  const storeDir = join(workspace, 'blueprints');
  const approved = parseYaml(readFileSync(approvedFixturePath, 'utf8')) as ProductBlueprint;
  const review: ProductBlueprint = {
    ...approved,
    status: 'review',
    decision: { ...approved.decision, decision_status: 'pending_human', primary_option_id: null },
  };
  const created = createBlueprintCandidate({
    storeDir, blueprint: review, actor: 'owner.test', mutationId: 'approval.create', mutatedAt: '2026-07-22T06:00:00Z',
  });
  const result = approveBlueprintCandidate({
    storeDir,
    blueprintId: created.blueprintId,
    baseRevision: created.revision,
    baseDocumentHash: created.documentHash,
    primaryOptionId: review.options[0]!.option_id,
    rationale: '人工复核证据、硬门与执行规格后批准。',
    actor: 'owner.test', mutationId: 'approval.approve', mutatedAt: '2026-07-22T06:10:00Z',
  });
  assert.equal(result.revision, 2);
  assert.equal(result.blueprint.status, 'approved');
  assert.equal(result.blueprint.decision.decided_by, 'owner.test');

  const withoutExecution = { ...review };
  delete withoutExecution.execution;
  const second = createBlueprintCandidate({
    storeDir: join(workspace, 'second'), blueprint: withoutExecution,
    actor: 'owner.test', mutationId: 'approval.no-execution.create', mutatedAt: '2026-07-22T06:00:00Z',
  });
  assert.throws(() => approveBlueprintCandidate({
    storeDir: join(workspace, 'second'), blueprintId: second.blueprintId,
    baseRevision: second.revision, baseDocumentHash: second.documentHash,
    primaryOptionId: review.options[0]!.option_id, rationale: '批准',
    actor: 'owner.test', mutationId: 'approval.no-execution', mutatedAt: '2026-07-22T06:10:00Z',
  }), /BLUEPRINT_EXECUTION_REQUIRED/u);
});
