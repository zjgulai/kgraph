/**
 * API Route: /api/canvas-state
 *
 * POST — save canvas state (viewport, node positions, expanded nodes)
 * GET  — load canvas state for a document
 *
 * Persists to data/canvas-states/{documentId}.json
 */
import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { assertKnownDocument } from '@/lib/shared/document-registry';
import { atomicWriteJson, withFileLock } from '@/lib/server/file-ops';
import { checkWriteAccess } from '@/lib/server/write-guard';
import { projectPath } from '@/lib/server/project-root';
import { parseJsonBody } from '@/lib/server/parse-json-body';
import { isCanvasStateV2, isLegacyCanvasState } from '@/lib/canvas/canvas-state';

const STATE_DIR = 'data/canvas-states';
const DocumentIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/);
const CoordinateSchema = z.number().finite();
const CanvasViewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('overview') }).strict(),
  z.object({
    kind: z.literal('focused-region'),
    regionId: z.string().min(1).max(256),
  }).strict(),
]);
const CanvasStateSchema = z.object({
  documentId: DocumentIdSchema,
  layoutVersion: z.literal(2),
  layoutMode: z.literal('architecture-house'),
  graphFingerprint: z.string().min(1).max(256),
  view: CanvasViewSchema,
  viewport: z.object({
    x: CoordinateSchema,
    y: CoordinateSchema,
    zoom: z.number().finite().min(0.05).max(4),
  }),
  expandedNodes: z.array(z.string()),
  nodePositions: z.record(z.object({ x: CoordinateSchema, y: CoordinateSchema }))
    .refine(positions => Object.keys(positions).length <= 5_000, {
      message: 'At most 5,000 node positions are allowed',
    }),
  lastSaved: z.string().optional(),
}).strict();

function ensureDir() {
  mkdirSync(projectPath(STATE_DIR), { recursive: true });
}

export async function GET(req: NextRequest) {
  const docId = req.nextUrl.searchParams.get('documentId');
  if (!docId) return NextResponse.json({ error: 'documentId required' }, { status: 400 });
  const parsed = DocumentIdSchema.safeParse(docId);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid documentId' }, { status: 400 });
  try { assertKnownDocument(docId); } catch { return NextResponse.json({ error: 'Document not found' }, { status: 404 }); }

  const filePath = projectPath(join(STATE_DIR, `${docId}.json`));
  if (!existsSync(filePath)) return NextResponse.json({ viewport: { x: 0, y: 0, zoom: 1 }, expandedNodes: [], nodePositions: {}, documentId: docId });

  const raw = readFileSync(filePath, 'utf-8');
  const stored: unknown = JSON.parse(raw);
  if (!isCanvasStateV2(stored) && !isLegacyCanvasState(stored)) {
    return NextResponse.json({ error: 'Invalid stored canvas state' }, { status: 500 });
  }
  return NextResponse.json(stored);
}

export async function POST(req: NextRequest) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

  const jsonBody = await parseJsonBody(req);
  if (!jsonBody.ok) return NextResponse.json({ error: 'Invalid canvas state' }, { status: 400 });
  const parsed = CanvasStateSchema.safeParse(jsonBody.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid canvas state', issues: parsed.error.issues }, { status: 400 });
  const body = parsed.data;
  try { assertKnownDocument(body.documentId); } catch { return NextResponse.json({ error: 'Document not found' }, { status: 404 }); }

  ensureDir();
  const filePath = projectPath(join(STATE_DIR, `${body.documentId}.json`));
  body.lastSaved = new Date().toISOString();
  await withFileLock(`${filePath}.lock`, () => atomicWriteJson(filePath, body));

  return NextResponse.json({ success: true, savedAt: body.lastSaved });
}
