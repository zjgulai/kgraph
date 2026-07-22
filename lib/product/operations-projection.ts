import type { BlueprintCandidateRecord } from '../server/blueprint-workspace-store';
import type { BlueprintArtifactRecord } from '../server/artifact-catalog';
import type { KnowledgeLibraryProjection } from '../knowledge/library-types';
import type { BlueprintArtifactManifest } from '../server/blueprint-artifact-store';
import type { CompiledProductViews } from './compiled-views';
import { buildProductChains, type ProductChainProjection } from './product-chain';
import {
  buildEvidenceRegistry,
  type EvidenceKind,
  type EvidenceRegistryProjection,
  type ProviderOperationsProjection,
  type ProviderProjectionInput,
  type RegistryReadinessClaim,
} from './evidence-registry';

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
  productChains: ProductChainProjection[];
  evidenceRegistry: EvidenceRegistryProjection;
  providerOps: ProviderOperationsProjection;
  workflow: Array<{
    id: 'capture' | 'review' | 'blueprint' | 'artifact' | 'evaluation' | 'evolution' | 'production';
    label: string;
    state: WorkflowState;
    evidenceCount: number;
    evidence: string;
    evidenceIds: string[];
    freshness: RegistryReadinessClaim['freshness'];
    humanGate: string | null;
  }>;
  timeline: {
    events: TimelineEvent[];
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
      evidenceIds: string[];
      freshness: RegistryReadinessClaim['freshness'];
      requiredEvidence: string;
    }>;
    employees: DigitalEmployeeProjection[];
    actions: CandidateEvolutionAction[];
  };
}

export interface TimelineEvent {
  id: string;
  axis: 'valid' | 'observed' | 'governance';
  at: string;
  title: string;
  detail: string;
  sourceRef: string;
  evidenceId: string;
  kind: EvidenceKind;
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

function workflow(registry: EvidenceRegistryProjection): ProductOperationsProjection['workflow'] {
  const workflowIds = ['capture', 'review', 'blueprint', 'artifact', 'evaluation', 'evolution', 'production'] as const;
  return workflowIds.map(id => {
    const claim = registry.readiness.find(candidate => candidate.id === id);
    if (!claim) throw new Error(`EVIDENCE_READINESS_MISSING: ${id}`);
    const state: WorkflowState = claim.status === 'ready' ? 'complete'
      : claim.status === 'active' ? 'active'
        : claim.status === 'empty' ? 'empty'
          : 'blocked';
    return {
      id,
      label: claim.label,
      state,
      evidenceCount: claim.evidenceIds.length,
      evidence: claim.summary,
      evidenceIds: [...claim.evidenceIds],
      freshness: claim.freshness,
      humanGate: claim.humanGate,
    };
  });
}

function timeline(registry: EvidenceRegistryProjection): ProductOperationsProjection['timeline'] & { events: TimelineEvent[] } {
  const validEvents: TimelineEvent[] = [];
  const observedEvents: TimelineEvent[] = [];
  const governanceEvents: TimelineEvent[] = [];
  let unknownCount = 0;
  for (const item of registry.items) {
    if (item.validTime.from) {
      validEvents.push({
        id: `valid:${item.evidenceId}`,
        axis: 'valid',
        at: item.validTime.from,
        title: item.title,
        detail: item.validTime.until ? `valid until ${item.validTime.until}` : 'open-ended validity',
        sourceRef: item.source.ref,
        evidenceId: item.evidenceId,
        kind: item.kind,
      });
    } else if (item.kind === 'knowledge_source' && item.subject.type === 'knowledge_object') {
      unknownCount += 1;
    }
    if (item.observedAt) {
      observedEvents.push({
        id: `observed:${item.evidenceId}`,
        axis: 'observed',
        at: item.observedAt,
        title: item.title,
        detail: `${item.evidenceLevel} · ${item.freshness.status}`,
        sourceRef: item.source.ref,
        evidenceId: item.evidenceId,
        kind: item.kind,
      });
    }
    if (item.governanceAt) {
      governanceEvents.push({
        id: `governance:${item.evidenceId}`,
        axis: 'governance',
        at: item.governanceAt,
        title: item.title,
        detail: item.summary,
        sourceRef: item.source.ref,
        evidenceId: item.evidenceId,
        kind: item.kind,
      });
    }
  }
  const sortedValid = sortedEvents(validEvents);
  const sortedObserved = sortedEvents(observedEvents);
  const sortedGovernance = sortedEvents(governanceEvents);
  return {
    valid: { label: 'valid time', unknownCount, events: sortedValid },
    observed: { label: 'observed time', events: sortedObserved },
    governance: { label: 'governance time', events: sortedGovernance },
    events: sortedEvents([...sortedValid, ...sortedObserved, ...sortedGovernance]),
  };
}

function evolution(
  registry: EvidenceRegistryProjection,
  library: KnowledgeLibraryProjection,
  blueprints: BlueprintCandidateRecord[],
  artifacts: BlueprintArtifactRecord[],
): ProductOperationsProjection['evolution'] {
  const currentArtifact = artifacts[0];
  const draftBlueprints = blueprints.filter(record => record.blueprint.status !== 'approved').length;
  const approvedWithoutArtifact = blueprints.filter(record => record.blueprint.status === 'approved'
    && !artifacts.some(artifact => artifact.manifest.blueprintId === record.blueprintId && artifact.manifest.blueprintRevision === record.revision)).length;
  const checkIds = ['genome_contract', 'safety_eval', 'product_metrics', 'review_backlog', 'canonical_lineage', 'provider_authorization', 'production_release'];
  const checks: ProductOperationsProjection['evolution']['checks'] = checkIds.map(id => {
    const claim = registry.readiness.find(candidate => candidate.id === id);
    if (!claim) throw new Error(`EVIDENCE_READINESS_MISSING: ${id}`);
    return {
      id,
      label: claim.label,
      status: claim.status === 'ready' ? 'ready' : claim.status === 'not_measured' ? 'not_measured' : 'blocked',
      evidence: claim.summary,
      evidenceIds: [...claim.evidenceIds],
      freshness: claim.freshness,
      requiredEvidence: claim.requiredEvidence,
    };
  });
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
  provider?: ProviderProjectionInput;
  now?: string;
}): ProductOperationsProjection {
  const blueprints = [...input.blueprints].sort((left, right) => left.blueprintId.localeCompare(right.blueprintId));
  const artifacts = [...input.artifacts].sort((left, right) => right.manifest.compiledAt.localeCompare(left.manifest.compiledAt));
  const evidence = buildEvidenceRegistry({
    library: input.library,
    blueprints,
    artifacts,
    provider: input.provider,
    now: input.now ?? input.library.source.generatedAt,
  });
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
    productChains: buildProductChains({ blueprints, artifacts }),
    evidenceRegistry: evidence.registry,
    providerOps: evidence.providerOps,
    workflow: workflow(evidence.registry),
    timeline: timeline(evidence.registry),
    evolution: evolution(evidence.registry, input.library, blueprints, artifacts),
  };
}
