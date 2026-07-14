/**
 * API Route: /api/documents
 *
 * GET  — list available documents
 * PATCH — precise bidirectional section sync using content-hash matching
 * POST — re-parse a document and return the updated graph (after .md file change)
 */
import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { getDocumentEntry, listDocumentEntries } from '@/lib/shared/document-registry';
import { syncSection } from '@/lib/sync/precise-sync';
import { parseMarkdownToGraph } from '@/lib/parser/markdown-to-graph';
import { readFileSync } from 'fs';
import { z } from 'zod';
import { checkWriteAccess } from '@/lib/server/write-guard';
import { projectPath } from '@/lib/server/project-root';
import { parseJsonBody } from '@/lib/server/parse-json-body';

const PatchSchema = z.object({
  documentId: z.string().min(1),
  nodeId: z.string().optional(),
  originalHeading: z.string().optional(),
  heading: z.string().min(1).max(300),
  content: z.string().max(2 * 1024 * 1024),
  hash: z.string().optional(),
});

const PostSchema = z.object({
  documentId: z.string().min(1),
});

export async function GET() {
  return NextResponse.json(listDocumentEntries());
}

/**
 * PATCH — Precise bidirectional sync.
 * Body: { documentId, heading, content, hash? }
 *
 * A supplied sectionHash() must identify exactly one current section. Legacy
 * requests without a hash may match one unique original heading. Any stale or
 * ambiguous identity returns a conflict; this route never appends as fallback.
 */
export async function PATCH(req: NextRequest) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const parsed = PatchSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
  const { documentId, heading, content, hash, originalHeading } = parsed.data;

  const docConfig = getDocumentEntry(documentId);
  if (!docConfig) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const filePath = projectPath(docConfig.path);
  if (!existsSync(filePath)) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  const result = await syncSection(filePath, {
    hash,
    originalHeading: originalHeading || heading,
    newHeading: heading,
    newContent: content,
  });

  if (!result.success) {
    return NextResponse.json({
      ...result,
      documentId,
      editedAt: new Date().toISOString(),
    }, { status: 409 });
  }

  const markdown = readFileSync(filePath, 'utf-8');
  const graph = parseMarkdownToGraph(markdown, documentId, filePath);

  return NextResponse.json({
    ...result,
    documentId,
    document: graph,
    editedAt: new Date().toISOString(),
  });
}

/**
 * POST — Re-parse a document after external changes.
 * Body: { documentId }
 * Returns the full DocCanvas graph for the client to re-render.
 */
export async function POST(req: NextRequest) {
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const parsed = PostSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
  const { documentId } = parsed.data;

  const docConfig = getDocumentEntry(documentId);
  if (!docConfig) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const filePath = projectPath(docConfig.path);
  if (!existsSync(filePath)) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  const markdown = readFileSync(filePath, 'utf-8');
  const graph = parseMarkdownToGraph(markdown, documentId, filePath);

  return NextResponse.json({
    reParsed: true,
    documentId,
    graph: {
      title: graph.title,
      metadata: graph.metadata,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    },
    document: graph,
    parsedAt: new Date().toISOString(),
  });
}
