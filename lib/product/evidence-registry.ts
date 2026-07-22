import type { KnowledgeLibraryProjection } from '../knowledge/library-types';
import type { BlueprintArtifactRecord } from '../server/artifact-catalog';
import type { BlueprintCandidateRecord } from '../server/blueprint-workspace-store';

export type EvidenceKind =
  | 'knowledge_source'
  | 'review_snapshot'
  | 'blueprint_decision'
  | 'artifact_integrity'
  | 'evaluation_result'
  | 'provider_authorization'
  | 'runtime_metric'
  | 'canonical_lineage'
  | 'production_release';
export type EvidenceState = 'supports' | 'blocks' | 'not_measured';
export type EvidenceFreshnessStatus = 'fresh' | 'stale' | 'unknown' | 'not_applicable';
export type RegistryReadinessStatus = 'ready' | 'active' | 'blocked' | 'empty' | 'not_measured';

export interface EvidenceFreshness {
  status: EvidenceFreshnessStatus;
  checkedAt: string;
  maxAgeHours: number | null;
  expiresAt: string | null;
  reason: string;
}

export interface EvidenceRegistryItem {
  evidenceId: string;
  kind: EvidenceKind;
  state: EvidenceState;
  title: string;
  summary: string;
  subject: { type: string; id: string; revision: number | null };
  source: { type: string; ref: string; locator: string | null; uri: string | null };
  validTime: { from: string | null; until: string | null };
  observedAt: string | null;
  governanceAt: string | null;
  freshness: EvidenceFreshness;
  integrity: { status: 'verified' | 'declared' | 'not_verified'; hash: string | null };
  evidenceLevel: string;
  nextAction: string | null;
}

export interface RegistryReadinessClaim {
  id: string;
  label: string;
  status: RegistryReadinessStatus;
  summary: string;
  evidenceIds: string[];
  freshness: EvidenceFreshnessStatus;
  requiredEvidence: string;
  humanGate: string | null;
}

export interface EvidenceRegistryProjection {
  schemaVersion: 'doccanvas-evidence-registry-v1';
  generatedAt: string;
  sourceHash: string;
  items: EvidenceRegistryItem[];
  readiness: RegistryReadinessClaim[];
  stats: {
    total: number;
    supporting: number;
    blocking: number;
    notMeasured: number;
    stale: number;
    unknownFreshness: number;
  };
}

export interface ProviderProjectionInput {
  runtime: {
    mode: 'disabled' | 'configured';
    providerId: string | null;
    modelId: string | null;
    ready: boolean;
    reason: string;
    jobId?: string;
    policyHash?: string;
    budget?: {
      maxCalls: number;
      reservedCalls: number;
      remainingCalls: number;
      providerCompletedCalls: number;
      providerFailedCalls: number;
    };
  };
  pilot: {
    state: string;
    planHash: string | null;
    authorizedStage: 'canary' | 'batch' | null;
    stageAuthorizationId: string | null;
    stageAuthorizationHash: string | null;
    authorizedCaptureIds: string[];
    executionAllowed: boolean;
    cohortCount: number;
    resultCount: number;
    goldCount: number;
    gates: Array<{ id: string; status: string; reason: string; actual: unknown; required: unknown }>;
    nextAction: string;
  };
  evaluation: {
    status: 'insufficient_data' | 'passed' | 'failed';
    sampleCount: number;
    minimumSamples: number;
    gates: Array<{ metric?: string; passed?: boolean }>;
  };
}

export interface ProviderOperationsProjection {
  mode: 'disabled' | 'configured';
  state: string;
  providerId: string | null;
  modelId: string | null;
  jobId: string | null;
  policyHash: string | null;
  planHash: string | null;
  authorizationId: string | null;
  authorizationHash: string | null;
  authorizedStage: 'canary' | 'batch' | null;
  scopeCount: number;
  budget: ProviderProjectionInput['runtime']['budget'] | null;
  gates: ProviderProjectionInput['pilot']['gates'];
  nextAction: string;
  evidenceIds: string[];
  canExecute: false;
}

export interface EvidenceRegistryBuildResult {
  registry: EvidenceRegistryProjection;
  providerOps: ProviderOperationsProjection;
}

const KNOWLEDGE_MAX_AGE_HOURS = 24 * 180;
const GOVERNANCE_MAX_AGE_HOURS = 24 * 30;

