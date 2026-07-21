import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { projectKnowledgeObjectToLibraryItem } from '@/lib/knowledge/library-item';
import { parseJsonBody } from '@/lib/server/parse-json-body';
import { checkWriteAccess, getWritePolicy } from '@/lib/server/write-guard';
import {
  CaptureStoreError,
  captureStorePath,
  createCapture,
  listCaptureRecords,
  summarizeCaptureRecord,
} from '@/lib/server/knowledge-capture-store';

const SourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('url'),
    sourceUri: z.string().min(1),
    mediaType: z.enum(['text/markdown', 'text/plain']),
    content: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal('file'),
    fileName: z.string().min(1),
    mediaType: z.enum(['text/markdown', 'text/plain']),
    content: z.string().min(1),
  }).strict(),
]);

const CaptureSchema = z.object({
  source: SourceSchema,
  title: z.string().max(160).optional(),
  objectType: z.enum([
    'problem', 'claim', 'evidence', 'pattern', 'decision', 'technology', 'tool', 'tip',
    'failure_mode', 'artifact', 'quality_gate', 'capability_gene', 'commercial_hypothesis',
    'experiment', 'feedback', 'revision',
  ]),
  knowledgeForm: z.object({
    primary: z.enum(['fact', 'procedure', 'framework', 'metacognitive']),
    subform: z.enum([
      'definition', 'observation', 'measurement', 'constraint', 'checklist', 'workflow', 'technique', 'playbook',
      'model', 'taxonomy', 'decision_framework', 'architecture', 'heuristic', 'mental_model', 'reflection', 'learning_strategy',
    ]),
  }).strict(),
  domainRef: z.string().min(2),
  mutationId: z.string().regex(/^[a-zA-Z0-9._:-]+$/u).optional(),
}).strict();

function errorResponse(error: unknown) {
  if (error instanceof CaptureStoreError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Capture operation failed.';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json({
      captures: listCaptureRecords({ storeDir: captureStorePath() }).map(summarizeCaptureRecord),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid capture payload.' }, { status: 400 });
  const parsed = CaptureSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid capture payload.', issues: parsed.error.issues }, { status: 400 });
  const { mutationId, ...request } = parsed.data;
  try {
    const policy = getWritePolicy();
    const record = createCapture({
      storeDir: captureStorePath(),
      request,
      actor: policy.mode === 'dev' ? 'developer.local' : 'owner.session',
      mutationId: mutationId ?? `capture.${randomUUID()}`,
    });
    const capture = summarizeCaptureRecord(record);
    const item = projectKnowledgeObjectToLibraryItem(record.candidate, record.manifest.candidateHash, {
      origin: 'capture',
      generationMode: 'extractive',
      legacy: {
        category: 'Captured evidence', status: 'candidate', recommendationRank: 'unranked',
        recommendationContext: 'Deterministic extractive draft; requires human review.',
        version: null, stars: null, pricingModel: null,
      },
      reviewReasons: capture.reviewReasons,
      warningCodes: capture.warningCodes,
    });
    return NextResponse.json({ capture, item, replayed: record.replayed }, {
      status: record.replayed ? 200 : 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
