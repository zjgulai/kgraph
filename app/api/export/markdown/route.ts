import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { z } from 'zod';
import { getDocumentEntry } from '@/lib/shared/document-registry';
import { projectPath } from '@/lib/server/project-root';

const DocumentIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/);

function filenameFor(title: string) {
  return `${title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'doccanvas'}.md`;
}

export async function GET(req: NextRequest) {
  const rawId = req.nextUrl.searchParams.get('documentId') || '';
  const parsed = DocumentIdSchema.safeParse(rawId);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid documentId' }, { status: 400 });

  const entry = getDocumentEntry(parsed.data);
  if (!entry) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const filePath = projectPath(entry.path);
  if (!existsSync(filePath)) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  const markdown = readFileSync(filePath, 'utf-8');
  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filenameFor(entry.title))}`,
      'Cache-Control': 'no-store',
    },
  });
}
