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

export const metadata: Metadata = {
  title: 'Knowledge Product Workspace',
  description: '把知识对象、证据治理、产品方案与文档画布连接为可审计的 AI 产品工作台',
};

export const dynamic = 'force-dynamic';

export default function Home() {
  const captureDir = captureStorePath();
  const captures = listCaptureRecords({ storeDir: captureDir }).map(summarizeCaptureRecord);
  const library = loadKnowledgeLibrary(undefined, knowledgeReviewStorePath(), captureDir, enrichmentStorePath());
  const enrichmentRecords = listEnrichmentRecords({ storeDir: enrichmentStorePath() });
  const goldRecords = listCurrentGoldAnnotations({ storeDir: enrichmentGoldStorePath() });
  return (
    <KnowledgeWorkspace
      initialLibrary={library}
      initialOperations={loadProductOperationsProjection(library)}
      initialEntries={listDocumentEntries()}
      initialCaptures={captures}
      initialEnrichments={enrichmentRecords.map(summarizeEnrichmentRecord)}
      initialGold={goldRecords.map(summarizeGoldAnnotation)}
      initialEnrichmentEvaluation={evaluateEnrichmentResults({ enrichments: enrichmentRecords, gold: goldRecords, minimumSamples: 20 })}
      enrichmentRuntime={getEnrichmentRuntimeStatus()}
      initialPilotReadiness={getConfiguredPilotReadiness()}
      writePolicy={getWritePolicy()}
    />
  );
}
