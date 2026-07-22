import type { KnowledgeLibraryProjection } from '../knowledge/library-types';
import { buildProductOperationsProjection, type ProductOperationsProjection } from '../product/operations-projection';
import { listBlueprintArtifacts } from './artifact-catalog';
import { listBlueprintCandidates, loadBlueprintCandidate } from './blueprint-workspace-store';
import { loadKnowledgeLibrary } from './knowledge-library';
import { knowledgeReviewStorePath } from './knowledge-review-store';
import { captureStorePath } from './knowledge-capture-store';
import {
  enrichmentStorePath,
  getEnrichmentRuntimeStatus,
  listEnrichmentRecords,
} from './knowledge-enrichment-store';
import {
  enrichmentGoldStorePath,
  evaluateEnrichmentResults,
  listCurrentGoldAnnotations,
} from './knowledge-enrichment-eval';
import { getConfiguredPilotReadiness } from './knowledge-enrichment-pilot';
import type { ProviderProjectionInput } from '../product/evidence-registry';

export function loadProductOperationsProjection(
  library: KnowledgeLibraryProjection = loadKnowledgeLibrary(undefined, knowledgeReviewStorePath(), captureStorePath(), enrichmentStorePath()),
  provider?: ProviderProjectionInput,
): ProductOperationsProjection {
  const blueprints = listBlueprintCandidates().map(summary => loadBlueprintCandidate({ blueprintId: summary.blueprintId }));
  const providerProjection = provider ?? (() => {
    const enrichments = listEnrichmentRecords({ storeDir: enrichmentStorePath() });
    const gold = listCurrentGoldAnnotations({ storeDir: enrichmentGoldStorePath() });
    return {
      runtime: getEnrichmentRuntimeStatus(),
      pilot: getConfiguredPilotReadiness(),
      evaluation: evaluateEnrichmentResults({ enrichments, gold, minimumSamples: 20 }),
    };
  })();
  return buildProductOperationsProjection({
    library,
    blueprints,
    artifacts: listBlueprintArtifacts(),
    provider: providerProjection,
    now: new Date().toISOString(),
  });
}
