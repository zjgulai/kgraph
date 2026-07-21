import { createHash } from 'crypto';
import { z } from 'zod';
import {
  validateBlueprint,
  type ProductBlueprint,
} from '../../../scripts/lib/blueprint-contract';
import type { KnowledgeLibraryProjection } from '../knowledge/library-types';

const DateTimeSchema = z.string().datetime({ offset: true });
const SolutionScaffoldInputSchema = z.object({
  blueprintId: z.string().regex(/^blueprint\.[a-zA-Z0-9._-]+$/),
  productName: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  problem: z.string().trim().min(1),
  targetUsers: z.array(z.string().trim().min(1)).min(1),
  notSolving: z.array(z.string().trim().min(1)),
  successMetrics: z.array(z.string().trim().min(1)).min(1),
  capabilityGene: z.object({
    dimension: z.enum([
      'interaction', 'data', 'intelligence', 'knowledge_memory', 'agent_autonomy',
      'tools_integrations', 'output', 'risk', 'deployment', 'commercial',
    ]),
    value: z.string().trim().min(1),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  }).strict(),
  primaryOption: z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
  }).strict(),
  alternativeOption: z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
  }).strict(),
  hardGateCriterion: z.string().trim().min(1),
  commercialHypothesis: z.object({
    customerJob: z.string().trim().min(1),
    valueProposition: z.string().trim().min(1),
    valueUnit: z.string().trim().min(1),
    experiment: z.string().trim().min(1),
  }).strict(),
  evidenceIds: z.array(z.string().min(1)).min(1),
}).strict();

export type SolutionScaffoldInput = z.infer<typeof SolutionScaffoldInputSchema>;

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function buildKnowledgeRevisionFingerprint(library: KnowledgeLibraryProjection): string {
  const objectRevisions = library.items
    .map(item => ({ object_id: item.objectId, revision: item.revision, object_hash: item.objectHash }))
    .sort((left, right) => left.object_id.localeCompare(right.object_id));
  const digest = createHash('sha256')
    .update(JSON.stringify(canonicalize({ pack_hash: library.source.packHash, object_revisions: objectRevisions })), 'utf8')
    .digest('hex');
  return `knowledge-set:sha256:${digest}`;
}

function taskId(blueprintId: string): string {
  return `task.${blueprintId.replace(/^blueprint\./, '')}`;
}

export function buildBlueprintScaffold(
  input: SolutionScaffoldInput,
  library: KnowledgeLibraryProjection,
  createdAt: string,
): ProductBlueprint {
  const parsed = SolutionScaffoldInputSchema.safeParse(input);
  if (!parsed.success) {
    fail('SOLUTION_INPUT_INVALID', parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  if (!DateTimeSchema.safeParse(createdAt).success) {
    fail('SOLUTION_CREATED_AT_INVALID', 'createdAt 必须是带时区的 ISO 8601 date-time');
  }
  const availableEvidence = new Set(library.items.map(item => item.objectId));
  const evidenceIds = [...new Set(parsed.data.evidenceIds)].sort();
  const missingEvidence = evidenceIds.filter(id => !availableEvidence.has(id));
  if (missingEvidence.length > 0) {
    fail('SOLUTION_EVIDENCE_NOT_FOUND', missingEvidence.join(', '));
  }

  const blueprint: ProductBlueprint = {
    blueprint_id: parsed.data.blueprintId,
    version: 1,
    status: 'draft',
    base_knowledge_revision: buildKnowledgeRevisionFingerprint(library),
    created_at: createdAt,
    product_task: {
      task_id: taskId(parsed.data.blueprintId),
      product_name: parsed.data.productName,
      goal: parsed.data.goal,
      problem: parsed.data.problem,
      target_users: parsed.data.targetUsers,
      not_solving: parsed.data.notSolving,
      success_metrics: parsed.data.successMetrics,
    },
    capability_genes: [{
      dimension: parsed.data.capabilityGene.dimension,
      value: parsed.data.capabilityGene.value,
      risk_level: parsed.data.capabilityGene.riskLevel,
      required_gates: ['gate.solution-evidence'],
    }],
    constraints: {
      hard_gates: [{
        gate_id: 'gate.solution-evidence',
        criterion: parsed.data.hardGateCriterion,
        result: 'pending',
        evidence_ids: evidenceIds,
      }],
      preferences: [],
    },
    evidence_matrix: [{
      claim_id: 'claim.solution-basis',
      evidence_ids: evidenceIds,
      status: 'insufficient',
    }],
    options: [{
      option_id: 'option.primary-candidate',
      title: parsed.data.primaryOption.title,
      description: parsed.data.primaryOption.description,
      hard_gate_result: 'pending',
      score: null,
      assumptions: ['待人工验证证据充分性与约束匹配'],
      risks: ['当前仅为确定性脚手架，未执行外部调研或技术验证'],
      tradeoffs: ['优先保持可审计性与人工治理门'],
    }, {
      option_id: 'option.conservative-alternative',
      title: parsed.data.alternativeOption.title,
      description: parsed.data.alternativeOption.description,
      hard_gate_result: 'pending',
      score: null,
      assumptions: ['待人工评估替代方案的交付成本'],
      risks: ['可能降低自动化程度或延长交付周期'],
      tradeoffs: ['用较低复杂度换取更高可控性'],
    }],
    decision: {
      primary_option_id: null,
      alternative_option_ids: [],
      decision_status: 'pending_human',
      rationale: 'Solution Studio 只生成候选结构，主方案需人工评审后选择。',
    },
    artifacts: [],
    evaluation: {
      golden_set: '',
      incremental_set: '',
      floor_gates: [],
      safety_gates: [],
    },
    operations: {
      deployment_scope: 'candidate-only',
      observability: [],
      backup_required: true,
      rollback_required: true,
    },
    evolution: {
      feedback_lanes: ['lane_a_sources', 'lane_b_feedback', 'lane_c_monitoring'],
      promotion_required: true,
      automatic_canonical_write: false,
    },
    commercial_hypotheses: [{
      hypothesis_id: 'commercial.solution-value',
      customer_job: parsed.data.commercialHypothesis.customerJob,
      value_proposition: parsed.data.commercialHypothesis.valueProposition,
      value_unit: parsed.data.commercialHypothesis.valueUnit,
      experiment: parsed.data.commercialHypothesis.experiment,
      status: 'assumption',
      evidence_ids: evidenceIds,
    }],
    human_gates: [{
      gate_id: 'owner.blueprint-approval',
      decision: '人工批准 Blueprint 后才允许编译 Genome',
      required_before: 'blueprint_approval',
      status: 'pending',
    }, {
      gate_id: 'owner.genome-compile',
      decision: '人工确认完整 execution spec 后才允许编译',
      required_before: 'genome_compile',
      status: 'pending',
    }, {
      gate_id: 'owner.production-release',
      decision: '生产发布需要独立精确授权',
      required_before: 'production',
      status: 'pending',
    }],
    schema_version: 'ai-product-factory-blueprint-v1.1',
  };

  const validation = validateBlueprint(blueprint);
  if (!validation.success || !validation.blueprint) {
    fail('SOLUTION_BLUEPRINT_INVALID', validation.errors.map(error => `${error.code} ${error.path}: ${error.message}`).join('; '));
  }
  return validation.blueprint;
}
