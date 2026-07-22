import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/server/parse-json-body';
import { approveBlueprintCandidate, BlueprintWorkspaceError } from '@/lib/server/blueprint-workspace-store';
import { checkWriteAccess, getWritePolicy } from '@/lib/server/write-guard';

const BlueprintIdSchema = z.string().regex(/^blueprint\.[a-zA-Z0-9._-]+$/u);
const ApprovalSchema = z.object({
  baseRevision: z.number().int().min(1),
  baseDocumentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  primaryOptionId: z.string().min(1),
  rationale: z.string().trim().min(1).max(4000),
}).strict();

export async function POST(req: NextRequest, context: { params: Promise<{ blueprintId: string }> }) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const blueprintId = (await context.params).blueprintId;
  if (!BlueprintIdSchema.safeParse(blueprintId).success) return NextResponse.json({ error: 'Invalid blueprintId.' }, { status: 400 });
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid Blueprint approval payload.' }, { status: 400 });
  const parsed = ApprovalSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Blueprint approval payload.', issues: parsed.error.issues }, { status: 400 });
  try {
    const policy = getWritePolicy();
    return NextResponse.json(approveBlueprintCandidate({
      blueprintId,
      ...parsed.data,
      actor: policy.mode === 'dev' ? 'developer.local' : 'owner.session',
      mutationId: `blueprint.approve.${randomUUID()}`,
      mutatedAt: new Date().toISOString(),
    }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof BlueprintWorkspaceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Blueprint approval failed.' }, { status: 500 });
  }
}
