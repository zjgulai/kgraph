import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { restoreDocumentRevision } from '@/lib/server/document-mutations';
import { parseJsonBody } from '@/lib/server/parse-json-body';
import { checkWriteAccess } from '@/lib/server/write-guard';

const RestoreSchema = z.object({
  baseRevision: z.number().int().min(0),
  baseDocumentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ documentId: string; revisionId: string }> },
) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid restore payload.' }, { status: 400 });
  const parsed = RestoreSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid restore payload.', issues: parsed.error.issues }, { status: 400 });
  const { documentId, revisionId } = await context.params;
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(documentId) || !/^[a-zA-Z0-9-]{20,100}$/.test(revisionId)) {
    return NextResponse.json({ error: 'Invalid revision identifier.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await restoreDocumentRevision(
      documentId,
      revisionId,
      parsed.data.baseRevision,
      parsed.data.baseDocumentHash,
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Revision restore failed.';
    const status = /conflict|reload/i.test(message) ? 409 : /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
