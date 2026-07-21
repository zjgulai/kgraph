import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/server/parse-json-body';
import {
  KnowledgeReviewError,
  KnowledgeReviewPatchSchema,
  listKnowledgeReviewRevisions,
  loadKnowledgeReviewObject,
  updateKnowledgeReviewObject,
} from '@/lib/server/knowledge-review-store';
import { checkWriteAccess, getWritePolicy } from '@/lib/server/write-guard';

const ObjectIdSchema = z.string().regex(/^[a-z][a-z0-9_-]*\.[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const MutationSchema = z.object({
  baseRevision: z.number().int().min(1),
  baseObjectHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  patch: KnowledgeReviewPatchSchema,
}).strict();

function errorResponse(error: unknown) {
  if (error instanceof KnowledgeReviewError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Knowledge review operation failed.';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ objectId: string }> },
) {
  const { objectId } = await context.params;
  if (!ObjectIdSchema.safeParse(objectId).success) return NextResponse.json({ error: 'Invalid objectId.' }, { status: 400 });
  try {
    return NextResponse.json({
      ...loadKnowledgeReviewObject({ objectId }),
      revisions: listKnowledgeReviewRevisions({ objectId }),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ objectId: string }> },
) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const { objectId } = await context.params;
  if (!ObjectIdSchema.safeParse(objectId).success) return NextResponse.json({ error: 'Invalid objectId.' }, { status: 400 });
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid review mutation payload.' }, { status: 400 });
  const parsed = MutationSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid review mutation payload.', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const policy = getWritePolicy();
    const updated = updateKnowledgeReviewObject({
      objectId,
      baseRevision: parsed.data.baseRevision,
      baseObjectHash: parsed.data.baseObjectHash,
      patch: parsed.data.patch,
      actor: policy.mode === 'dev' ? 'developer.local' : 'owner.session',
      mutationId: `review.${randomUUID()}`,
    });
    return NextResponse.json({
      ...updated,
      revisions: listKnowledgeReviewRevisions({ objectId }),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
