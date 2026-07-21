import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { z } from 'zod';
import {
  HumanGoldAnnotationSchema,
  type GoldAnnotationRecord,
  type HumanGoldAnnotation,
} from './knowledge-enrichment-eval';
import type { CaptureRecord } from './knowledge-capture-store';
import type { EnrichmentRecord } from './knowledge-enrichment-store';

const HASH = /^sha256:[a-f0-9]{64}$/u;
const PACK_ID = /^gold-pack-[a-f0-9]{24}$/u;
const MAX_TASKS = 20;
const MAX_TOTAL_SOURCE_BYTES = 2 * 1024 * 1024;

const DateTimeSchema = z.string().refine(value => (
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  && !Number.isNaN(Date.parse(value))
), 'invalid RFC3339 timestamp');

const GoldRefSchema = z.object({
  revision: z.number().int().min(1),
  annotationHash: z.string().regex(HASH),
}).strict().nullable();

const TaskCoreSchema = z.object({
  taskId: z.string().regex(/^gold-task-[a-f0-9]{24}$/u),
  captureId: z.string().regex(/^capture-[a-f0-9]{24}$/u),
  sourceHash: z.string().regex(HASH),
  sourceText: z.string().min(1).max(256 * 1024),
  sourceLineCount: z.number().int().min(1),
  currentGoldRef: GoldRefSchema,
}).strict();

export const HumanGoldTaskPackSchema = z.object({
  schemaVersion: z.literal('doccanvas-human-gold-task-pack-v1'),
  packId: z.string().regex(PACK_ID),
  packHash: z.string().regex(HASH),
  generatedAt: DateTimeSchema,
  instructions: z.literal('Annotate from sourceText only. Do not inspect or copy model output.'),
  tasks: z.array(TaskCoreSchema.extend({ annotation: z.null() }).strict()).min(1).max(MAX_TASKS),
}).strict();

export const CompletedHumanGoldTaskPackSchema = z.object({
  schemaVersion: z.literal('doccanvas-human-gold-task-pack-v1'),
  packId: z.string().regex(PACK_ID),
  packHash: z.string().regex(HASH),
  generatedAt: DateTimeSchema,
  instructions: z.literal('Annotate from sourceText only. Do not inspect or copy model output.'),
  completion: z.object({
    completedBy: z.string().trim().min(1).max(160),
    completedAt: DateTimeSchema,
    independentSourceReview: z.literal(true),
    modelOutputNotCopied: z.literal(true),
  }).strict(),
  tasks: z.array(TaskCoreSchema.extend({ annotation: HumanGoldAnnotationSchema }).strict()).min(1).max(MAX_TASKS),
}).strict();

export type HumanGoldTaskPack = z.infer<typeof HumanGoldTaskPackSchema>;
export type CompletedHumanGoldTaskPack = z.infer<typeof CompletedHumanGoldTaskPackSchema>;

export interface GoldBatchImportItem {
  annotation: HumanGoldAnnotation;
  mutationId: string;
  baseRevision?: number;
  baseAnnotationHash?: string;
}

export class GoldBatchError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(`${code}: ${message}`);
    this.name = 'GoldBatchError';
  }
}