function isDateTime(value: string | null): value is string {
  return value !== null && Number.isFinite(Date.parse(value));
}

function freshness(observedAt: string | null, checkedAt: string, maxAgeHours: number | null): EvidenceFreshness {
  if (maxAgeHours === null) {
    return { status: 'not_applicable', checkedAt, maxAgeHours, expiresAt: null, reason: '该证据按完整性验证，不设置时间失效。' };
  }
  if (!isDateTime(observedAt) || !isDateTime(checkedAt)) {
    return { status: 'unknown', checkedAt, maxAgeHours, expiresAt: null, reason: '缺少可解析的 observed time，不能声明新鲜。' };
  }
  const expiresAtMs = Date.parse(observedAt) + maxAgeHours * 60 * 60 * 1000;
  const stale = Date.parse(checkedAt) > expiresAtMs;
  return {
    status: stale ? 'stale' : 'fresh',
    checkedAt,
    maxAgeHours,
    expiresAt: new Date(expiresAtMs).toISOString(),
    reason: stale ? '证据已超过当前 freshness policy。' : '证据仍在当前 freshness policy 内。',
  };
}

function missingEvidence(input: {
  id: string;
  kind: EvidenceKind;
  title: string;
  summary: string;
  subjectId: string;
  nextAction: string;
  now: string;
  state?: EvidenceState;
}): EvidenceRegistryItem {
  return {
    evidenceId: input.id,
    kind: input.kind,
    state: input.state ?? 'not_measured',
    title: input.title,
    summary: input.summary,
    subject: { type: input.kind, id: input.subjectId, revision: null },
    source: { type: 'missing_evidence', ref: input.subjectId, locator: null, uri: null },
    validTime: { from: null, until: null },
    observedAt: null,
    governanceAt: null,
    freshness: freshness(null, input.now, null),
    integrity: { status: 'not_verified', hash: null },
    evidenceLevel: 'not_measured',
    nextAction: input.nextAction,
  };
}

function worstFreshness(items: EvidenceRegistryItem[]): EvidenceFreshnessStatus {
  if (items.some(item => item.freshness.status === 'stale')) return 'stale';
  if (items.some(item => item.freshness.status === 'unknown')) return 'unknown';
  if (items.some(item => item.freshness.status === 'fresh')) return 'fresh';
  return 'not_applicable';
}

function providerItem(provider: ProviderProjectionInput | undefined, now: string): EvidenceRegistryItem {
  if (!provider || provider.runtime.mode === 'disabled') {
    return missingEvidence({
      id: 'evidence:provider:authorization', kind: 'provider_authorization', title: 'Provider authorization',
      summary: 'Provider runtime 未配置；凭据存在也不会被推断为已授权。', subjectId: 'provider-runtime',
      nextAction: '配置 policy、plan、receipt 与 ledger 后重新生成只读投影。', now,
    });
  }
  const hasScope = provider.runtime.ready && provider.pilot.executionAllowed
    && Boolean(provider.runtime.policyHash && provider.pilot.planHash && provider.pilot.stageAuthorizationHash);
  return {
    evidenceId: 'evidence:provider:authorization',
    kind: 'provider_authorization',
    state: hasScope ? 'supports' : 'blocks',
    title: 'Provider authorization',
    summary: hasScope ? `${provider.pilot.authorizedStage} scope 已由 policy、plan 与 receipt 绑定。` : provider.pilot.nextAction,
    subject: { type: 'provider_job', id: provider.runtime.jobId ?? 'configured-provider', revision: null },
    source: { type: 'authorization_projection', ref: provider.pilot.stageAuthorizationHash ?? provider.runtime.policyHash ?? 'configured', locator: provider.pilot.authorizedStage, uri: null },
    validTime: { from: null, until: null },
    observedAt: null,
    governanceAt: null,
    freshness: freshness(null, now, GOVERNANCE_MAX_AGE_HOURS),
    integrity: { status: provider.runtime.policyHash && provider.pilot.planHash ? 'declared' : 'not_verified', hash: provider.pilot.stageAuthorizationHash },
    evidenceLevel: hasScope ? 'scope_bound_authorization' : 'authorization_incomplete',
    nextAction: hasScope ? null : provider.pilot.nextAction,
  };
}

