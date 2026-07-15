import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mutateDocument } from '@/lib/server/document-mutations';
import { parseJsonBody } from '@/lib/server/parse-json-body';
import { checkWriteAccess } from '@/lib/server/write-guard';

const DocumentIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/);
const SectionHashSchema = z.string().regex(/^[a-f0-9]{12}$/);
const ModuleProfileSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  summary: z.string().max(500).optional(),
  order: z.number().int().min(0).max(10_000).optional(),
  employee: z.object({
    displayName: z.string().min(1).max(80),
    roleTitle: z.string().min(1).max(120),
    status: z.enum(['online', 'processing', 'needs-validation', 'restricted']),
    portraitAssetId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict().optional(),
  environmentId: z.enum([
    'navigation-archive', 'operations-floor', 'knowledge-studio', 'security-control',
    'evolution-lab', 'delivery-bay', 'business-observatory', 'boundary-review-room',
    'factory-entrance', 'shared-foundation', 'resource-annex', 'unassigned-room',
  ]).optional(),
}).strict();

const OperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('updateModule'),
    moduleId: z.string().min(1).max(256),
    profile: ModuleProfileSchema,
  }).strict(),
  z.object({
    type: z.literal('insertNode'),
    moduleId: z.string().min(1).max(256),
    parentSectionHash: SectionHashSchema.optional(),
    afterSectionHash: SectionHashSchema.optional(),
    title: z.string().min(1).max(300).refine(value => !/[\r\n]/.test(value)),
    content: z.string().max(2 * 1024 * 1024),
    nodeType: z.enum(['section', 'subsection', 'step', 'tool', 'prompt', 'principle']),
  }).strict(),
  z.object({
    type: z.literal('updateNode'),
    nodeId: z.string().min(1).max(256),
    sectionHash: SectionHashSchema,
    title: z.string().min(1).max(300).refine(value => !/[\r\n]/.test(value)),
    content: z.string().max(2 * 1024 * 1024),
    nodeType: z.enum(['section', 'subsection', 'step', 'tool', 'prompt', 'principle']),
  }).strict(),
  z.object({
    type: z.literal('moveNode'),
    moduleId: z.string().min(1).max(256),
    nodeId: z.string().min(1).max(256),
    sectionHash: SectionHashSchema,
    parentSectionHash: SectionHashSchema.optional(),
    afterSectionHash: SectionHashSchema.optional(),
  }).strict(),
  z.object({
    type: z.literal('duplicateNode'),
    moduleId: z.string().min(1).max(256),
    nodeId: z.string().min(1).max(256),
    sectionHash: SectionHashSchema,
  }).strict(),
  z.object({
    type: z.literal('softDeleteNode'),
    moduleId: z.string().min(1).max(256),
    nodeId: z.string().min(1).max(256),
    sectionHash: SectionHashSchema,
  }).strict(),
]);

const MutationSchema = z.object({
  baseRevision: z.number().int().min(0),
  baseDocumentHash: z.string().regex(/^[a-f0-9]{64}$/),
  operation: OperationSchema,
}).strict();

function statusForError(message: string): number {
  if (/conflict|stale|reload/i.test(message)) return 409;
  if (/not found|no longer available/i.test(message)) return 404;
  if (/cannot|invalid|not editable|outside its module/i.test(message)) return 400;
  return 500;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const { documentId } = await context.params;
  if (!DocumentIdSchema.safeParse(documentId).success) return NextResponse.json({ error: 'Invalid documentId.' }, { status: 400 });
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid mutation payload.' }, { status: 400 });
  const parsed = MutationSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid mutation payload.', issues: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json(await mutateDocument(documentId, parsed.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Document mutation failed.';
    return NextResponse.json({ error: message }, { status: statusForError(message) });
  }
}
