import type { BlueprintCandidateRecord } from '../server/blueprint-workspace-store';
import type { BlueprintArtifactRecord } from '../server/artifact-catalog';
import type { KnowledgeLibraryProjection } from '../knowledge/library-types';
import type { BlueprintArtifactManifest } from '../server/blueprint-artifact-store';
import type { CompiledProductViews } from './compiled-views';

export type WorkflowState = 'complete' | 'active' | 'blocked' | 'empty';
export type EvolutionReadiness = 'ready' | 'blocked' | 'not_measured';

export interface ProductOperationsArtifact {
  artifactKey: string;
  manifest: BlueprintArtifactManifest;
  views: CompiledProductViews;
}

export interface ProductOperationsProjection {
  schemaVersion: 'doccanvas-product-operations-v1';
  generatedFrom: {
    knowledgePackHash: string;
    knowledgeSourceHash: string;
    knowledgeObjectCount: number;
    blueprintCount: number;
    artifactCount: number;
  };
  artifacts: ProductOperationsArtifact[];
  workflow: Array<{
    id: 'capture' | 'review' | 'blueprint' | 'artifact' | 'evaluation' | 'evolution' | 'production';
    label: string;
    state: WorkflowState;
    evidenceCount: number;
    evidence: string;
    humanGate: string | null;
  }>;
  timeline: {
    valid: { label: 'valid time'; unknownCount: number; events: TimelineEvent[] };
    observed: { label: 'observed time'; events: TimelineEvent[] };
    governance: { label: 'governance time'; events: TimelineEvent[] };
  };
  evolution: {
    overall: 'blocked';
    checks: Array<{
      id: string;
      label: string;
      status: EvolutionReadiness;
      evidence: string;
      requiredEvidence: string;
    }>;
    employees: DigitalEmployeeProjection[];
    actions: CandidateEvolutionAction[];
  };
}

export interface TimelineEvent {
  id: string;
  at: string;
  title: string;
  detail: string;
  sourceRef: string;
}

export interface DigitalEmployeeProjection {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'waiting_human' | 'ready_for_review' | 'blocked';
  queueCount: number;
  capabilities: string[];
  permissions: string[];
  lastOutput: string;
  blockedBy: string;
  humanGate: string;
  canExecute: false;
}

export interface CandidateEvolutionAction {
  id: string;
  title: string;
  reason: string;
  requiredEvidence: string[];
  humanGate: string;
  executed: false;
}

function sortedEvents(events: TimelineEvent[]): TimelineEvent[] {
  return events.sort((left, right) => right.at.localeCompare(left.at) || left.id.localeCompare(right.id));
}

function workflow(
  library: KnowledgeLibraryProjection,
  blueprints: BlueprintCandidateRecord[],
  artifacts: BlueprintArtifactRecord[],
): ProductOperationsProjection['workflow'] {
  const approved = blueprints.filter(record => record.blueprint.status === 'approved').length;
  return [
    {
      id: 'capture', label: 'Knowledge capture', state: library.stats.total > 0 ? 'complete' : 'empty',
      evidenceCount: library.stats.total, evidence: `${library.stats.total} current candidate objects`, humanGate: null,
    },
    {
      id: 'review', label: 'Evidence review', state: library.stats.reviewRequired > 0 ? 'active' : 'complete',
      evidenceCount: library.stats.reviewRequired, evidence: `${library.stats.reviewRequired} objects require human review`, humanGate: 'knowledge_review',
    },
    {
      id: 'blueprint', label: 'Product Blueprint', state: approved > 0 ? 'complete' : blueprints.length > 0 ? 'active' : 'empty',
      evidenceCount: blueprints.length, evidence: `${approved} approved / ${blueprints.length} current Blueprints`, humanGate: 'blueprint_approval',
    },
    {
      id: 'artifact', label: 'Genome artifact', state: artifacts.length > 0 ? 'complete' : blueprints.length > 0 ? 'blocked' : 'empty',
      evidenceCount: artifacts.length, evidence: `${artifacts.length} checksum-verified artifacts`, humanGate: 'genome_compile',
    },
    {
      id: 'evaluation', label: 'Evaluation evidence', state: artifacts.length > 0 ? 'blocked' : 'empty',
      evidenceCount: 0, evidence: '0 runtime evaluation result sets connected', humanGate: 'evaluation_review',
    },
    {
      id: 'evolution', label: 'Evolution candidate', state: 'blocked',
      evidenceCount: 0, evidence: 'runtime metrics and audit evidence are not connected', humanGate: 'evolution_review',
    },
    {
      id: 'production', label: 'Production release', state: 'blocked',
      evidenceCount: 0, evidence: 'productionStatus=unchanged', humanGate: 'exact_release_authorization',
    },
  ];
}

