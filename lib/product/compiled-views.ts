import type { ValidatedGenome } from '../../../scripts/validate-genome';
import type { BlueprintArtifactManifest } from '../server/blueprint-artifact-store';

export interface CompiledProductViews {
  schemaVersion: 'doccanvas-compiled-product-views-v1';
  source: {
    blueprintId: string;
    blueprintRevision: number;
    blueprintDocumentHash: string;
    genomeHash: string;
    compiledAt: string;
    productionStatus: 'unchanged';
  };
  prd: {
    productName: string;
    valueProposition: string;
    targetUsers: string;
    problem: string;
    notSolving: string;
    businessModel: string;
    keyMetrics: string[];
  };
  architecture: {
    frontend: ValidatedGenome['skeleton']['frontend'];
    backend: ValidatedGenome['skeleton']['backend'];
    agentRuntime: ValidatedGenome['skeleton']['agent_runtime'];
    deployment: ValidatedGenome['skeleton']['deployment'];
    knowledgeDomains: ValidatedGenome['knowledge']['domains'];
    tools: ValidatedGenome['agent']['tools'];
    guardrails: ValidatedGenome['agent']['guardrails'];
  };
  evaluation: {
    goldenSetPath: string;
    incrementalPath: string;
    weeklyIncrementSize: number;
    judge: ValidatedGenome['evaluation']['judge'];
    gates: Array<{
      id: 'floor_gate' | 'safety_gate' | 'comparison_gate';
      enabled: boolean;
      metric: string;
      threshold: string;
      actionOnFail: string;
    }>;
    protectedMetrics: ValidatedGenome['constitution']['protected_metrics'];
  };
  delivery: {
    releaseState: 'candidate_only';
    productionStatus: 'unchanged';
    frontendTarget: string;
    backendTarget: string;
    ciCd: string;
    requiresIndependentAuthorization: true;
    immutablePrinciples: string[];
  };
}

export function compileProductViews(
  genome: ValidatedGenome,
  manifest: BlueprintArtifactManifest,
): CompiledProductViews {
  const comparison = genome.evaluation.gates.comparison_gate;
  return {
    schemaVersion: 'doccanvas-compiled-product-views-v1',
    source: {
      blueprintId: manifest.blueprintId,
      blueprintRevision: manifest.blueprintRevision,
      blueprintDocumentHash: manifest.blueprintDocumentHash,
      genomeHash: manifest.genomeHash,
      compiledAt: manifest.compiledAt,
      productionStatus: manifest.productionStatus,
    },
    prd: {
      productName: genome.identity.name,
      valueProposition: genome.identity.value_proposition,
      targetUsers: genome.identity.target_users,
      problem: genome.identity.problem_solved,
      notSolving: genome.identity.NOT_solving,
      businessModel: genome.business.model,
      keyMetrics: [...genome.business.key_metrics],
    },
    architecture: {
      frontend: structuredClone(genome.skeleton.frontend),
      backend: structuredClone(genome.skeleton.backend),
      agentRuntime: structuredClone(genome.skeleton.agent_runtime),
      deployment: structuredClone(genome.skeleton.deployment),
      knowledgeDomains: structuredClone(genome.knowledge.domains),
      tools: structuredClone(genome.agent.tools),
      guardrails: structuredClone(genome.agent.guardrails),
    },
    evaluation: {
      goldenSetPath: genome.evaluation.golden_set_path,
      incrementalPath: genome.evaluation.incremental_path,
      weeklyIncrementSize: genome.evaluation.weekly_increment_size,
      judge: structuredClone(genome.evaluation.judge),
      gates: [
        {
          id: 'floor_gate',
          enabled: genome.evaluation.gates.floor_gate.enabled,
          metric: genome.evaluation.gates.floor_gate.metric,
          threshold: String(genome.evaluation.gates.floor_gate.threshold),
          actionOnFail: genome.evaluation.gates.floor_gate.action_on_fail,
        },
        {
          id: 'safety_gate',
          enabled: genome.evaluation.gates.safety_gate.enabled,
          metric: genome.evaluation.gates.safety_gate.metric,
          threshold: String(genome.evaluation.gates.safety_gate.threshold),
          actionOnFail: genome.evaluation.gates.safety_gate.action_on_fail,
        },
        {
          id: 'comparison_gate',
          enabled: comparison.enabled,
          metric: 'statistical_comparison',
          threshold: comparison.p_threshold === undefined ? 'not_configured' : `p<${comparison.p_threshold}`,
          actionOnFail: 'manual_review',
        },
      ],
      protectedMetrics: structuredClone(genome.constitution.protected_metrics),
    },
    delivery: {
      releaseState: 'candidate_only',
      productionStatus: 'unchanged',
      frontendTarget: genome.skeleton.deployment.frontend,
      backendTarget: genome.skeleton.deployment.backend,
      ciCd: genome.skeleton.deployment.ci_cd,
      requiresIndependentAuthorization: true,
      immutablePrinciples: [...genome.constitution.immutable_principles],
    },
  };
}
