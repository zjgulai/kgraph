import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BlueprintWorkspaceError } from '@/lib/server/blueprint-workspace-store';
import { compileBlueprintArtifact } from '@/lib/server/blueprint-artifact-store';
import { checkWriteAccess } from '@/lib/server/write-guard';

const BlueprintIdSchema = z.string().regex(/^blueprint\.[a-zA-Z0-9._-]+$/u);

export async function POST(req: NextRequest, context: { params: Promise<{ blueprintId: string }> }) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const id = (await context.params).blueprintId;
  if (!BlueprintIdSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid blueprintId.' }, { status: 400 });
  try {
    const artifact = compileBlueprintArtifact({ blueprintId: id, compiledAt: new Date().toISOString() });
    return NextResponse.json({ manifest: artifact.manifest, genomeYaml: artifact.genomeYaml }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof BlueprintWorkspaceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Blueprint compile failed.' }, { status: 500 });
  }
}
