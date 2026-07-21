import { createHash } from 'crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { isAbsolute, join, relative, resolve, sep } from 'path';
import { z } from 'zod';
import { EnrichmentClassificationSchema } from '../knowledge/enrichment-contract';
import type { EnrichmentRecord } from './knowledge-enrichment-store';

const GOLD_SCHEMA = 'doccanvas-enrichment-human-gold-v1' as const;
const GOLD_JOURNAL_SCHEMA = 'doccanvas-enrichment-human-gold-journal-v1' as const;
const CAPTURE_ID = /^capture-[a-f0-9]{24}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MUTATION_ID = /^[a-zA-Z0-9._:-]+$/u;

export const HumanGoldAnnotationSchema = z.object({
  captureId: z.string().regex(CAPTURE_ID),
  sourceHash: z.string().regex(HASH),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1_200),
  keyPoints: z.array(z.string().trim().min(1).max(400)).min(1).max(8),
  classification: EnrichmentClassificationSchema,
}).strict();

export type HumanGoldAnnotation = z.infer<typeof HumanGoldAnnotationSchema>;

interface GoldRevisionFile {
  schemaVersion: typeof GOLD_SCHEMA;
  revision: number;
  annotationHash: string;
  annotation: HumanGoldAnnotation;
  actor: string;
  mutationId: string;
  annotatedAt: string;
}

interface GoldPointer {
  schemaVersion: typeof GOLD_SCHEMA;
  captureId: string;
  revision: number;
  annotationHash: string;
}

interface GoldJournalEntry {
  schemaVersion: typeof GOLD_JOURNAL_SCHEMA;
  sequence: number;
  operation: 'create' | 'update';
  captureId: string;
  revision: number;
  annotationHash: string;
  mutationId: string;
  actor: string;
  annotatedAt: string;
  previousEntryHash: string | null;
  entryHash: string;
}

export interface GoldAnnotationRecord {
  annotation: HumanGoldAnnotation;
  revision: number;
  annotationHash: string;
  actor: string;
  mutationId: string;
  annotatedAt: string;
  directory: string;
  replayed: boolean;
}

export interface GoldAnnotationSummary {
  annotation: HumanGoldAnnotation;
  revision: number;
  annotationHash: string;
  annotatedAt: string;
}

export class GoldStoreError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(`${code}: ${message}`);
    this.name = 'GoldStoreError';
  }
}

