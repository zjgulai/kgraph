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
import { hashKnowledgeObject, type KnowledgeObject } from '../../../scripts/lib/knowledge-object-contract';
import {
  EnrichmentDraftSchema,
  buildEnrichedKnowledgeObject,
  createEnrichmentOutputJsonSchema,
  detectSourceLanguage,
  validateDraftAgainstSource,
  validateDraftAgainstGovernance,
  type EnrichmentDraft,
  type EnrichmentOutputJsonSchema,
  type SourceLanguage,
} from '../knowledge/enrichment-contract';
import { captureStorePath, readCaptureRecord } from './knowledge-capture-store';
import { inspectConfiguredProviderRuntime } from './knowledge-enrichment-provider';

const MANIFEST_SCHEMA = 'doccanvas-knowledge-enrichment-v1' as const;
const JOURNAL_SCHEMA = 'doccanvas-knowledge-enrichment-journal-v1' as const;
const ENRICHMENT_ID = /^enrich-[a-f0-9]{24}$/u;
const CAPTURE_ID = /^capture-[a-f0-9]{24}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/u;
const MUTATION_ID = /^[a-zA-Z0-9._:-]+$/u;

export interface EnrichmentUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface EnrichmentExecutorInput {
  captureId: string;
  sourceText: string;
  sourceHash: string;
  sourceLanguage: SourceLanguage;
  allowedDomainRefs: readonly string[];
  promptVersion: string;
  maxOutputTokens: number;
  outputSchema: EnrichmentOutputJsonSchema;
}

export interface EnrichmentExecutor {
  executionMode: 'fixture' | 'provider';
  providerId: string;
  modelId: string;
  execute(input: EnrichmentExecutorInput): Promise<{ output: unknown; usage?: Partial<EnrichmentUsage> }>;
}

export interface EnrichmentPolicy {
  enabled: boolean;
  allowedExecutionModes: readonly ('fixture' | 'provider')[];
  allowedProviders: readonly string[];
  allowedModels: readonly string[];
  maxInputBytes: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface EnrichmentManifest {
  schemaVersion: typeof MANIFEST_SCHEMA;
  enrichmentId: string;
  captureId: string;
  requestHash: string;
  inputHash: string;
  configHash: string;
  promptVersion: string;
  providerId: string;
  modelId: string;
  executionMode: 'fixture' | 'provider';
  providerCall: boolean;
  createdAt: string;
  actor: string;
  mutationId: string;
  draftHash: string;
  candidateHash: string;
  candidateFileHash: string;
  usage: EnrichmentUsage;
  status: 'succeeded';
}

interface EnrichmentJournalEntry {
  schemaVersion: typeof JOURNAL_SCHEMA;
  sequence: 1;
  operation: 'create';
  enrichmentId: string;
  captureId: string;
  mutationId: string;
  requestHash: string;
  manifestHash: string;
  createdAt: string;
  previousEntryHash: null;
  entryHash: string;
}

export interface EnrichmentRecord {
  manifest: EnrichmentManifest;
  draft: EnrichmentDraft;
  candidate: KnowledgeObject;
  directory: string;
  replayed: boolean;
}

export interface EnrichmentSummary {
  enrichmentId: string;
  captureId: string;
  inputHash: string;
  configHash: string;
  promptVersion: string;
  providerId: string;
  modelId: string;
  executionMode: 'fixture' | 'provider';
  providerCall: boolean;
  createdAt: string;
  title: string;
  summary: string;
  keyPoints: string[];
  objectType: string;
  knowledgeForm: { primary: string; subform: string };
  domainRefs: string[];
  usage: EnrichmentUsage;
  reviewState: 'human_review_required';
}

export class EnrichmentStoreError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(`${code}: ${message}`);
    this.name = 'EnrichmentStoreError';
  }
}

function fail(code: string, message: string, status = 400): never {
  throw new EnrichmentStoreError(code, message, status);
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

function hashRaw(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hashValue(value: unknown): string {
  return hashRaw(JSON.stringify(canonicalize(value)));
}

function validDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    && !Number.isNaN(Date.parse(value));
}

function assertDirectory(path: string, code: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(code, path, 500);
}

function rootPath(path: string, create: boolean): string | null {
  if (!path.trim()) fail('ENRICHMENT_STORE_REQUIRED', 'storeDir 不能为空', 500);
  const absolute = resolve(path);
  if (!existsSync(absolute)) {
    if (!create) return null;
    mkdirSync(absolute, { recursive: true, mode: 0o750 });
  }
  assertDirectory(absolute, 'ENRICHMENT_STORE_SYMLINK_REJECTED');
  return realpathSync(absolute);
}

function safeChild(root: string, name: string): string {
  const path = join(root, name);
  const relation = relative(root, path);
  if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) fail('ENRICHMENT_PATH_INVALID', name, 500);
  return path;
}

