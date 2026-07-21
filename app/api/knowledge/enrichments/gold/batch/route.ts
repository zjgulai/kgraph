import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/server/parse-json-body';
import { checkWriteAccess, getWritePolicy } from '@/lib/server/write-guard';
import { captureStorePath, listCaptureRecords } from '@/lib/server/knowledge-capture-store';
import {
  enrichmentStorePath,
  listEnrichmentRecords,
} from '@/lib/server/knowledge-enrichment-store';
import {
  GoldStoreError,
  enrichmentGoldStorePath,
  listCurrentGoldAnnotations,
  summarizeGoldAnnotation,
  upsertGoldAnnotation,
} from '@/lib/server/knowledge-enrichment-eval';
import {
  GoldBatchError,
  buildHumanGoldTaskPack,
  prepareHumanGoldBatchImport,
} from '@/lib/server/knowledge-enrichment-gold-batch';

const RequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('export'),
    captureIds: z.array(z.string().regex(/^capture-[a-f0-9]{24}$/u)).min(1).max(20).optional(),
  }).strict(),
  z.object({
    action: z.literal('import'),
    pack: z.unknown(),
  }).strict(),
]);

function errorResponse(error: unknown) {
  if (error instanceof GoldBatchError || error instanceof GoldStoreError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Gold batch operation failed.' }, { status: 500 });
}

export async function POST(req: NextRequest) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 3 * 1024 * 1024) {
    return NextResponse.json({ error: 'Gold batch payload exceeds 3 MiB.', code: 'ENRICHMENT_GOLD_PACK_TOO_LARGE' }, { status: 413 });
  }
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid gold batch payload.' }, { status: 400 });
  const parsed = RequestSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid gold batch payload.', issues: parsed.error.issues }, { status: 400 });
  try {
    const captures = listCaptureRecords({ storeDir: captureStorePath() });
    const enrichments = listEnrichmentRecords({ storeDir: enrichmentStorePath() });
    const gold = listCurrentGoldAnnotations({ storeDir: enrichmentGoldStorePath() });
    if (parsed.data.action === 'export') {
      const pack = buildHumanGoldTaskPack({ captures, enrichments, gold, captureIds: parsed.data.captureIds });
      return NextResponse.json({ pack }, {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="${pack.packId}.json"`,
        },
      });
    }
    const prepared = prepareHumanGoldBatchImport({ value: parsed.data.pack, captures, gold });
    const policy = getWritePolicy();
    const imported = [];
    for (const item of prepared.items) {
      try {
        const record = upsertGoldAnnotation({
          storeDir: enrichmentGoldStorePath(),
          annotation: item.annotation,
          actor: policy.mode === 'dev' ? 'developer.local' : 'owner.session',
          mutationId: item.mutationId,
          annotatedAt: prepared.pack.completion.completedAt,
          baseRevision: item.baseRevision,
          baseAnnotationHash: item.baseAnnotationHash,
        });
        imported.push(summarizeGoldAnnotation(record));
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : 'Gold batch import failed.',
          code: error instanceof GoldStoreError ? error.code : 'ENRICHMENT_GOLD_BATCH_IMPORT_FAILED',
          imported,
          resumable: true,
          packId: prepared.pack.packId,
        }, { status: error instanceof GoldStoreError ? error.status : 500 });
      }
    }
    return NextResponse.json({
      packId: prepared.pack.packId,
      imported,
      importedCount: imported.length,
      replaySafe: true,
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