function timeline(
  library: KnowledgeLibraryProjection,
  blueprints: BlueprintCandidateRecord[],
  artifacts: BlueprintArtifactRecord[],
): ProductOperationsProjection['timeline'] {
  const validEvents: TimelineEvent[] = [];
  const observedEvents: TimelineEvent[] = [];
  let unknownCount = 0;
  for (const item of library.items) {
    if (item.validTime.from) {
      validEvents.push({
        id: `valid:${item.objectId}:r${item.revision}`,
        at: item.validTime.from,
        title: item.title,
        detail: item.validTime.until ? `valid until ${item.validTime.until}` : 'open-ended validity',
        sourceRef: item.objectId,
      });
    } else {
      unknownCount += 1;
    }
    observedEvents.push({
      id: `observed:${item.objectId}:r${item.revision}`,
      at: item.observedAt,
      title: item.title,
      detail: `system observed revision ${item.revision}`,
      sourceRef: item.objectId,
    });
  }
  const governanceEvents: TimelineEvent[] = [];
  for (const record of blueprints) {
    governanceEvents.push({
      id: `blueprint:${record.blueprintId}:created`,
      at: record.blueprint.created_at,
      title: record.blueprint.product_task.product_name,
      detail: `${record.blueprint.status} Blueprint · current R${record.revision}`,
      sourceRef: record.blueprintId,
    });
    if (record.blueprint.decision.decided_at) {
      governanceEvents.push({
        id: `blueprint:${record.blueprintId}:decision`,
        at: record.blueprint.decision.decided_at,
        title: `${record.blueprint.product_task.product_name} decision`,
        detail: record.blueprint.decision.decision_status,
        sourceRef: record.blueprintId,
      });
    }
  }
  for (const artifact of artifacts) {
    governanceEvents.push({
      id: `artifact:${artifact.manifest.blueprintId}:${artifact.artifactKey}`,
      at: artifact.manifest.compiledAt,
      title: `${artifact.views.prd.productName} Genome`,
      detail: `verified artifact · R${artifact.manifest.blueprintRevision}`,
      sourceRef: artifact.manifest.genomeHash,
    });
  }
  return {
    valid: { label: 'valid time', unknownCount, events: sortedEvents(validEvents) },
    observed: { label: 'observed time', events: sortedEvents(observedEvents) },
    governance: { label: 'governance time', events: sortedEvents(governanceEvents) },
  };
}