function normalizeUsage(value: Partial<EnrichmentUsage> | undefined): EnrichmentUsage {
  const normalize = (item: unknown): number | null => Number.isSafeInteger(item) && (item as number) >= 0 ? item as number : null;
  const usage = {
    inputTokens: normalize(value?.inputTokens),
    outputTokens: normalize(value?.outputTokens),
    totalTokens: normalize(value?.totalTokens),
  };
  if (usage.inputTokens !== null && usage.outputTokens !== null && usage.totalTokens !== null
      && usage.inputTokens + usage.outputTokens !== usage.totalTokens) {
    fail('ENRICHMENT_USAGE_INVALID', 'totalTokens 与 inputTokens + outputTokens 不一致', 502);
  }
  return usage;
}

function parseJson<T>(path: string, code: string): T {
  try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch (error) {
    fail(code, `${path}: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
}

function journalWithoutHash(entry: EnrichmentJournalEntry): Omit<EnrichmentJournalEntry, 'entryHash'> {
  const { entryHash: _entryHash, ...value } = entry;
  return value;
}

function readRecord(root: string, enrichmentId: string): EnrichmentRecord {
  if (!ENRICHMENT_ID.test(enrichmentId)) fail('ENRICHMENT_ID_INVALID', enrichmentId);
  const directory = safeChild(root, enrichmentId);
  if (!existsSync(directory)) fail('ENRICHMENT_NOT_FOUND', enrichmentId, 404);
  assertDirectory(directory, 'ENRICHMENT_DIRECTORY_INVALID');
  const expected = ['candidate.json', 'draft.json', 'journal.jsonl', 'manifest.json', 'request.json'];
  const actual = readdirSync(directory).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('ENRICHMENT_FILE_SET_INVALID', enrichmentId, 500);
  for (const name of actual) {
    const stat = lstatSync(join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink()) fail('ENRICHMENT_FILE_SET_INVALID', `${enrichmentId}/${name}`, 500);
  }
  const manifestPath = join(directory, 'manifest.json');
  const manifestRaw = readFileSync(manifestPath, 'utf8');
  const manifest = parseJson<EnrichmentManifest>(manifestPath, 'ENRICHMENT_MANIFEST_INVALID');
  if (
    manifest.schemaVersion !== MANIFEST_SCHEMA || manifest.enrichmentId !== enrichmentId
    || !CAPTURE_ID.test(manifest.captureId) || !HASH.test(manifest.requestHash) || !HASH.test(manifest.inputHash)
    || !HASH.test(manifest.configHash) || !HASH.test(manifest.draftHash) || !HASH.test(manifest.candidateHash)
    || !HASH.test(manifest.candidateFileHash) || !validDateTime(manifest.createdAt)
    || !SAFE_ID.test(manifest.promptVersion) || !SAFE_ID.test(manifest.providerId) || !SAFE_ID.test(manifest.modelId)
    || !MUTATION_ID.test(manifest.mutationId) || !manifest.actor.trim() || manifest.status !== 'succeeded'
    || !['fixture', 'provider'].includes(manifest.executionMode)
    || manifest.providerCall !== (manifest.executionMode === 'provider')
  ) fail('ENRICHMENT_MANIFEST_INVALID', enrichmentId, 500);
  normalizeUsage(manifest.usage);

  const request = parseJson<Record<string, unknown>>(join(directory, 'request.json'), 'ENRICHMENT_REQUEST_INVALID');
  if (hashValue(request) !== manifest.requestHash) fail('ENRICHMENT_REQUEST_HASH_MISMATCH', enrichmentId, 500);
  const draftRaw = readFileSync(join(directory, 'draft.json'), 'utf8');
  if (hashRaw(draftRaw) !== manifest.draftHash) fail('ENRICHMENT_DRAFT_HASH_MISMATCH', enrichmentId, 500);
  const parsedDraft = EnrichmentDraftSchema.safeParse(JSON.parse(draftRaw));
  if (!parsedDraft.success) fail('ENRICHMENT_DRAFT_INVALID', enrichmentId, 500);
  const candidateRaw = readFileSync(join(directory, 'candidate.json'), 'utf8');
  if (hashRaw(candidateRaw) !== manifest.candidateFileHash) fail('ENRICHMENT_CANDIDATE_FILE_HASH_MISMATCH', enrichmentId, 500);
  const candidate = parseJson<KnowledgeObject>(join(directory, 'candidate.json'), 'ENRICHMENT_CANDIDATE_INVALID');
  if (`sha256:${hashKnowledgeObject(candidate)}` !== manifest.candidateHash) fail('ENRICHMENT_CANDIDATE_HASH_MISMATCH', enrichmentId, 500);
  if (candidate.promotion_state !== 'human_review_required' || candidate.evidence_grade !== 'llm_distilled_candidate') {
    fail('ENRICHMENT_CANDIDATE_POLICY_INVALID', enrichmentId, 500);
  }
  const journalRaw = readFileSync(join(directory, 'journal.jsonl'), 'utf8');
  const lines = journalRaw.split('\n').filter(Boolean);
  if (lines.length !== 1) fail('ENRICHMENT_JOURNAL_INVALID', enrichmentId, 500);
  let entry: EnrichmentJournalEntry;
  try { entry = JSON.parse(lines[0]!) as EnrichmentJournalEntry; } catch { fail('ENRICHMENT_JOURNAL_INVALID', enrichmentId, 500); }
  if (
    entry.schemaVersion !== JOURNAL_SCHEMA || entry.sequence !== 1 || entry.operation !== 'create'
    || entry.enrichmentId !== enrichmentId || entry.captureId !== manifest.captureId
    || entry.mutationId !== manifest.mutationId || entry.requestHash !== manifest.requestHash
    || entry.manifestHash !== hashRaw(manifestRaw) || entry.createdAt !== manifest.createdAt
    || entry.previousEntryHash !== null || hashValue(journalWithoutHash(entry)) !== entry.entryHash
  ) fail('ENRICHMENT_JOURNAL_INVALID', enrichmentId, 500);
  return { manifest, draft: parsedDraft.data, candidate, directory, replayed: false };
}

export function enrichmentStorePath(): string {
  const configured = process.env.DOCCANVAS_ENRICHMENT_STORE_PATH?.trim();
  if (configured) {
    if (!isAbsolute(configured)) fail('ENRICHMENT_STORE_PATH_INVALID', '配置路径必须是绝对路径', 500);
    return resolve(configured);
  }
  return resolve(process.cwd(), 'data', 'enrichments');
}

export function getEnrichmentRuntimeStatus(): {
  mode: 'disabled' | 'configured'; providerId: string | null; modelId: string | null; ready: boolean; reason: string;
  jobId?: string; policyHash?: string; budget?: import('./knowledge-enrichment-provider').ProviderBudgetStatus;
} {
  return inspectConfiguredProviderRuntime();
}

export function listEnrichmentRecords(options: { storeDir?: string } = {}): EnrichmentRecord[] {
  const root = rootPath(options.storeDir ?? enrichmentStorePath(), false);
  if (!root) return [];
  return readdirSync(root).filter(name => !name.startsWith('.')).sort().map(name => readRecord(root, name))
    .sort((left, right) => right.manifest.createdAt.localeCompare(left.manifest.createdAt)
      || left.manifest.enrichmentId.localeCompare(right.manifest.enrichmentId));
}

export function readEnrichmentRecord(options: { storeDir?: string; enrichmentId: string }): EnrichmentRecord {
  const root = rootPath(options.storeDir ?? enrichmentStorePath(), false);
  if (!root) fail('ENRICHMENT_NOT_FOUND', options.enrichmentId, 404);
  return readRecord(root, options.enrichmentId);
}

export function latestEnrichmentForCapture(options: { storeDir?: string; captureId: string }): EnrichmentRecord | null {
  return listEnrichmentRecords({ storeDir: options.storeDir }).find(record => record.manifest.captureId === options.captureId) ?? null;
}

export function summarizeEnrichmentRecord(record: EnrichmentRecord): EnrichmentSummary {
  return {
    enrichmentId: record.manifest.enrichmentId,
    captureId: record.manifest.captureId,
    inputHash: record.manifest.inputHash,
    configHash: record.manifest.configHash,
    promptVersion: record.manifest.promptVersion,
    providerId: record.manifest.providerId,
    modelId: record.manifest.modelId,
    executionMode: record.manifest.executionMode,
    providerCall: record.manifest.providerCall,
    createdAt: record.manifest.createdAt,
    title: record.draft.title,
    summary: record.draft.summary,
    keyPoints: record.draft.keyPoints.map(point => point.text),
    objectType: record.draft.classification.objectType,
    knowledgeForm: { ...record.draft.classification.knowledgeForm },
    domainRefs: [...record.draft.classification.domainRefs],
    usage: { ...record.manifest.usage },
    reviewState: 'human_review_required',
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new EnrichmentStoreError('ENRICHMENT_TIMEOUT', `超过 ${timeoutMs}ms`, 504)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runEnrichment(options: {
  storeDir?: string;
  captureStoreDir?: string;
  captureId: string;
  actor: string;
  mutationId: string;
  enrichedAt?: string;
  promptVersion: string;
  executor: EnrichmentExecutor;
  policy: EnrichmentPolicy;
}): Promise<EnrichmentRecord> {
  if (!options.policy.enabled) fail('ENRICHMENT_DISABLED_BY_POLICY', 'Provider execution is disabled.', 409);
  if (!CAPTURE_ID.test(options.captureId)) fail('ENRICHMENT_CAPTURE_ID_INVALID', options.captureId);
  if (!MUTATION_ID.test(options.mutationId)) fail('ENRICHMENT_MUTATION_ID_INVALID', options.mutationId);
  if (!options.actor.trim()) fail('ENRICHMENT_ACTOR_REQUIRED', 'actor 不能为空');
  if (!SAFE_ID.test(options.promptVersion)) fail('ENRICHMENT_PROMPT_VERSION_INVALID', options.promptVersion);
  if (!SAFE_ID.test(options.executor.providerId) || !options.policy.allowedProviders.includes(options.executor.providerId)) {
    fail('ENRICHMENT_PROVIDER_NOT_ALLOWED', options.executor.providerId, 403);
  }
  if (!SAFE_ID.test(options.executor.modelId) || !options.policy.allowedModels.includes(options.executor.modelId)) {
    fail('ENRICHMENT_MODEL_NOT_ALLOWED', options.executor.modelId, 403);
  }
  if (!options.policy.allowedExecutionModes.includes(options.executor.executionMode)) {
    fail('ENRICHMENT_EXECUTION_MODE_NOT_ALLOWED', options.executor.executionMode, 403);
  }
  if (!Number.isSafeInteger(options.policy.maxInputBytes) || options.policy.maxInputBytes < 1
      || !Number.isSafeInteger(options.policy.maxOutputTokens) || options.policy.maxOutputTokens < 1
      || !Number.isSafeInteger(options.policy.timeoutMs) || options.policy.timeoutMs < 1) {
    fail('ENRICHMENT_POLICY_INVALID', 'size/token/timeout 必须为正整数', 500);
  }
  const enrichedAt = options.enrichedAt ?? new Date().toISOString();
  if (!validDateTime(enrichedAt)) fail('ENRICHMENT_TIME_INVALID', enrichedAt);
  const capture = readCaptureRecord({ storeDir: options.captureStoreDir ?? captureStorePath(), captureId: options.captureId });
  const sourceText = readFileSync(capture.sourcePath, 'utf8');
  if (Buffer.byteLength(sourceText, 'utf8') > options.policy.maxInputBytes) fail('ENRICHMENT_INPUT_TOO_LARGE', options.captureId, 413);
  const governance = {
    sourceLanguage: detectSourceLanguage(sourceText),
    allowedDomainRefs: [...capture.candidate.domain_refs].sort((left, right) => left.localeCompare(right)),
  };
  let outputSchema: EnrichmentOutputJsonSchema;
  try { outputSchema = createEnrichmentOutputJsonSchema(governance.allowedDomainRefs); } catch (error) {
    fail('ENRICHMENT_GOVERNANCE_INVALID', error instanceof Error ? error.message : String(error), 500);
  }
  const config = {
    providerId: options.executor.providerId,
    modelId: options.executor.modelId,
    executionMode: options.executor.executionMode,
    promptVersion: options.promptVersion,
    maxOutputTokens: options.policy.maxOutputTokens,
    schemaVersion: 'doccanvas-enrichment-draft-v1',
    governanceVersion: 'doccanvas-enrichment-governance-v1',
  };
  const request = { captureId: options.captureId, inputHash: capture.manifest.sourceHash, config, governance };
  const requestHash = hashValue(request);
  const storeDir = options.storeDir ?? enrichmentStorePath();
  for (const record of listEnrichmentRecords({ storeDir })) {
    if (record.manifest.mutationId === options.mutationId) {
      if (record.manifest.requestHash !== requestHash) fail('ENRICHMENT_MUTATION_CONFLICT', options.mutationId, 409);
      return { ...record, replayed: true };
    }
  }
  const enrichmentId = `enrich-${requestHash.slice(7, 31)}`;
  const existingRoot = rootPath(storeDir, false);
  if (existingRoot && existsSync(safeChild(existingRoot, enrichmentId))) {
    const record = readRecord(existingRoot, enrichmentId);
    if (record.manifest.requestHash !== requestHash) fail('ENRICHMENT_ID_CONFLICT', enrichmentId, 409);
    return { ...record, replayed: true };
  }

  let execution: Awaited<ReturnType<EnrichmentExecutor['execute']>>;
  try {
    execution = await withTimeout(options.executor.execute({
      captureId: options.captureId,
      sourceText,
      sourceHash: capture.manifest.sourceHash,
      sourceLanguage: governance.sourceLanguage,
      allowedDomainRefs: governance.allowedDomainRefs,
      promptVersion: options.promptVersion,
      maxOutputTokens: options.policy.maxOutputTokens,
      outputSchema,
    }), options.policy.timeoutMs);
  } catch (error) {
    if (error instanceof EnrichmentStoreError) throw error;
    if (error instanceof Error && error.name === 'ProviderRuntimeError') throw error;
    fail('ENRICHMENT_EXECUTOR_FAILED', error instanceof Error ? error.message : String(error), 502);
  }
  const parsed = EnrichmentDraftSchema.safeParse(execution.output);
  if (!parsed.success) fail('ENRICHMENT_OUTPUT_INVALID', parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '), 502);
  try { validateDraftAgainstSource(parsed.data, sourceText); } catch (error) {
    fail('ENRICHMENT_OUTPUT_INVALID', error instanceof Error ? error.message : String(error), 502);
  }
  try { validateDraftAgainstGovernance(parsed.data, sourceText, governance.allowedDomainRefs); } catch (error) {
    fail('ENRICHMENT_OUTPUT_INVALID', error instanceof Error ? error.message : String(error), 502);
  }
  let candidate: KnowledgeObject;
  try {
    candidate = buildEnrichedKnowledgeObject(capture, parsed.data, {
      enrichmentId, enrichedAt, providerId: options.executor.providerId,
      modelId: options.executor.modelId, promptVersion: options.promptVersion,
    });
  } catch (error) {
    fail('ENRICHMENT_CANDIDATE_INVALID', error instanceof Error ? error.message : String(error), 502);
  }
  const root = rootPath(storeDir, true)!;
  const requestRaw = json(request);
  const draftRaw = json(parsed.data);
  const candidateRaw = json(candidate);
  const manifest: EnrichmentManifest = {
    schemaVersion: MANIFEST_SCHEMA,
    enrichmentId,
    captureId: options.captureId,
    requestHash,
    inputHash: capture.manifest.sourceHash,
    configHash: hashValue(config),
    promptVersion: options.promptVersion,
    providerId: options.executor.providerId,
    modelId: options.executor.modelId,
    executionMode: options.executor.executionMode,
    providerCall: options.executor.executionMode === 'provider',
    createdAt: enrichedAt,
    actor: options.actor,
    mutationId: options.mutationId,
    draftHash: hashRaw(draftRaw),
    candidateHash: `sha256:${hashKnowledgeObject(candidate)}`,
    candidateFileHash: hashRaw(candidateRaw),
    usage: normalizeUsage(execution.usage),
    status: 'succeeded',
  };
  const manifestRaw = json(manifest);
  const journalBase: Omit<EnrichmentJournalEntry, 'entryHash'> = {
    schemaVersion: JOURNAL_SCHEMA, sequence: 1, operation: 'create', enrichmentId,
    captureId: options.captureId, mutationId: options.mutationId, requestHash,
    manifestHash: hashRaw(manifestRaw), createdAt: enrichedAt, previousEntryHash: null,
  };
  const journal: EnrichmentJournalEntry = { ...journalBase, entryHash: hashValue(journalBase) };
  const staging = safeChild(root, `.${enrichmentId}.${process.pid}.${Date.now()}.staging`);
  const target = safeChild(root, enrichmentId);
  try {
    mkdirSync(staging, { mode: 0o750 });
    writeFileSync(join(staging, 'request.json'), requestRaw, { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
    writeFileSync(join(staging, 'draft.json'), draftRaw, { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
    writeFileSync(join(staging, 'candidate.json'), candidateRaw, { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
    writeFileSync(join(staging, 'manifest.json'), manifestRaw, { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
    writeFileSync(join(staging, 'journal.jsonl'), `${JSON.stringify(journal)}\n`, { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
    renameSync(staging, target);
  } catch (error) {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    if (existsSync(target)) {
      const record = readRecord(root, enrichmentId);
      if (record.manifest.requestHash === requestHash) return { ...record, replayed: true };
    }
    fail('ENRICHMENT_CREATE_FAILED', error instanceof Error ? error.message : String(error), 500);
  }
  return readRecord(root, enrichmentId);
}
