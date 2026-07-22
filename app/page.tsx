import type { Metadata } from 'next';
import { KnowledgeWorkspace } from '@/components/workspace/KnowledgeWorkspace';
import { listDocumentEntries } from '@/lib/shared/document-registry';
import { getWritePolicy } from '@/lib/server/write-guard';
import { loadKnowledgeLibrary } from '@/lib/server/knowledge-library';
import { knowledgeReviewStorePath } from '@/lib/server/knowledge-review-store';
import { loadProductOperationsProjection } from '@/lib/server/product-operations';
import { captureStorePath, listCaptureRecords, summarizeCaptureRecord } from '@/lib/server/knowledge-capture-store';
import {
  enrichmentStorePath,
  getEnrichmentRuntimeStatus,
  listEnrichmentRecords,
  summarizeEnrichmentRecord,
} from '@/lib/server/knowledge-enrichment-store';
import {
  enrichmentGoldStorePath,
  evaluateEnrichmentResults,
  listCurrentGoldAnnotations,
  summarizeGoldAnnotation,
} from '@/lib/server/knowledge-enrichment-eval';
import { getConfiguredPilotReadiness } from '@/lib/server/knowledge-enrichment-pilot';
import { parseWorkbenchRoute } from '@/lib/workbench/routes';

export const metadata: Metadata = {
  title: 'Knowledge Product Workspace',
  description: '把知识对象、证据治理、产品方案与文档画布连接为可审计的 AI 产品工作台',
};

export const dynamic = 'force-dynamic';

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toURLSearchParams(input: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}

export default async function Home({ searchParams }: HomeProps) {
  const route = parseWorkbenchRoute(toURLSearchParams(await searchParams));
  const captureDir = captureStorePath();
  const captures = listCaptureRecords({ storeDir: captureDir }).map(summarizeCaptureRecord);
  const library = loadKnowledgeLibrary(undefined, knowledgeReviewStorePath(), captureDir, enrichmentStorePath());
  const enrichmentRecords = listEnrichmentRecords({ storeDir: enrichmentStorePath() });
  const goldRecords = listCurrentGoldAnnotations({ storeDir: enrichmentGoldStorePath() });
  const enrichmentRuntime = getEnrichmentRuntimeStatus();
  const pilotReadiness = getConfiguredPilotReadiness();
  const enrichmentEvaluation = evaluateEnrichmentResults({ enrichments: enrichmentRecords, gold: goldRecords, minimumSamples: 20 });
  return (
    <KnowledgeWorkspace
      initialLibrary={library}
      initialOperations={loadProductOperationsProjection(library, {
        runtime: enrichmentRuntime,
        pilot: pilotReadiness,
        evaluation: enrichmentEvaluation,
      })}
      initialEntries={listDocumentEntries()}
      initialCaptures={captures}
      initialEnrichments={enrichmentRecords.map(summarizeEnrichmentRecord)}
      initialGold={goldRecords.map(summarizeGoldAnnotation)}
      initialEnrichmentEvaluation={enrichmentEvaluation}
      enrichmentRuntime={enrichmentRuntime}
      initialPilotReadiness={pilotReadiness}
      initialRoute={route}
      writePolicy={getWritePolicy()}
    />
  );
}
