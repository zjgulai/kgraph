import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/server/parse-json-body';
import {
  BlueprintWorkspaceError,
  createBlueprintCandidate,
  listBlueprintCandidates,
} from '@/lib/server/blueprint-workspace-store';
import { checkWriteAccess, getWritePolicy } from '@/lib/server/write-guard';

const CreateSchema = z.object({ blueprint: z.unknown() }).strict();

function errorResponse(error: unknown) {
  if (error instanceof BlueprintWorkspaceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Blueprint operation failed.' }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json({ blueprints: listBlueprintCandidates() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid Blueprint create payload.' }, { status: 400 });
  const parsed = CreateSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Blueprint create payload.', issues: parsed.error.issues }, { status: 400 });
  try {
    const policy = getWritePolicy();
    return NextResponse.json(createBlueprintCandidate({
      blueprint: parsed.data.blueprint,
      actor: policy.mode === 'dev' ? 'developer.local' : 'owner.session',
      mutationId: `blueprint.create.${randomUUID()}`,
      mutatedAt: new Date().toISOString(),
    }), { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
