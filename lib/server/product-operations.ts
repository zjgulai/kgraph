import type { KnowledgeLibraryProjection } from '../knowledge/library-types';
import { buildProductOperationsProjection, type ProductOperationsProjection } from '../product/operations-projection';
import { listBlueprintArtifacts } from './artifact-catalog';
import { listBlueprintCandidates, loadBlueprintCandidate } from './blueprint-workspace-store';
import { loadKnowledgeLibrary } from './knowledge-library';
import { knowledgeReviewStorePath } from './knowledge-review-store';
import { captureStorePath } from './knowledge-capture-store';
import { enrichmentStorePath } from './knowledge-enrichment-store';

export function loadProductOperationsProjection(
  library: KnowledgeLibraryProjection = loadKnowledgeLibrary(undefined, knowledgeReviewStorePath(), captureStorePath(), enrichmentStorePath()),
): ProductOperationsProjection {
  const blueprints = listBlueprintCandidates().map(summary => loadBlueprintCandidate({ blueprintId: summary.blueprintId }));
  return buildProductOperationsProjection({
    library,
    blueprints,
    artifacts: listBlueprintArtifacts(),
  });
}
