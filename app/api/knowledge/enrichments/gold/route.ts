import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/server/parse-json-body';
import { checkWriteAccess, getWritePolicy } from '@/lib/server/write-guard';
import { captureStorePath, readCaptureRecord } from '@/lib/server/knowledge-capture-store';
import {
  GoldStoreError,
  HumanGoldAnnotationSchema,
  enrichmentGoldStorePath,
  listCurrentGoldAnnotations,
  summarizeGoldAnnotation,
  upsertGoldAnnotation,
} from '@/lib/server/knowledge-enrichment-eval';

const RequestSchema = z.object({
  annotation: HumanGoldAnnotationSchema,
  mutationId: z.string().regex(/^[a-zA-Z0-9._:-]+$/u).optional(),
  baseRevision: z.number().int().min(1).optional(),
  baseAnnotationHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u).optional(),
}).strict().superRefine((value, context) => {
  if ((value.baseRevision === undefined) !== (value.baseAnnotationHash === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['baseRevision'], message: 'baseRevision and baseAnnotationHash must be provided together' });
  }
});

function errorResponse(error: unknown) {
  if (error instanceof GoldStoreError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Gold annotation operation failed.' }, { status: 500 });
}
export async function GET() {
  try {
    return NextResponse.json({
      gold: listCurrentGoldAnnotations({ storeDir: enrichmentGoldStorePath() }).map(summarizeGoldAnnotation),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid gold annotation payload.' }, { status: 400 });
  const parsed = RequestSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid gold annotation payload.', issues: parsed.error.issues }, { status: 400 });
  try {
    const capture = readCaptureRecord({ storeDir: captureStorePath(), captureId: parsed.data.annotation.captureId });
    if (capture.manifest.sourceHash !== parsed.data.annotation.sourceHash) {
      return NextResponse.json({ error: 'Gold annotation source hash does not match the immutable Capture snapshot.', code: 'ENRICHMENT_GOLD_SOURCE_MISMATCH' }, { status: 409 });
    }
    const policy = getWritePolicy();
    const record = upsertGoldAnnotation({
      storeDir: enrichmentGoldStorePath(),
      annotation: parsed.data.annotation,
      actor: policy.mode === 'dev' ? 'developer.local' : 'owner.session',
      mutationId: parsed.data.mutationId ?? `gold.${randomUUID()}`,
      baseRevision: parsed.data.baseRevision,
      baseAnnotationHash: parsed.data.baseAnnotationHash,
    });
    return NextResponse.json({ gold: summarizeGoldAnnotation(record), replayed: record.replayed }, {
      status: record.replayed ? 200 : record.revision === 1 ? 201 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
