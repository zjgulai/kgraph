import type { BlueprintCandidateRecord } from '../server/blueprint-workspace-store';
import type { BlueprintArtifactRecord } from '../server/artifact-catalog';

export interface ProductChainProjection {
  taskId: string;
  productName: string;
  problem: string;
  goal: string;
  blueprintId: string;
  blueprintRevision: number;
  blueprintStatus: BlueprintCandidateRecord['blueprint']['status'];
  blueprintDocumentHash: string;
  baseKnowledgeRevision: string;
  evidenceIds: string[];
  artifacts: Array<{
    artifactKey: string;
    blueprintRevision: number;
    inputHash: string;
    genomeHash: string;
    compiledAt: string;
    replayStatus: 'replayable' | 'legacy_unavailable';
  }>;
  nextAction: 'review_solution' | 'approve_blueprint' | 'compile_preview' | 'inspect_artifact';
}

function nextAction(record: BlueprintCandidateRecord, artifactCount: number): ProductChainProjection['nextAction'] {
  if (artifactCount > 0) return 'inspect_artifact';
  if (record.blueprint.status === 'approved') return 'compile_preview';
  if (record.blueprint.status === 'review') return 'approve_blueprint';
  return 'review_solution';
}

export function buildProductChains(input: {
  blueprints: BlueprintCandidateRecord[];
  artifacts: BlueprintArtifactRecord[];
}): ProductChainProjection[] {
  return [...input.blueprints]
    .sort((left, right) => left.blueprintId.localeCompare(right.blueprintId))
    .map(record => {
      const artifacts = input.artifacts
        .filter(artifact => artifact.manifest.blueprintId === record.blueprintId)
        .map(artifact => ({
          artifactKey: artifact.artifactKey,
          blueprintRevision: artifact.manifest.blueprintRevision,
          inputHash: artifact.manifest.input?.inputHash ?? artifact.manifest.blueprintDocumentHash,
          genomeHash: artifact.manifest.genomeHash,
          compiledAt: artifact.manifest.compiledAt,
          replayStatus: artifact.manifest.replay?.status ?? 'legacy_unavailable' as const,
        }));
      return {
        taskId: record.blueprint.product_task.task_id,
        productName: record.blueprint.product_task.product_name,
        problem: record.blueprint.product_task.problem,
        goal: record.blueprint.product_task.goal,
        blueprintId: record.blueprintId,
        blueprintRevision: record.revision,
        blueprintStatus: record.blueprint.status,
        blueprintDocumentHash: record.documentHash,
        baseKnowledgeRevision: record.blueprint.base_knowledge_revision,
        evidenceIds: [...new Set(record.blueprint.evidence_matrix.flatMap(item => item.evidence_ids))].sort(),
        artifacts,
        nextAction: nextAction(record, artifacts.length),
      };
    });
}