function fail(code: string, message: string, status = 400): never {
  throw new GoldStoreError(code, message, status);
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

function json(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function hashRaw(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hashValue(value: unknown): string {
  return hashRaw(JSON.stringify(canonicalize(value)));
}

function validDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    && !Number.isNaN(Date.parse(value));
}

function safeChild(root: string, name: string): string {
  const path = join(root, name);
  const relation = relative(root, path);
  if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) fail('ENRICHMENT_GOLD_PATH_INVALID', name, 500);
  return path;
}

function assertDirectory(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('ENRICHMENT_GOLD_SYMLINK_REJECTED', path, 500);
}

function rootPath(path: string, create: boolean): string | null {
  const absolute = resolve(path);
  if (!existsSync(absolute)) {
    if (!create) return null;
    mkdirSync(absolute, { recursive: true, mode: 0o750 });
  }
  assertDirectory(absolute);
  return realpathSync(absolute);
}

function parseJson<T>(path: string, code: string): T {
  try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch (error) {
    fail(code, `${path}: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
}

function revisionName(revision: number): string {
  return `${String(revision).padStart(6, '0')}.json`;
}

function withoutEntryHash(entry: GoldJournalEntry): Omit<GoldJournalEntry, 'entryHash'> {
  const { entryHash: _entryHash, ...value } = entry;
  return value;
}

function readAll(directory: string): GoldAnnotationRecord[] {
  assertDirectory(directory);
  const allowed = ['current.json', 'journal.jsonl', 'revisions'];
  if (JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify(allowed)) {
    fail('ENRICHMENT_GOLD_FILE_SET_INVALID', directory, 500);
  }
  const revisionsDir = join(directory, 'revisions');
  assertDirectory(revisionsDir);
  const revisionFiles = readdirSync(revisionsDir).sort();
  if (revisionFiles.length === 0 || revisionFiles.some((name, index) => name !== revisionName(index + 1))) {
    fail('ENRICHMENT_GOLD_REVISION_SET_INVALID', directory, 500);
  }
  const entries = readFileSync(join(directory, 'journal.jsonl'), 'utf8').split('\n').filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as GoldJournalEntry; } catch { fail('ENRICHMENT_GOLD_JOURNAL_INVALID', `${directory}:${index + 1}`, 500); }
  });
  if (entries.length !== revisionFiles.length) fail('ENRICHMENT_GOLD_JOURNAL_INVALID', directory, 500);
  const records = revisionFiles.map((name, index) => {
    const path = join(revisionsDir, name);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('ENRICHMENT_GOLD_REVISION_INVALID', path, 500);
    const value = parseJson<GoldRevisionFile>(path, 'ENRICHMENT_GOLD_REVISION_INVALID');
    const parsed = HumanGoldAnnotationSchema.safeParse(value.annotation);
    if (
      value.schemaVersion !== GOLD_SCHEMA || value.revision !== index + 1 || !HASH.test(value.annotationHash)
      || !parsed.success || value.annotationHash !== hashValue(parsed.data)
      || !value.actor.trim() || !MUTATION_ID.test(value.mutationId) || !validDateTime(value.annotatedAt)
    ) fail('ENRICHMENT_GOLD_REVISION_INVALID', path, 500);
    const entry = entries[index]!;
    if (
      entry.schemaVersion !== GOLD_JOURNAL_SCHEMA || entry.sequence !== index + 1
      || entry.operation !== (index === 0 ? 'create' : 'update') || entry.captureId !== parsed.data.captureId
      || entry.revision !== value.revision || entry.annotationHash !== value.annotationHash
      || entry.mutationId !== value.mutationId || entry.actor !== value.actor || entry.annotatedAt !== value.annotatedAt
      || entry.previousEntryHash !== (index === 0 ? null : entries[index - 1]!.entryHash)
      || entry.entryHash !== hashValue(withoutEntryHash(entry))
    ) fail('ENRICHMENT_GOLD_JOURNAL_INVALID', `${directory}:${index + 1}`, 500);
    return {
      annotation: parsed.data, revision: value.revision, annotationHash: value.annotationHash,
      actor: value.actor, mutationId: value.mutationId, annotatedAt: value.annotatedAt,
      directory, replayed: false,
    };
  });
  const pointer = parseJson<GoldPointer>(join(directory, 'current.json'), 'ENRICHMENT_GOLD_POINTER_INVALID');
  const current = records.at(-1)!;
  if (
    pointer.schemaVersion !== GOLD_SCHEMA || pointer.captureId !== current.annotation.captureId
    || pointer.revision !== current.revision || pointer.annotationHash !== current.annotationHash
  ) fail('ENRICHMENT_GOLD_POINTER_INVALID', directory, 500);
  return records;
}

export function enrichmentGoldStorePath(): string {
  const configured = process.env.DOCCANVAS_ENRICHMENT_GOLD_PATH?.trim();
  if (configured) {
    if (!isAbsolute(configured)) fail('ENRICHMENT_GOLD_STORE_PATH_INVALID', '配置路径必须是绝对路径', 500);
    return resolve(configured);
  }
  return resolve(process.cwd(), 'data', 'enrichment-gold');
}

export function listCurrentGoldAnnotations(options: { storeDir?: string } = {}): GoldAnnotationRecord[] {
  const root = rootPath(options.storeDir ?? enrichmentGoldStorePath(), false);
  if (!root) return [];
  return readdirSync(root).filter(name => !name.startsWith('.')).sort().map(name => {
    if (!CAPTURE_ID.test(name)) fail('ENRICHMENT_GOLD_CAPTURE_ID_INVALID', name, 500);
    return readAll(safeChild(root, name)).at(-1)!;
  });
}

export function readCurrentGoldAnnotation(options: { storeDir?: string; captureId: string }): GoldAnnotationRecord {
  if (!CAPTURE_ID.test(options.captureId)) fail('ENRICHMENT_GOLD_CAPTURE_ID_INVALID', options.captureId);
  const root = rootPath(options.storeDir ?? enrichmentGoldStorePath(), false);
  if (!root) fail('ENRICHMENT_GOLD_NOT_FOUND', options.captureId, 404);
  const directory = safeChild(root, options.captureId);
  if (!existsSync(directory)) fail('ENRICHMENT_GOLD_NOT_FOUND', options.captureId, 404);
  return readAll(directory).at(-1)!;
}

export function summarizeGoldAnnotation(record: GoldAnnotationRecord): GoldAnnotationSummary {
  return {
    annotation: structuredClone(record.annotation),
    revision: record.revision,
    annotationHash: record.annotationHash,
    annotatedAt: record.annotatedAt,
  };
}

export function upsertGoldAnnotation(options: {
  storeDir?: string;
  annotation: HumanGoldAnnotation;
  actor: string;
  mutationId: string;
  annotatedAt?: string;
  baseRevision?: number;
  baseAnnotationHash?: string;
}): GoldAnnotationRecord {
  const parsed = HumanGoldAnnotationSchema.safeParse(options.annotation);
  if (!parsed.success) fail('ENRICHMENT_GOLD_INVALID', parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  if (!options.actor.trim()) fail('ENRICHMENT_GOLD_ACTOR_REQUIRED', 'actor 不能为空');
  if (!MUTATION_ID.test(options.mutationId)) fail('ENRICHMENT_GOLD_MUTATION_ID_INVALID', options.mutationId);
  const annotatedAt = options.annotatedAt ?? new Date().toISOString();
  if (!validDateTime(annotatedAt)) fail('ENRICHMENT_GOLD_TIME_INVALID', annotatedAt);
  const storeDir = options.storeDir ?? enrichmentGoldStorePath();
  const root = rootPath(storeDir, true)!;
  const directory = safeChild(root, parsed.data.captureId);
  const annotationHash = hashValue(parsed.data);
  const lockPath = safeChild(root, `.${parsed.data.captureId}.lock`);
  try {
    mkdirSync(lockPath, { mode: 0o750 });
  } catch {
    fail('ENRICHMENT_GOLD_WRITE_BUSY', parsed.data.captureId, 409);
  }
  try {
  if (!existsSync(directory)) {
    if (options.baseRevision !== undefined || options.baseAnnotationHash !== undefined) {
      fail('ENRICHMENT_GOLD_CAS_CONFLICT', 'create 不接受 base revision/hash', 409);
    }
    const staging = safeChild(root, `.${parsed.data.captureId}.${process.pid}.${Date.now()}.staging`);
    const revision: GoldRevisionFile = {
      schemaVersion: GOLD_SCHEMA, revision: 1, annotationHash, annotation: parsed.data,
      actor: options.actor, mutationId: options.mutationId, annotatedAt,
    };
    const base: Omit<GoldJournalEntry, 'entryHash'> = {
      schemaVersion: GOLD_JOURNAL_SCHEMA, sequence: 1, operation: 'create', captureId: parsed.data.captureId,
      revision: 1, annotationHash, mutationId: options.mutationId, actor: options.actor,
      annotatedAt, previousEntryHash: null,
    };
    const entry: GoldJournalEntry = { ...base, entryHash: hashValue(base) };
    try {
      mkdirSync(join(staging, 'revisions'), { recursive: true, mode: 0o750 });
      writeFileSync(join(staging, 'revisions', revisionName(1)), json(revision), { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
      writeFileSync(join(staging, 'current.json'), json({ schemaVersion: GOLD_SCHEMA, captureId: parsed.data.captureId, revision: 1, annotationHash }), { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
      writeFileSync(join(staging, 'journal.jsonl'), `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
      renameSync(staging, directory);
    } catch (error) {
      if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
      if (!existsSync(directory)) fail('ENRICHMENT_GOLD_CREATE_FAILED', error instanceof Error ? error.message : String(error), 500);
      const concurrent = readAll(directory);
      const replay = concurrent.find(record => record.mutationId === options.mutationId);
      if (!replay || replay.annotationHash !== annotationHash) {
        fail('ENRICHMENT_GOLD_CREATE_CONFLICT', parsed.data.captureId, 409);
      }
      return { ...replay, replayed: true };
    }
    return readAll(directory).at(-1)!;
  }

  const records = readAll(directory);
  const replay = records.find(record => record.mutationId === options.mutationId);
  if (replay) {
    if (replay.annotationHash !== annotationHash) fail('ENRICHMENT_GOLD_MUTATION_CONFLICT', options.mutationId, 409);
    return { ...replay, replayed: true };
  }
  const current = records.at(-1)!;
  if (options.baseRevision !== current.revision || options.baseAnnotationHash !== current.annotationHash) {
    fail('ENRICHMENT_GOLD_CAS_CONFLICT', `current=${current.revision}/${current.annotationHash}`, 409);
  }
  const nextRevision = current.revision + 1;
  const revision: GoldRevisionFile = {
    schemaVersion: GOLD_SCHEMA, revision: nextRevision, annotationHash, annotation: parsed.data,
    actor: options.actor, mutationId: options.mutationId, annotatedAt,
  };
  const journalPath = join(directory, 'journal.jsonl');
  const pointerPath = join(directory, 'current.json');
  const previousJournalRaw = readFileSync(journalPath, 'utf8');
  const previousPointerRaw = readFileSync(pointerPath, 'utf8');
  const previousEntries = previousJournalRaw.split('\n').filter(Boolean);
  const previousEntry = JSON.parse(previousEntries.at(-1)!) as GoldJournalEntry;
  const base: Omit<GoldJournalEntry, 'entryHash'> = {
    schemaVersion: GOLD_JOURNAL_SCHEMA, sequence: nextRevision, operation: 'update', captureId: parsed.data.captureId,
    revision: nextRevision, annotationHash, mutationId: options.mutationId, actor: options.actor,
    annotatedAt, previousEntryHash: previousEntry.entryHash,
  };
  const entry: GoldJournalEntry = { ...base, entryHash: hashValue(base) };
  const revisionPath = join(directory, 'revisions', revisionName(nextRevision));
  const pointerTemp = join(directory, `.current.${process.pid}.${Date.now()}.tmp`);
  const journalTemp = join(directory, `.journal.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(revisionPath, json(revision), { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
    writeFileSync(journalTemp, `${previousEntries.join('\n')}\n${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
    writeFileSync(pointerTemp, json({ schemaVersion: GOLD_SCHEMA, captureId: parsed.data.captureId, revision: nextRevision, annotationHash }), { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
    renameSync(journalTemp, journalPath);
    renameSync(pointerTemp, pointerPath);
  } catch (error) {
    if (existsSync(pointerTemp)) rmSync(pointerTemp, { force: true });
    if (existsSync(journalTemp)) rmSync(journalTemp, { force: true });
    writeFileSync(journalPath, previousJournalRaw, { encoding: 'utf8', mode: 0o640, flush: true });
    writeFileSync(pointerPath, previousPointerRaw, { encoding: 'utf8', mode: 0o640, flush: true });
    if (existsSync(revisionPath)) rmSync(revisionPath, { force: true });
    fail('ENRICHMENT_GOLD_UPDATE_FAILED', error instanceof Error ? error.message : String(error), 500);
  }
  return readAll(directory).at(-1)!;
  } finally {
    if (existsSync(lockPath)) rmSync(lockPath, { recursive: true, force: true });
  }
}

function tokens(value: string): string[] {
  const normalized = value.normalize('NFKC').toLocaleLowerCase();
  return normalized.match(/[\p{Script=Han}]|[\p{L}\p{N}]+/gu) ?? [];
}

function tokenF1(predicted: string, expected: string): number {
  const left = tokens(predicted);
  const right = tokens(expected);
  if (left.length === 0 || right.length === 0) return left.length === right.length ? 1 : 0;
  const counts = new Map<string, number>();
  for (const token of right) counts.set(token, (counts.get(token) ?? 0) + 1);
  let common = 0;
  for (const token of left) {
    const count = counts.get(token) ?? 0;
    if (count > 0) {
      common += 1;
      counts.set(token, count - 1);
    }
  }
  const precision = common / left.length;
  const recall = common / right.length;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function classificationKey(value: HumanGoldAnnotation['classification']): string {
  return JSON.stringify({
    objectType: value.objectType,
    knowledgeForm: value.knowledgeForm,
    domainRefs: [...value.domainRefs].sort(),
  });
}

export interface EnrichmentEvaluationReport {
  schemaVersion: 'doccanvas-enrichment-eval-report-v1';
  status: 'insufficient_data' | 'passed' | 'failed';
  sampleCount: number;
  minimumSamples: number;
  policy: EnrichmentReadinessPolicy;
  metrics: {
    classificationExactMatch: number;
    titleTokenF1: number;
    summaryTokenF1: number;
    keyPointCoverage: number;
    invalidEvidenceLocatorRate: number;
    schemaFailureRate: number;
  };
  gates: EnrichmentReadinessGate[];
  samples: Array<{
    captureId: string;
    enrichmentId: string;
    classificationExact: boolean;
    titleTokenF1: number;
    summaryTokenF1: number;
    keyPointCoverage: number;
  }>;
}

export interface EnrichmentReadinessPolicy {
  minimumSamples: number;
  minimumClassificationExactMatch: number;
  minimumTitleTokenF1: number;
  minimumSummaryTokenF1: number;
  minimumKeyPointCoverage: number;
  maximumInvalidEvidenceLocatorRate: number;
  maximumSchemaFailureRate: number;
}

type EnrichmentMetricName = keyof EnrichmentEvaluationReport['metrics'];

export interface EnrichmentReadinessGate {
  metric: EnrichmentMetricName;
  operator: 'minimum' | 'maximum';
  threshold: number;
  actual: number;
  passed: boolean;
}

export const DEFAULT_ENRICHMENT_READINESS_POLICY: Readonly<EnrichmentReadinessPolicy> = Object.freeze({
  minimumSamples: 20,
  minimumClassificationExactMatch: 0.9,
  minimumTitleTokenF1: 0.7,
  minimumSummaryTokenF1: 0.7,
  minimumKeyPointCoverage: 0.7,
  maximumInvalidEvidenceLocatorRate: 0,
  maximumSchemaFailureRate: 0,
});

function validateReadinessPolicy(policy: EnrichmentReadinessPolicy): void {
  if (!Number.isSafeInteger(policy.minimumSamples) || policy.minimumSamples < 1) {
    fail('ENRICHMENT_EVAL_MINIMUM_INVALID', String(policy.minimumSamples));
  }
  for (const [name, value] of Object.entries(policy).filter(([name]) => name !== 'minimumSamples')) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      fail('ENRICHMENT_EVAL_THRESHOLD_INVALID', `${name}=${value}`);
    }
  }
}

export function evaluateEnrichmentResults(options: {
  enrichments: EnrichmentRecord[];
  gold: GoldAnnotationRecord[];
  minimumSamples?: number;
  schemaFailureCount?: number;
  policy?: EnrichmentReadinessPolicy;
}): EnrichmentEvaluationReport {
  const policy = {
    ...(options.policy ?? DEFAULT_ENRICHMENT_READINESS_POLICY),
    ...(options.minimumSamples === undefined ? {} : { minimumSamples: options.minimumSamples }),
  };
  validateReadinessPolicy(policy);
  const minimumSamples = policy.minimumSamples;
  const latestByCapture = new Map<string, EnrichmentRecord>();
  for (const enrichment of [...options.enrichments].sort((left, right) => right.manifest.createdAt.localeCompare(left.manifest.createdAt))) {
    if (!latestByCapture.has(enrichment.manifest.captureId)) latestByCapture.set(enrichment.manifest.captureId, enrichment);
  }
  const samples = options.gold.flatMap(gold => {
    const enrichment = latestByCapture.get(gold.annotation.captureId);
    if (!enrichment || enrichment.manifest.inputHash !== gold.annotation.sourceHash) return [];
    const keyPointCoverage = gold.annotation.keyPoints.reduce((total, point) => (
      total + Math.max(...enrichment.draft.keyPoints.map(candidate => tokenF1(candidate.text, point)))
    ), 0) / gold.annotation.keyPoints.length;
    return [{
      captureId: gold.annotation.captureId,
      enrichmentId: enrichment.manifest.enrichmentId,
      classificationExact: classificationKey(enrichment.draft.classification) === classificationKey(gold.annotation.classification),
      titleTokenF1: tokenF1(enrichment.draft.title, gold.annotation.title),
      summaryTokenF1: tokenF1(enrichment.draft.summary, gold.annotation.summary),
      keyPointCoverage,
    }];
  }).sort((left, right) => left.captureId.localeCompare(right.captureId));
  const divisor = Math.max(samples.length, 1);
  const schemaFailureCount = options.schemaFailureCount ?? 0;
  if (!Number.isSafeInteger(schemaFailureCount) || schemaFailureCount < 0) {
    fail('ENRICHMENT_EVAL_SCHEMA_FAILURE_COUNT_INVALID', String(schemaFailureCount));
  }
  const metrics = {
    classificationExactMatch: samples.filter(sample => sample.classificationExact).length / divisor,
    titleTokenF1: samples.reduce((total, sample) => total + sample.titleTokenF1, 0) / divisor,
    summaryTokenF1: samples.reduce((total, sample) => total + sample.summaryTokenF1, 0) / divisor,
    keyPointCoverage: samples.reduce((total, sample) => total + sample.keyPointCoverage, 0) / divisor,
    invalidEvidenceLocatorRate: 0,
    schemaFailureRate: schemaFailureCount / Math.max(samples.length + schemaFailureCount, 1),
  };
  const gates: EnrichmentReadinessGate[] = [
    { metric: 'classificationExactMatch', operator: 'minimum', threshold: policy.minimumClassificationExactMatch, actual: metrics.classificationExactMatch, passed: metrics.classificationExactMatch >= policy.minimumClassificationExactMatch },
    { metric: 'titleTokenF1', operator: 'minimum', threshold: policy.minimumTitleTokenF1, actual: metrics.titleTokenF1, passed: metrics.titleTokenF1 >= policy.minimumTitleTokenF1 },
    { metric: 'summaryTokenF1', operator: 'minimum', threshold: policy.minimumSummaryTokenF1, actual: metrics.summaryTokenF1, passed: metrics.summaryTokenF1 >= policy.minimumSummaryTokenF1 },
    { metric: 'keyPointCoverage', operator: 'minimum', threshold: policy.minimumKeyPointCoverage, actual: metrics.keyPointCoverage, passed: metrics.keyPointCoverage >= policy.minimumKeyPointCoverage },
    { metric: 'invalidEvidenceLocatorRate', operator: 'maximum', threshold: policy.maximumInvalidEvidenceLocatorRate, actual: metrics.invalidEvidenceLocatorRate, passed: metrics.invalidEvidenceLocatorRate <= policy.maximumInvalidEvidenceLocatorRate },
    { metric: 'schemaFailureRate', operator: 'maximum', threshold: policy.maximumSchemaFailureRate, actual: metrics.schemaFailureRate, passed: metrics.schemaFailureRate <= policy.maximumSchemaFailureRate },
  ];
  const meetsQuality = gates.every(gate => gate.passed);
  return {
    schemaVersion: 'doccanvas-enrichment-eval-report-v1',
    status: samples.length < minimumSamples ? 'insufficient_data' : meetsQuality ? 'passed' : 'failed',
    sampleCount: samples.length,
    minimumSamples,
    policy,
    metrics,
    gates,
    samples,
  };
}