function fail(code: string, message: string, status = 400): never {
  throw new GoldBatchError(code, message, status);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function hashValue(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

function hashRaw(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function packCore(value: Pick<HumanGoldTaskPack, 'schemaVersion' | 'generatedAt' | 'instructions'> & {
  tasks: Array<z.infer<typeof TaskCoreSchema>>;
}): unknown {
  return {
    schemaVersion: value.schemaVersion,
    generatedAt: value.generatedAt,
    instructions: value.instructions,
    tasks: value.tasks,
  };
}

function assertTaskIntegrity(task: z.infer<typeof TaskCoreSchema>): void {
  if (hashRaw(task.sourceText) !== task.sourceHash) fail('ENRICHMENT_GOLD_PACK_SOURCE_HASH_MISMATCH', task.captureId, 409);
  const lineCount = task.sourceText.replace(/\r\n?/gu, '\n').split('\n').length;
  if (lineCount !== task.sourceLineCount) fail('ENRICHMENT_GOLD_PACK_LINE_COUNT_MISMATCH', task.captureId, 409);
}

export function buildHumanGoldTaskPack(options: {
  captures: CaptureRecord[];
  enrichments: EnrichmentRecord[];
  gold: GoldAnnotationRecord[];
  generatedAt?: string;
  captureIds?: string[];
}): HumanGoldTaskPack {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  if (!DateTimeSchema.safeParse(generatedAt).success) fail('ENRICHMENT_GOLD_PACK_TIME_INVALID', generatedAt);
  const requested = options.captureIds ? new Set(options.captureIds) : null;
  if (requested && (requested.size !== options.captureIds!.length || requested.size > MAX_TASKS)) {
    fail('ENRICHMENT_GOLD_PACK_SELECTION_INVALID', 'captureIds must be unique and limited to 20');
  }
  const enrichedCaptureIds = new Set(options.enrichments.map(record => record.manifest.captureId));
  const goldByCapture = new Map(options.gold.map(record => [record.annotation.captureId, record]));
  const captures = options.captures.filter(record => (
    (!requested || requested.has(record.manifest.captureId)) && enrichedCaptureIds.has(record.manifest.captureId)
  )).sort((left, right) => left.manifest.captureId.localeCompare(right.manifest.captureId));
  if (requested) {
    const missing = [...requested].filter(id => !captures.some(record => record.manifest.captureId === id));
    if (missing.length > 0) fail('ENRICHMENT_GOLD_PACK_CAPTURE_NOT_ELIGIBLE', missing.join(', '), 409);
  }
  if (captures.length === 0) fail('ENRICHMENT_GOLD_PACK_EMPTY', 'no Capture with an Enrichment result is eligible', 409);
  if (captures.length > MAX_TASKS) fail('ENRICHMENT_GOLD_PACK_TOO_MANY_TASKS', `select at most ${MAX_TASKS} captures`, 409);
  let totalBytes = 0;
  const cores = captures.map(record => {
    const sourceText = readFileSync(record.sourcePath, 'utf8');
    totalBytes += Buffer.byteLength(sourceText, 'utf8');
    const current = goldByCapture.get(record.manifest.captureId);
    const core = {
      taskId: `gold-task-${hashValue({ captureId: record.manifest.captureId, sourceHash: record.manifest.sourceHash }).slice(7, 31)}`,
      captureId: record.manifest.captureId,
      sourceHash: record.manifest.sourceHash,
      sourceText,
      sourceLineCount: sourceText.replace(/\r\n?/gu, '\n').split('\n').length,
      currentGoldRef: current ? { revision: current.revision, annotationHash: current.annotationHash } : null,
    };
    assertTaskIntegrity(core);
    return core;
  });
  if (totalBytes > MAX_TOTAL_SOURCE_BYTES) fail('ENRICHMENT_GOLD_PACK_TOO_LARGE', 'combined source snapshots exceed 2 MiB', 413);
  const base = {
    schemaVersion: 'doccanvas-human-gold-task-pack-v1' as const,
    generatedAt,
    instructions: 'Annotate from sourceText only. Do not inspect or copy model output.' as const,
    tasks: cores,
  };
  const packHash = hashValue(packCore(base));
  return HumanGoldTaskPackSchema.parse({
    ...base,
    packId: `gold-pack-${packHash.slice(7, 31)}`,
    packHash,
    tasks: cores.map(task => ({ ...task, annotation: null })),
  });
}

export function prepareHumanGoldBatchImport(options: {
  value: unknown;
  captures: CaptureRecord[];
  gold: GoldAnnotationRecord[];
}): { pack: CompletedHumanGoldTaskPack; items: GoldBatchImportItem[] } {
  const parsed = CompletedHumanGoldTaskPackSchema.safeParse(options.value);
  if (!parsed.success) fail('ENRICHMENT_GOLD_PACK_INVALID', parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  const pack = parsed.data;
  const taskCores = pack.tasks.map(({ annotation: _annotation, ...task }) => task);
  const expectedHash = hashValue(packCore({
    schemaVersion: pack.schemaVersion,
    generatedAt: pack.generatedAt,
    instructions: pack.instructions,
    tasks: taskCores,
  }));
  if (pack.packHash !== expectedHash || pack.packId !== `gold-pack-${expectedHash.slice(7, 31)}`) {
    fail('ENRICHMENT_GOLD_PACK_HASH_MISMATCH', pack.packId, 409);
  }
  const liveCaptures = new Map(options.captures.map(record => [record.manifest.captureId, record]));
  const liveGold = new Map(options.gold.map(record => [record.annotation.captureId, record]));
  const ids = new Set<string>();
  const items = pack.tasks.map((task, index) => {
    const mutationId = `gold.batch.${pack.packId}.${String(index + 1).padStart(2, '0')}`;
    if (ids.has(task.captureId)) fail('ENRICHMENT_GOLD_PACK_DUPLICATE_CAPTURE', task.captureId, 409);
    ids.add(task.captureId);
    assertTaskIntegrity(task);
    const capture = liveCaptures.get(task.captureId);
    if (!capture || capture.manifest.sourceHash !== task.sourceHash || readFileSync(capture.sourcePath, 'utf8') !== task.sourceText) {
      fail('ENRICHMENT_GOLD_PACK_SOURCE_DRIFT', task.captureId, 409);
    }
    if (task.annotation.captureId !== task.captureId || task.annotation.sourceHash !== task.sourceHash) {
      fail('ENRICHMENT_GOLD_PACK_ANNOTATION_SOURCE_MISMATCH', task.captureId, 409);
    }
    const invalidLocator = task.annotation.classification.evidenceLocators.find(locator => (
      locator.startLine > task.sourceLineCount || locator.endLine > task.sourceLineCount
    ));
    if (invalidLocator) fail('ENRICHMENT_GOLD_PACK_LOCATOR_INVALID', task.captureId, 409);
    const current = liveGold.get(task.captureId);
    const replay = current?.mutationId === mutationId && current.annotationHash === hashValue(task.annotation);
    if (!replay) {
      if (task.currentGoldRef === null) {
        if (current) fail('ENRICHMENT_GOLD_PACK_CAS_CONFLICT', task.captureId, 409);
      } else if (!current || current.revision !== task.currentGoldRef.revision || current.annotationHash !== task.currentGoldRef.annotationHash) {
        fail('ENRICHMENT_GOLD_PACK_CAS_CONFLICT', task.captureId, 409);
      }
    }
    return {
      annotation: task.annotation,
      mutationId,
      ...(!replay && task.currentGoldRef ? {
        baseRevision: task.currentGoldRef.revision,
        baseAnnotationHash: task.currentGoldRef.annotationHash,
      } : {}),
    };
  });
  return { pack, items };
}
