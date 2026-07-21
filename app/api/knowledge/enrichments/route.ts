import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/server/parse-json-body';
import { checkWriteAccess, getWritePolicy } from '@/lib/server/write-guard';
import { captureStorePath } from '@/lib/server/knowledge-capture-store';
import {
  EnrichmentStoreError,
  enrichmentStorePath,
  getEnrichmentRuntimeStatus,
  listEnrichmentRecords,
  runEnrichment,
  summarizeEnrichmentRecord,
  type EnrichmentExecutor,
  type EnrichmentPolicy,
} from '@/lib/server/knowledge-enrichment-store';
import {
  enrichmentGoldStorePath,
  evaluateEnrichmentResults,
  listCurrentGoldAnnotations,
  summarizeGoldAnnotation,
} from '@/lib/server/knowledge-enrichment-eval';
import {
  ProviderRuntimeError,
  createConfiguredProviderRuntime,
} from '@/lib/server/knowledge-enrichment-provider';
import { createConfiguredPilotReservationGate, getConfiguredPilotReadiness } from '@/lib/server/knowledge-enrichment-pilot';

const RequestSchema = z.object({
  captureId: z.string().regex(/^capture-[a-f0-9]{24}$/u),
  mutationId: z.string().regex(/^[a-zA-Z0-9._:-]+$/u).optional(),
}).strict();

function errorResponse(error: unknown) {
  if (error instanceof EnrichmentStoreError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof ProviderRuntimeError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Enrichment operation failed.' }, { status: 500 });
}

export async function GET() {
  try {
    const records = listEnrichmentRecords({ storeDir: enrichmentStorePath() });
    const gold = listCurrentGoldAnnotations({ storeDir: enrichmentGoldStorePath() });
    return NextResponse.json({
      runtime: getEnrichmentRuntimeStatus(),
      enrichments: records.map(summarizeEnrichmentRecord),
      evaluation: evaluateEnrichmentResults({ enrichments: records, gold, minimumSamples: 20 }),
      pilot: getConfiguredPilotReadiness(),
      gold: gold.map(summarizeGoldAnnotation),
      goldCount: gold.length,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

interface PostDependencies {
  executor: EnrichmentExecutor;
  policy: EnrichmentPolicy;
  storeDir: string;
  captureStoreDir: string;
  promptVersion: string;
  enrichedAt?: string;
}

export async function handleEnrichmentPost(req: NextRequest, dependencies?: PostDependencies) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid enrichment payload.' }, { status: 400 });
  const parsed = RequestSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid enrichment payload.', issues: parsed.error.issues }, { status: 400 });
  try {
    const effective = dependencies ?? (() => {
      const runtime = createConfiguredProviderRuntime({
        reservationGateFactory: createConfiguredPilotReservationGate,
      });
      return {
        executor: runtime.executor,
        policy: runtime.policy,
        storeDir: enrichmentStorePath(),
        captureStoreDir: captureStorePath(),
        promptVersion: runtime.promptVersion,
        enrichedAt: undefined,
      };
    })();
    const policy = getWritePolicy();
    const record = await runEnrichment({
      storeDir: effective.storeDir,
      captureStoreDir: effective.captureStoreDir,
      captureId: parsed.data.captureId,
      actor: policy.mode === 'dev' ? 'developer.local' : 'owner.session',
      mutationId: parsed.data.mutationId ?? `enrichment.${randomUUID()}`,
      enrichedAt: effective.enrichedAt,
      promptVersion: effective.promptVersion,
      executor: effective.executor,
      policy: effective.policy,
    });
    return NextResponse.json({ enrichment: summarizeEnrichmentRecord(record), replayed: record.replayed }, {
      status: record.replayed ? 200 : 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  return handleEnrichmentPost(req);
}