function evolution(
  library: KnowledgeLibraryProjection,
  blueprints: BlueprintCandidateRecord[],
  artifacts: BlueprintArtifactRecord[],
): ProductOperationsProjection['evolution'] {
  const currentArtifact = artifacts[0];
  const draftBlueprints = blueprints.filter(record => record.blueprint.status !== 'approved').length;
  const approvedWithoutArtifact = blueprints.filter(record => record.blueprint.status === 'approved'
    && !artifacts.some(artifact => artifact.manifest.blueprintId === record.blueprintId && artifact.manifest.blueprintRevision === record.revision)).length;
  const checks: ProductOperationsProjection['evolution']['checks'] = [
    {
      id: 'genome_contract', label: 'Genome contract integrity', status: artifacts.length > 0 ? 'ready' : 'blocked',
      evidence: artifacts.length > 0 ? `${artifacts.length} checksum + contract verified artifacts` : 'no verified artifact',
      requiredEvidence: 'validated current Genome artifact',
    },
    {
      id: 'safety_eval', label: 'Safety evaluation results', status: 'not_measured',
      evidence: '尚无真实指标证据 · no eval result dataset connected', requiredEvidence: 'timestamped safety rubric results',
    },
    {
      id: 'product_metrics', label: 'Product metric trend', status: 'not_measured',
      evidence: '尚无真实指标证据 · no runtime metric series connected', requiredEvidence: 'versioned metric observations',
    },
    {
      id: 'review_backlog', label: 'Human review backlog', status: library.stats.reviewRequired > 0 ? 'blocked' : 'ready',
      evidence: `${library.stats.reviewRequired} candidate objects require review`, requiredEvidence: 'review decisions and throughput window',
    },
    {
      id: 'canonical_lineage', label: 'Canonical lineage integrity', status: 'not_measured',
      evidence: 'candidate projection does not prove canonical lineage', requiredEvidence: 'verified promotion and lineage journal',
    },
    {
      id: 'provider_authorization', label: 'Provider authorization ledger', status: 'not_measured',
      evidence: 'provider_call=false in this batch; no runtime ledger connected', requiredEvidence: 'provider calls matched to explicit authorization',
    },
    {
      id: 'production_release', label: 'Production release identity', status: 'blocked',
      evidence: 'productionStatus=unchanged', requiredEvidence: 'exact commit, image, backup and window authorization',
    },
  ];
  const employees: DigitalEmployeeProjection[] = [
    {
      id: 'employee.curator', name: 'Knowledge Curator', role: '知识整理员', status: library.stats.reviewRequired > 0 ? 'waiting_human' : 'idle',
      queueCount: library.stats.reviewRequired, capabilities: ['candidate 分类', '双时态检查'], permissions: ['read candidate projection'],
      lastOutput: `${library.stats.total} current objects`, blockedBy: `${library.stats.reviewRequired} pending reviews`, humanGate: 'knowledge_review', canExecute: false,
    },
    {
      id: 'employee.reviewer', name: 'Evidence Reviewer', role: '证据审查员', status: library.stats.warningCount > 0 ? 'waiting_human' : 'idle',
      queueCount: library.stats.warningCount, capabilities: ['source 复核', 'warning triage'], permissions: ['read review queue'],
      lastOutput: `${library.stats.warningCount} unresolved warnings`, blockedBy: 'human evidence decision', humanGate: 'candidate_review', canExecute: false,
    },
    {
      id: 'employee.architect', name: 'Product Architect', role: '产品架构师', status: draftBlueprints > 0 ? 'ready_for_review' : 'idle',
      queueCount: draftBlueprints, capabilities: ['方案比较', 'Blueprint 诊断'], permissions: ['read Blueprint revisions'],
      lastOutput: blueprints[0] ? `${blueprints[0].blueprintId} R${blueprints[0].revision}` : '尚无真实输出', blockedBy: 'Blueprint approval', humanGate: 'blueprint_approval', canExecute: false,
    },
    {
      id: 'employee.compiler', name: 'Genome Compiler', role: '规格编译员', status: approvedWithoutArtifact > 0 ? 'ready_for_review' : 'idle',
      queueCount: approvedWithoutArtifact, capabilities: ['Genome contract validation', 'provenance binding'], permissions: ['read verified artifacts'],
      lastOutput: currentArtifact ? `${currentArtifact.manifest.genomeHash}` : '尚无真实输出', blockedBy: 'approved current Blueprint', humanGate: 'genome_compile', canExecute: false,
    },
    {
      id: 'employee.evaluator', name: 'Evaluation Steward', role: '评估管理员', status: artifacts.length > 0 ? 'blocked' : 'idle',
      queueCount: artifacts.length, capabilities: ['gate plan inspection', 'protected metric review'], permissions: ['read compiled evaluation view'],
      lastOutput: currentArtifact ? currentArtifact.views.evaluation.goldenSetPath : '尚无真实输出', blockedBy: 'runtime evaluation results not connected', humanGate: 'evaluation_review', canExecute: false,
    },
    {
      id: 'employee.release', name: 'Release Steward', role: '发布管理员', status: artifacts.length > 0 ? 'blocked' : 'idle',
      queueCount: artifacts.length, capabilities: ['delivery view inspection', 'release evidence checklist'], permissions: ['read candidate delivery view'],
      lastOutput: currentArtifact ? `${currentArtifact.views.delivery.frontendTarget} / ${currentArtifact.views.delivery.backendTarget}` : '尚无真实输出',
      blockedBy: 'productionStatus=unchanged', humanGate: 'exact_release_authorization', canExecute: false,
    },
  ];
  const actions: CandidateEvolutionAction[] = [];
  if (library.stats.reviewRequired > 0) actions.push({
    id: 'action.review-backlog', title: '复核候选知识对象', reason: `${library.stats.reviewRequired} objects remain human_review_required`,
    requiredEvidence: ['source verification', 'valid time decision'], humanGate: 'knowledge_review', executed: false,
  });
  if (artifacts.length > 0) actions.push({
    id: 'action.connect-evaluation', title: '接入真实评估结果', reason: 'Genome contains evaluation gates but no runtime results are connected',
    requiredEvidence: ['golden set results', 'safety rubric results', 'run timestamp'], humanGate: 'evaluation_review', executed: false,
  });
  actions.push({
    id: 'action.release-authorization', title: '准备精确发布证据包', reason: 'productionStatus=unchanged',
    requiredEvidence: ['clean commit', 'image digest', 'backup checksum', 'change window'], humanGate: 'exact_release_authorization', executed: false,
  });
  return { overall: 'blocked', checks, employees, actions };
}

export function buildProductOperationsProjection(input: {
  library: KnowledgeLibraryProjection;
  blueprints: BlueprintCandidateRecord[];
  artifacts: BlueprintArtifactRecord[];
}): ProductOperationsProjection {
  const blueprints = [...input.blueprints].sort((left, right) => left.blueprintId.localeCompare(right.blueprintId));
  const artifacts = [...input.artifacts].sort((left, right) => right.manifest.compiledAt.localeCompare(left.manifest.compiledAt));
  return {
    schemaVersion: 'doccanvas-product-operations-v1',
    generatedFrom: {
      knowledgePackHash: input.library.source.packHash,
      knowledgeSourceHash: input.library.source.sourceHash,
      knowledgeObjectCount: input.library.stats.total,
      blueprintCount: blueprints.length,
      artifactCount: artifacts.length,
    },
    artifacts: artifacts.map(artifact => ({ artifactKey: artifact.artifactKey, manifest: structuredClone(artifact.manifest), views: structuredClone(artifact.views) })),
    workflow: workflow(input.library, blueprints, artifacts),
    timeline: timeline(input.library, blueprints, artifacts),
    evolution: evolution(input.library, blueprints, artifacts),
  };
}
