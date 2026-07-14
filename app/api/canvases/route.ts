import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createUserCanvas, listDocumentEntries } from '@/lib/shared/document-registry';
import { checkWriteAccess, getWritePolicy } from '@/lib/server/write-guard';
import { parseJsonBody } from '@/lib/server/parse-json-body';
import { cleanPresentationText } from '@/lib/canvas/presentation-text';

const CreateCanvasSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/).optional(),
});

export async function GET() {
  return NextResponse.json({
    canvases: listDocumentEntries(),
    writePolicy: getWritePolicy(),
  });
}

export async function POST(req: NextRequest) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid canvas payload' }, { status: 400 });
  const parsed = CreateCanvasSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid canvas payload', issues: parsed.error.issues }, { status: 400 });

  const title = cleanPresentationText(parsed.data.title);
  if (!title) return NextResponse.json({ error: 'Canvas title must contain readable text' }, { status: 400 });
  const canvas = await createUserCanvas({
    ...parsed.data,
    title,
    description: cleanPresentationText(parsed.data.description),
  });
  return NextResponse.json({ canvas }, { status: 201 });
}
