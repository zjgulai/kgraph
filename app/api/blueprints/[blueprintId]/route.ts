import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/server/parse-json-body';
import {
  BlueprintWorkspaceError,
  loadBlueprintCandidate,
  updateBlueprintCandidate,
} from '@/lib/server/blueprint-workspace-store';
import { checkWriteAccess, getWritePolicy } from '@/lib/server/write-guard';

const BlueprintIdSchema = z.string().regex(/^blueprint\.[a-zA-Z0-9._-]+$/u);
const UpdateSchema = z.object({
  baseRevision: z.number().int().min(1),
  baseDocumentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  blueprint: z.unknown(),
}).strict();

function errorResponse(error: unknown) {
  if (error instanceof BlueprintWorkspaceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Blueprint operation failed.' }, { status: 500 });
}

async function blueprintId(context: { params: Promise<{ blueprintId: string }> }) {
  const value = (await context.params).blueprintId;
  return BlueprintIdSchema.safeParse(value).success ? value : null;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ blueprintId: string }> }) {
  const id = await blueprintId(context);
  if (!id) return NextResponse.json({ error: 'Invalid blueprintId.' }, { status: 400 });
  try {
    return NextResponse.json(loadBlueprintCandidate({ blueprintId: id }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ blueprintId: string }> }) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const id = await blueprintId(context);
  if (!id) return NextResponse.json({ error: 'Invalid blueprintId.' }, { status: 400 });
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid Blueprint update payload.' }, { status: 400 });
  const parsed = UpdateSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Blueprint update payload.', issues: parsed.error.issues }, { status: 400 });
  const candidate = parsed.data.blueprint as { blueprint_id?: unknown };
  if (candidate?.blueprint_id !== id) return NextResponse.json({ error: 'Route Blueprint ID does not match payload.' }, { status: 400 });
  try {
    const policy = getWritePolicy();
    return NextResponse.json(updateBlueprintCandidate({
      blueprint: parsed.data.blueprint,
      baseRevision: parsed.data.baseRevision,
      baseDocumentHash: parsed.data.baseDocumentHash,
      actor: policy.mode === 'dev' ? 'developer.local' : 'owner.session',
      mutationId: `blueprint.update.${randomUUID()}`,
      mutatedAt: new Date().toISOString(),
    }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