function evaluationItem(provider: ProviderProjectionInput | undefined, now: string): EvidenceRegistryItem {
  const report = provider?.evaluation;
  if (!report || report.status === 'insufficient_data') {
    return missingEvidence({
      id: 'evidence:evaluation:current', kind: 'evaluation_result', title: 'Evaluation result set',
      summary: report ? `${report.sampleCount}/${report.minimumSamples} 个可比较样本，证据不足。` : '尚未连接真实评估结果集。',
      subjectId: 'evaluation-current', nextAction: '连接带时间戳的真实评估结果与独立 Human Gold。', now,
    });
  }
  return {
    evidenceId: 'evidence:evaluation:current', kind: 'evaluation_result', state: report.status === 'passed' ? 'supports' : 'blocks',
    title: 'Evaluation result set', summary: `${report.sampleCount} 个样本；${report.status === 'passed' ? '全部 readiness gates 通过' : '至少一个 readiness gate 未通过'}。`,
    subject: { type: 'evaluation_run', id: 'evaluation-current', revision: null },
    source: { type: 'evaluation_projection', ref: `evaluation:${report.status}:${report.sampleCount}`, locator: null, uri: null },
    validTime: { from: null, until: null }, observedAt: now, governanceAt: now,
    freshness: freshness(now, now, 24 * 7), integrity: { status: 'declared', hash: null }, evidenceLevel: 'computed_evaluation',
    nextAction: report.status === 'passed' ? null : '修复失败 gate 后生成新的评估结果。',
  };
}

function readinessClaim(input: {
  id: string;
  label: string;
  status: RegistryReadinessStatus;
  summary: string;
  items: EvidenceRegistryItem[];
  requiredEvidence: string;
  humanGate: string | null;
}): RegistryReadinessClaim {
  return {
    id: input.id,
    label: input.label,
    status: input.status,
    summary: input.summary,
    evidenceIds: input.items.map(item => item.evidenceId).sort(),
    freshness: worstFreshness(input.items),
    requiredEvidence: input.requiredEvidence,
    humanGate: input.humanGate,
  };
}

