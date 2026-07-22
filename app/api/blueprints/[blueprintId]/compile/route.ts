import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BlueprintWorkspaceError } from '@/lib/server/blueprint-workspace-store';
import { compileBlueprintArtifact, previewBlueprintArtifact } from '@/lib/server/blueprint-artifact-store';
import { checkWriteAccess } from '@/lib/server/write-guard';
import { parseJsonBody } from '@/lib/server/parse-json-body';

const BlueprintIdSchema = z.string().regex(/^blueprint\.[a-zA-Z0-9._-]+$/u);
const CompileInputSchema = z.object({
  baseRevision: z.number().int().min(1),
  baseDocumentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  compiledAt: z.string().datetime({ offset: true }),
}).strict();

function errorResponse(error: unknown) {
  if (error instanceof BlueprintWorkspaceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Blueprint compile failed.' }, { status: 500 });
}

export async function GET(req: NextRequest, context: { params: Promise<{ blueprintId: string }> }) {
  const id = (await context.params).blueprintId;
  if (!BlueprintIdSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid blueprintId.' }, { status: 400 });
  const parsed = CompileInputSchema.safeParse({
    baseRevision: Number(req.nextUrl.searchParams.get('baseRevision')),
    baseDocumentHash: req.nextUrl.searchParams.get('baseDocumentHash'),
    compiledAt: req.nextUrl.searchParams.get('compiledAt'),
  });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid compile preview input.', issues: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json(previewBlueprintArtifact({ blueprintId: id, ...parsed.data }), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ blueprintId: string }> }) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const id = (await context.params).blueprintId;
  if (!BlueprintIdSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid blueprintId.' }, { status: 400 });
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid compile input.' }, { status: 400 });
  const parsed = CompileInputSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid compile input.', issues: parsed.error.issues }, { status: 400 });
  try {
    const artifact = compileBlueprintArtifact({ blueprintId: id, ...parsed.data });
    return NextResponse.json({ manifest: artifact.manifest, genomeYaml: artifact.genomeYaml }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
