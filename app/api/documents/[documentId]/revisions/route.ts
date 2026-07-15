import { NextRequest, NextResponse } from 'next/server';
import { listDocumentRevisions } from '@/lib/server/document-mutations';
import { checkWriteAccess } from '@/lib/server/write-guard';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const { documentId } = await context.params;
  try {
    return NextResponse.json({ revisions: listDocumentRevisions(documentId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Revision history unavailable.';
    return NextResponse.json({ error: message }, { status: /Unknown documentId/.test(message) ? 404 : 500 });
  }
}