export function buildEvidenceRegistry(input: {
  library: KnowledgeLibraryProjection;
  blueprints: BlueprintCandidateRecord[];
  artifacts: BlueprintArtifactRecord[];
  provider?: ProviderProjectionInput;
  now: string;
}): EvidenceRegistryBuildResult {
  const items: EvidenceRegistryItem[] = input.library.items.map(item => ({
    evidenceId: `evidence:knowledge:${item.objectId}:r${item.revision}`,
    kind: 'knowledge_source' as const,
    state: 'supports' as const,
    title: item.title,
    summary: item.summary,
    subject: { type: 'knowledge_object', id: item.objectId, revision: item.revision },
    source: { type: item.source.authorityOrigin, ref: item.objectHash, locator: item.source.locator, uri: item.source.uri },
    validTime: { ...item.validTime },
    observedAt: item.observedAt,
    governanceAt: null,
    freshness: freshness(item.observedAt, input.now, KNOWLEDGE_MAX_AGE_HOURS),
    integrity: { status: 'verified' as const, hash: item.objectHash },
    evidenceLevel: item.evidenceGrade,
    nextAction: item.promotionState === 'human_review_required' ? '完成人工证据复核。' : null,
  }));
  const knowledgeMissing = missingEvidence({
    id: 'evidence:knowledge:missing', kind: 'knowledge_source', title: 'Knowledge evidence',
    summary: '尚无注册 Knowledge evidence。', subjectId: 'knowledge-current', nextAction: '采集并复核至少一条来源证据。', now: input.now,
  });
  if (input.library.items.length === 0) items.push(knowledgeMissing);

  const reviewSnapshot: EvidenceRegistryItem = {
    evidenceId: `evidence:review:backlog:${input.library.source.sourceHash}`,
    kind: 'review_snapshot',
    state: input.library.stats.reviewRequired === 0 ? 'supports' : 'blocks',
    title: 'Human review backlog',
    summary: `${input.library.stats.reviewRequired} 个候选仍需人工复核。`,
    subject: { type: 'review_queue', id: 'knowledge-review', revision: null },
    source: { type: 'knowledge_projection', ref: input.library.source.sourceHash, locator: null, uri: null },
    validTime: { from: null, until: null }, observedAt: input.now, governanceAt: input.now,
    freshness: freshness(input.now, input.now, 1), integrity: { status: 'verified', hash: input.library.source.sourceHash },
    evidenceLevel: 'current_projection', nextAction: input.library.stats.reviewRequired === 0 ? null : '处理候选复核队列。',
  };
  items.push(reviewSnapshot);

  const blueprintItems = input.blueprints.map(record => {
    const observedAt = record.blueprint.decision.decided_at ?? record.blueprint.created_at;
    return {
      evidenceId: `evidence:blueprint:${record.blueprintId}:r${record.revision}`,
      kind: 'blueprint_decision' as const,
      state: record.blueprint.status === 'approved' ? 'supports' as const : 'blocks' as const,
      title: record.blueprint.product_task.product_name,
      summary: `${record.blueprint.status} Blueprint R${record.revision}。`,
      subject: { type: 'blueprint', id: record.blueprintId, revision: record.revision },
      source: { type: 'blueprint_revision', ref: record.documentHash, locator: `revision:${record.revision}`, uri: null },
      validTime: { from: null, until: null }, observedAt, governanceAt: record.blueprint.decision.decided_at ?? null,
      freshness: freshness(observedAt, input.now, GOVERNANCE_MAX_AGE_HOURS),
      integrity: { status: 'verified' as const, hash: record.documentHash }, evidenceLevel: record.blueprint.status,
      nextAction: record.blueprint.status === 'approved' ? null : '完成 Blueprint review 与人工批准。',
    };
  });
  items.push(...blueprintItems);
  const blueprintMissing = missingEvidence({
    id: 'evidence:blueprint:missing', kind: 'blueprint_decision', title: 'Product Blueprint',
    summary: '尚无 Blueprint revision。', subjectId: 'blueprint-current', nextAction: '从 Product Task 建立候选方案与 Blueprint。', now: input.now,
  });
  if (blueprintItems.length === 0) items.push(blueprintMissing);

  const artifactItems = input.artifacts.map(record => ({
    evidenceId: `evidence:artifact:${record.artifactKey}`,
    kind: 'artifact_integrity' as const,
    state: 'supports' as const,
    title: `${record.views.prd.productName} Genome`,
    summary: `Blueprint R${record.manifest.blueprintRevision} 的 checksum-verified create-only Artifact。`,
    subject: { type: 'artifact', id: record.artifactKey, revision: record.manifest.blueprintRevision },
    source: { type: 'artifact_manifest', ref: record.manifest.genomeHash, locator: record.artifactKey, uri: null },
    validTime: { from: null, until: null }, observedAt: record.manifest.compiledAt, governanceAt: record.manifest.compiledAt,
    freshness: freshness(record.manifest.compiledAt, input.now, GOVERNANCE_MAX_AGE_HOURS),
    integrity: { status: 'verified' as const, hash: record.manifest.genomeHash }, evidenceLevel: 'checksum_verified', nextAction: null,
  }));
  items.push(...artifactItems);

  const evaluation = evaluationItem(input.provider, input.now);
  const provider = providerItem(input.provider, input.now);
  const artifactMissing = missingEvidence({ id: 'evidence:artifact:missing', kind: 'artifact_integrity', title: 'Genome artifact', summary: '尚无可验证 Artifact。', subjectId: 'artifact-current', nextAction: '批准 Blueprint 后执行 exact preview 与 create-only compile。', now: input.now });
  const metrics = missingEvidence({ id: 'evidence:metrics:runtime', kind: 'runtime_metric', title: 'Runtime product metrics', summary: '尚未连接版本化运行指标序列。', subjectId: 'runtime-metrics', nextAction: '连接版本、窗口和采样口径明确的指标序列。', now: input.now });
  const lineage = missingEvidence({ id: 'evidence:canonical:lineage', kind: 'canonical_lineage', title: 'Canonical lineage', summary: 'Candidate projection 不能证明 canonical promotion lineage。', subjectId: 'canonical-lineage', nextAction: '接入经人工批准的 promotion journal。', now: input.now });
  const release = missingEvidence({ id: 'evidence:production:release', kind: 'production_release', title: 'Production release identity', summary: '本批次 productionStatus=unchanged。', subjectId: 'production-release', nextAction: '另行绑定精确 commit、image、backup 与变更窗口授权。', now: input.now, state: 'blocks' });
  items.push(evaluation, provider, metrics, lineage, release);
  if (artifactItems.length === 0) items.push(artifactMissing);

  const currentKnowledge = items.filter(item => item.kind === 'knowledge_source' && item.state === 'supports' && item.freshness.status !== 'stale');
  const approvedBlueprints = blueprintItems.filter(item => item.state === 'supports' && item.freshness.status !== 'stale');
  const currentArtifacts = artifactItems.filter(item => item.freshness.status !== 'stale');
  const readiness: RegistryReadinessClaim[] = [
    readinessClaim({ id: 'capture', label: 'Knowledge capture', status: input.library.items.length === 0 ? 'empty' : currentKnowledge.length > 0 ? 'ready' : 'blocked', summary: currentKnowledge.length > 0 ? `${currentKnowledge.length} 个当前 Knowledge evidence。` : 'Knowledge evidence 缺失或已过期。', items: currentKnowledge.length > 0 ? currentKnowledge : input.library.items.length > 0 ? items.filter(item => item.kind === 'knowledge_source') : [knowledgeMissing], requiredEvidence: 'source-registered Knowledge evidence within freshness policy', humanGate: null }),
    readinessClaim({ id: 'review', label: 'Evidence review', status: reviewSnapshot.state === 'supports' ? 'ready' : 'active', summary: reviewSnapshot.summary, items: [reviewSnapshot], requiredEvidence: 'current review queue snapshot', humanGate: 'knowledge_review' }),
    readinessClaim({ id: 'blueprint', label: 'Product Blueprint', status: blueprintItems.length === 0 ? 'empty' : approvedBlueprints.length > 0 ? 'ready' : 'active', summary: `${approvedBlueprints.length} approved current / ${blueprintItems.length} Blueprints。`, items: approvedBlueprints.length > 0 ? approvedBlueprints : blueprintItems.length > 0 ? blueprintItems : [blueprintMissing], requiredEvidence: 'approved current Blueprint revision', humanGate: 'blueprint_approval' }),
    readinessClaim({ id: 'artifact', label: 'Genome artifact', status: currentArtifacts.length > 0 ? 'ready' : blueprintItems.length > 0 ? 'blocked' : 'empty', summary: `${currentArtifacts.length} 个当前 checksum-verified Artifact。`, items: currentArtifacts.length > 0 ? currentArtifacts : artifactItems.length > 0 ? artifactItems : [artifactMissing], requiredEvidence: 'validated current Genome artifact', humanGate: 'genome_compile' }),
    readinessClaim({ id: 'evaluation', label: 'Evaluation evidence', status: evaluation.state === 'supports' && evaluation.freshness.status === 'fresh' ? 'ready' : evaluation.state === 'blocks' ? 'blocked' : 'not_measured', summary: evaluation.summary, items: [evaluation], requiredEvidence: 'timestamped evaluation results with independent Human Gold', humanGate: 'evaluation_review' }),
    readinessClaim({ id: 'evolution', label: 'Evolution candidate', status: 'not_measured', summary: metrics.summary, items: [metrics], requiredEvidence: 'versioned runtime metrics and audit evidence', humanGate: 'evolution_review' }),
    readinessClaim({ id: 'production', label: 'Production release', status: 'blocked', summary: release.summary, items: [release], requiredEvidence: 'exact commit, image, backup and change-window authorization', humanGate: 'exact_release_authorization' }),
    readinessClaim({ id: 'genome_contract', label: 'Genome contract integrity', status: currentArtifacts.length > 0 ? 'ready' : 'blocked', summary: currentArtifacts.length > 0 ? `${currentArtifacts.length} 个 Artifact 完整性验证通过。` : '尚无通过完整性验证的当前 Artifact。', items: currentArtifacts.length > 0 ? currentArtifacts : artifactItems.length > 0 ? artifactItems : [artifactMissing], requiredEvidence: 'validated current Genome artifact', humanGate: 'genome_compile' }),
    readinessClaim({ id: 'safety_eval', label: 'Safety evaluation results', status: evaluation.state === 'supports' && evaluation.freshness.status === 'fresh' ? 'ready' : evaluation.state === 'blocks' ? 'blocked' : 'not_measured', summary: evaluation.summary, items: [evaluation], requiredEvidence: 'timestamped safety rubric results', humanGate: 'evaluation_review' }),
    readinessClaim({ id: 'product_metrics', label: 'Product metric trend', status: 'not_measured', summary: metrics.summary, items: [metrics], requiredEvidence: 'versioned metric observations', humanGate: 'evolution_review' }),
    readinessClaim({ id: 'review_backlog', label: 'Human review backlog', status: reviewSnapshot.state === 'supports' ? 'ready' : 'blocked', summary: reviewSnapshot.summary, items: [reviewSnapshot], requiredEvidence: 'review decisions and throughput window', humanGate: 'knowledge_review' }),
    readinessClaim({ id: 'canonical_lineage', label: 'Canonical lineage integrity', status: 'not_measured', summary: lineage.summary, items: [lineage], requiredEvidence: 'verified promotion and lineage journal', humanGate: 'canonical_promotion_review' }),
    readinessClaim({ id: 'provider_authorization', label: 'Provider authorization ledger', status: provider.state === 'supports' && provider.freshness.status === 'fresh' ? 'ready' : provider.state === 'not_measured' ? 'not_measured' : 'blocked', summary: provider.summary, items: [provider], requiredEvidence: 'fresh policy, plan, receipt, scope, budget and ledger projection', humanGate: 'provider_authorization' }),
    readinessClaim({ id: 'production_release', label: 'Production release identity', status: 'blocked', summary: release.summary, items: [release], requiredEvidence: 'exact commit, image, backup and change-window authorization', humanGate: 'exact_release_authorization' }),
  ];

  const registeredIds = new Set(items.map(item => item.evidenceId));
  for (const claim of readiness) {
    if (claim.evidenceIds.length === 0 || claim.evidenceIds.some(id => !registeredIds.has(id))) {
      throw new Error(`EVIDENCE_READINESS_REFERENCE_INVALID: ${claim.id}`);
    }
    if (claim.status === 'ready' && (claim.freshness === 'stale' || claim.freshness === 'unknown')) {
      throw new Error(`EVIDENCE_READINESS_FRESHNESS_INVALID: ${claim.id}`);
    }
  }

  const priority = (item: EvidenceRegistryItem): number => item.freshness.status === 'stale' ? 0
    : item.state === 'blocks' ? 1
      : item.state === 'not_measured' ? 2
        : 3;
  const sortedItems = [...items].sort((left, right) => priority(left) - priority(right)
    || left.kind.localeCompare(right.kind)
    || left.evidenceId.localeCompare(right.evidenceId));
  const registry: EvidenceRegistryProjection = {
    schemaVersion: 'doccanvas-evidence-registry-v1', generatedAt: input.now, sourceHash: input.library.source.sourceHash,
    items: sortedItems, readiness,
    stats: {
      total: sortedItems.length,
      supporting: sortedItems.filter(item => item.state === 'supports').length,
      blocking: sortedItems.filter(item => item.state === 'blocks').length,
      notMeasured: sortedItems.filter(item => item.state === 'not_measured').length,
      stale: sortedItems.filter(item => item.freshness.status === 'stale').length,
      unknownFreshness: sortedItems.filter(item => item.freshness.status === 'unknown').length,
    },
  };
  const providerOps: ProviderOperationsProjection = {
    mode: input.provider?.runtime.mode ?? 'disabled',
    state: input.provider?.pilot.state ?? 'not_configured',
    providerId: input.provider?.runtime.providerId ?? null,
    modelId: input.provider?.runtime.modelId ?? null,
    jobId: input.provider?.runtime.jobId ?? null,
    policyHash: input.provider?.runtime.policyHash ?? null,
    planHash: input.provider?.pilot.planHash ?? null,
    authorizationId: input.provider?.pilot.stageAuthorizationId ?? null,
    authorizationHash: input.provider?.pilot.stageAuthorizationHash ?? null,
    authorizedStage: input.provider?.pilot.authorizedStage ?? null,
    scopeCount: input.provider?.pilot.authorizedCaptureIds.length ?? 0,
    budget: input.provider?.runtime.budget ?? null,
    gates: input.provider?.pilot.gates ?? [],
    nextAction: input.provider?.pilot.nextAction ?? 'Provider runtime 未配置；不允许执行。',
    evidenceIds: [provider.evidenceId],
    canExecute: false,
  };
  return { registry, providerOps };
}
