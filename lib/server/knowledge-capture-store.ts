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
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'path';
import { hashKnowledgeObject, validateKnowledgeObject, type KnowledgeObject } from '../../../scripts/lib/knowledge-object-contract';
import { compileExtractiveDraft, type CaptureRequest } from '../knowledge/extractive-draft';
import { projectPath } from './project-root';

const CAPTURE_SCHEMA = 'doccanvas-knowledge-capture-v1' as const;
const JOURNAL_SCHEMA = 'doccanvas-knowledge-capture-journal-v1' as const;
const CAPTURE_ID = /^capture-[a-f0-9]{24}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MUTATION_ID = /^[a-zA-Z0-9._:-]+$/u;
const DOMAIN_REF = /^[a-zA-Z0-9][a-zA-Z0-9._-]+$/u;
const MAX_SOURCE_BYTES = 1024 * 1024;

export { type CaptureRequest } from '../knowledge/extractive-draft';

export interface CaptureManifest {
  schemaVersion: typeof CAPTURE_SCHEMA;
  captureId: string;
  requestHash: string;
  sourceHash: string;
  candidateHash: string;
  candidateFileHash: string;
  source: {
    kind: 'url' | 'file';
    uri: string;
    originalFileName: string | null;
    mediaType: 'text/markdown' | 'text/plain';
    snapshotFile: 'source.md' | 'source.txt';
  };
  capturedAt: string;
  actor: string;
  mutationId: string;
  generation: {
    mode: 'extractive';
    providerCall: false;
    providerStatus: 'disabled_by_policy';
  };
  review: { reasons: string[]; warningCodes: string[] };
}

interface CaptureJournalEntry {
  schemaVersion: typeof JOURNAL_SCHEMA;
  sequence: 1;
  operation: 'create';
  captureId: string;
  mutationId: string;
  requestHash: string;
  sourceHash: string;
  candidateHash: string;
  manifestHash: string;
  actor: string;
  capturedAt: string;
  previousEntryHash: null;
  entryHash: string;
}

export interface CaptureRecord {
  manifest: CaptureManifest;
  candidate: KnowledgeObject;
  sourcePath: string;
  directory: string;
  replayed: boolean;
}

export interface CaptureSummary {
  captureId: string;
  objectId: string;
  title: string;
  sourceKind: 'url' | 'file';
  sourceUri: string;
  sourceHash: string;
  capturedAt: string;
  generationMode: 'extractive';
  providerCall: false;
  reviewReasons: string[];
  warningCodes: string[];
}

export class CaptureStoreError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(`${code}: ${message}`);
    this.name = 'CaptureStoreError';
  }
}

function fail(code: string, message: string, status = 400): never {
  throw new CaptureStoreError(code, message, status);
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

function assertPlainDirectory(path: string, code: string): void {
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) fail(code, path, 500);
}

function storeRoot(storeDir: string, create: boolean): string | null {
  if (!storeDir.trim()) fail('CAPTURE_STORE_REQUIRED', 'storeDir 不能为空', 500);
  const absolute = resolve(storeDir);
  if (!existsSync(absolute)) {
    if (!create) return null;
    mkdirSync(absolute, { recursive: true, mode: 0o750 });
  }
  assertPlainDirectory(absolute, 'CAPTURE_STORE_SYMLINK_REJECTED');
  return realpathSync(absolute);
}

function safeChild(root: string, name: string): string {
  const child = join(root, name);
  const relation = relative(root, child);
  if (!relation || relation === '..' || relation.startsWith(`..${sep}`)) fail('CAPTURE_PATH_INVALID', name, 500);
  return child;
}

function validateRequest(request: CaptureRequest): void {
  if (!request || typeof request !== 'object') fail('CAPTURE_REQUEST_INVALID', '请求必须为 object');
  if (!request.source || typeof request.source.content !== 'string') fail('CAPTURE_CONTENT_INVALID', 'content 必须为字符串');
  const contentBytes = Buffer.byteLength(request.source.content, 'utf8');
  if (contentBytes === 0 || contentBytes > MAX_SOURCE_BYTES || request.source.content.includes('\0')) {
    fail('CAPTURE_CONTENT_INVALID', `正文必须为 1-${MAX_SOURCE_BYTES} bytes 的 UTF-8 文本且不能含 NUL`);
  }
  if (Buffer.from(request.source.content, 'utf8').toString('utf8') !== request.source.content) {
    fail('CAPTURE_CONTENT_INVALID', '正文包含无效 Unicode');
  }
  if (!['text/markdown', 'text/plain'].includes(request.source.mediaType)) fail('CAPTURE_MIME_INVALID', request.source.mediaType);
  if (request.source.kind === 'url') {
    let uri: URL;
    try { uri = new URL(request.source.sourceUri); } catch { fail('CAPTURE_SOURCE_URI_INVALID', request.source.sourceUri); }
    if (!['http:', 'https:'].includes(uri.protocol) || uri.username || uri.password) {
      fail('CAPTURE_SOURCE_URI_INVALID', request.source.sourceUri);
    }
  } else if (request.source.kind === 'file') {
    if (!request.source.fileName || basename(request.source.fileName) !== request.source.fileName || /[/\\]/u.test(request.source.fileName)) {
      fail('CAPTURE_FILE_INVALID', request.source.fileName);
    }
    const extension = extname(request.source.fileName).toLowerCase();
    const markdown = extension === '.md' || extension === '.markdown';
    const text = extension === '.txt';
    if (!markdown && !text) fail('CAPTURE_FILE_INVALID', request.source.fileName);
    if ((markdown && request.source.mediaType !== 'text/markdown') || (text && request.source.mediaType !== 'text/plain')) {
      fail('CAPTURE_MIME_INVALID', `${request.source.fileName} 与 ${request.source.mediaType} 不一致`);
    }
  } else {
    fail('CAPTURE_SOURCE_KIND_INVALID', String((request.source as { kind?: unknown }).kind));
  }
  if (!request.objectType || !request.knowledgeForm?.primary || !request.knowledgeForm.subform) {
    fail('CAPTURE_CLASSIFICATION_INVALID', 'objectType/knowledgeForm 必填');
  }
  if (!DOMAIN_REF.test(request.domainRef)) fail('CAPTURE_DOMAIN_INVALID', request.domainRef);
  if ((request.title?.length ?? 0) > 160 || request.title?.includes('\0')) fail('CAPTURE_TITLE_INVALID', 'title 非法');
}

function sourceFile(request: CaptureRequest): 'source.md' | 'source.txt' {
  return request.source.mediaType === 'text/markdown' ? 'source.md' : 'source.txt';
}

function sourceUri(request: CaptureRequest, captureId: string): string {
  return request.source.kind === 'url'
    ? request.source.sourceUri
    : `capture://${captureId}/${encodeURIComponent(request.source.fileName)}`;
}

function journalWithoutHash(entry: CaptureJournalEntry): Omit<CaptureJournalEntry, 'entryHash'> {
  const { entryHash: _entryHash, ...rest } = entry;
  return rest;
}

function parseJsonFile<T>(path: string, code: string): T {
  try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch (error) {
    fail(code, `${path}: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
}

function readRecord(root: string, captureId: string): CaptureRecord {
  if (!CAPTURE_ID.test(captureId)) fail('CAPTURE_ID_INVALID', captureId);
  const directory = safeChild(root, captureId);
  if (!existsSync(directory)) fail('CAPTURE_NOT_FOUND', captureId, 404);
  assertPlainDirectory(directory, 'CAPTURE_DIRECTORY_INVALID');
  const actualFiles = readdirSync(directory).sort();
  const manifestPath = join(directory, 'manifest.json');
  const manifestRaw = readFileSync(manifestPath, 'utf8');
  const manifest = parseJsonFile<CaptureManifest>(manifestPath, 'CAPTURE_MANIFEST_INVALID');
  if (manifest.captureId !== captureId || manifest.schemaVersion !== CAPTURE_SCHEMA) fail('CAPTURE_MANIFEST_INVALID', captureId, 500);
  if (!HASH.test(manifest.requestHash) || !HASH.test(manifest.sourceHash) || !HASH.test(manifest.candidateHash) || !HASH.test(manifest.candidateFileHash)) {
    fail('CAPTURE_MANIFEST_INVALID', `${captureId}: hash`, 500);
  }
  if (!validDateTime(manifest.capturedAt) || !MUTATION_ID.test(manifest.mutationId) || !manifest.actor.trim()) {
    fail('CAPTURE_MANIFEST_INVALID', `${captureId}: metadata`, 500);
  }
  if (
    manifest.generation?.mode !== 'extractive' || manifest.generation.providerCall !== false
    || manifest.generation.providerStatus !== 'disabled_by_policy'
    || !Array.isArray(manifest.review?.reasons) || !Array.isArray(manifest.review?.warningCodes)
    || !['url', 'file'].includes(manifest.source?.kind)
    || !['text/markdown', 'text/plain'].includes(manifest.source?.mediaType)
    || !['source.md', 'source.txt'].includes(manifest.source?.snapshotFile)
  ) fail('CAPTURE_MANIFEST_INVALID', `${captureId}: policy`, 500);
  const expectedFiles = ['candidate.json', 'journal.jsonl', 'manifest.json', manifest.source.snapshotFile].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) fail('CAPTURE_FILE_SET_INVALID', captureId, 500);
  for (const file of actualFiles) {
    if (lstatSync(join(directory, file)).isSymbolicLink() || !lstatSync(join(directory, file)).isFile()) {
      fail('CAPTURE_FILE_SET_INVALID', `${captureId}/${file}`, 500);
    }
  }
  const sourcePath = join(directory, manifest.source.snapshotFile);
  if (hashRaw(readFileSync(sourcePath)) !== manifest.sourceHash) fail('CAPTURE_SOURCE_HASH_MISMATCH', captureId, 500);
  const candidateRaw = readFileSync(join(directory, 'candidate.json'), 'utf8');
  if (hashRaw(candidateRaw) !== manifest.candidateFileHash) fail('CAPTURE_CANDIDATE_FILE_HASH_MISMATCH', captureId, 500);
  const candidateValue = parseJsonFile<unknown>(join(directory, 'candidate.json'), 'CAPTURE_CANDIDATE_INVALID');
  const validation = validateKnowledgeObject(candidateValue);
  if (!validation.success || !validation.knowledgeObject) fail('CAPTURE_CANDIDATE_INVALID', captureId, 500);
  const candidate = validation.knowledgeObject;
  if (`sha256:${hashKnowledgeObject(candidate)}` !== manifest.candidateHash) fail('CAPTURE_CANDIDATE_HASH_MISMATCH', captureId, 500);
  if (candidate.source_refs[0]?.snapshot_hash !== manifest.sourceHash.slice(7)) fail('CAPTURE_PROVENANCE_MISMATCH', captureId, 500);
  if (
    candidate.source_refs[0]?.source_uri !== manifest.source.uri
    || candidate.source_refs[0]?.locator !== `${captureId}/${manifest.source.snapshotFile}`
    || candidate.source_refs[0]?.observed_at !== manifest.capturedAt
    || candidate.observed_at !== manifest.capturedAt
  ) fail('CAPTURE_PROVENANCE_MISMATCH', captureId, 500);
  const journalRaw = readFileSync(join(directory, 'journal.jsonl'), 'utf8');
  const lines = journalRaw.split('\n').filter(Boolean);
  if (lines.length !== 1) fail('CAPTURE_JOURNAL_INVALID', captureId, 500);
  let entry: CaptureJournalEntry;
  try { entry = JSON.parse(lines[0]!) as CaptureJournalEntry; } catch { fail('CAPTURE_JOURNAL_INVALID', captureId, 500); }
  if (
    entry.schemaVersion !== JOURNAL_SCHEMA || entry.sequence !== 1 || entry.operation !== 'create'
    || entry.captureId !== captureId || entry.mutationId !== manifest.mutationId
    || entry.requestHash !== manifest.requestHash || entry.sourceHash !== manifest.sourceHash
    || entry.candidateHash !== manifest.candidateHash || entry.manifestHash !== hashRaw(manifestRaw)
    || entry.actor !== manifest.actor
    || entry.capturedAt !== manifest.capturedAt || entry.previousEntryHash !== null
    || hashValue(journalWithoutHash(entry)) !== entry.entryHash
  ) fail('CAPTURE_JOURNAL_INVALID', captureId, 500);
  return { manifest, candidate, sourcePath, directory, replayed: false };
}

export function captureStorePath(): string {
  const configured = process.env.DOCCANVAS_CAPTURE_STORE_PATH?.trim();
  if (configured) {
    if (!isAbsolute(configured)) fail('CAPTURE_STORE_PATH_INVALID', '配置路径必须是绝对路径', 500);
    return resolve(configured);
  }
  return projectPath('data', 'captures');
}

export function readCaptureRecord(options: { storeDir?: string; captureId: string }): CaptureRecord {
  const root = storeRoot(options.storeDir ?? captureStorePath(), false);
  if (!root) fail('CAPTURE_NOT_FOUND', options.captureId, 404);
  return readRecord(root, options.captureId);
}

export function listCaptureRecords(options: { storeDir?: string } = {}): CaptureRecord[] {
  const root = storeRoot(options.storeDir ?? captureStorePath(), false);
  if (!root) return [];
  return readdirSync(root)
    .filter(name => !name.startsWith('.'))
    .sort()
    .map(name => readRecord(root, name))
    .sort((left, right) => right.manifest.capturedAt.localeCompare(left.manifest.capturedAt) || left.manifest.captureId.localeCompare(right.manifest.captureId));
}

export function createCapture(options: {
  storeDir?: string;
  request: CaptureRequest;
  actor: string;
  mutationId: string;
  capturedAt?: string;
}): CaptureRecord {
  validateRequest(options.request);
  if (!options.actor.trim()) fail('CAPTURE_ACTOR_REQUIRED', 'actor 不能为空');
  if (!MUTATION_ID.test(options.mutationId)) fail('CAPTURE_MUTATION_ID_INVALID', options.mutationId);
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  if (!validDateTime(capturedAt)) fail('CAPTURE_TIME_INVALID', capturedAt);
  const requestHash = hashValue(options.request);
  const storeDir = options.storeDir ?? captureStorePath();
  for (const record of listCaptureRecords({ storeDir })) {
    if (record.manifest.mutationId === options.mutationId) {
      if (record.manifest.requestHash !== requestHash) fail('CAPTURE_MUTATION_CONFLICT', options.mutationId, 409);
      return { ...record, replayed: true };
    }
  }
  const captureId = `capture-${requestHash.slice(7, 31)}`;
  const existingRoot = storeRoot(storeDir, false);
  if (existingRoot && existsSync(safeChild(existingRoot, captureId))) {
    const record = readRecord(existingRoot, captureId);
    if (record.manifest.requestHash !== requestHash) fail('CAPTURE_ID_CONFLICT', captureId, 409);
    return { ...record, replayed: true };
  }
  const root = storeRoot(storeDir, true)!;
  const snapshotFile = sourceFile(options.request);
  const sourceHash = hashRaw(Buffer.from(options.request.source.content, 'utf8'));
  let candidate: KnowledgeObject;
  try {
    candidate = compileExtractiveDraft(options.request, {
      capturedAt,
      sourceHash,
      sourceLocator: `${captureId}/${snapshotFile}`,
      captureId,
    });
  } catch (error) {
    fail('CAPTURE_DRAFT_INVALID', error instanceof Error ? error.message : String(error));
  }
  const candidateRaw = json(candidate);
  const candidateHash = `sha256:${hashKnowledgeObject(candidate)}`;
  const manifest: CaptureManifest = {
    schemaVersion: CAPTURE_SCHEMA,
    captureId,
    requestHash,
    sourceHash,
    candidateHash,
    candidateFileHash: hashRaw(candidateRaw),
    source: {
      kind: options.request.source.kind,
      uri: sourceUri(options.request, captureId),
      originalFileName: options.request.source.kind === 'file' ? options.request.source.fileName : null,
      mediaType: options.request.source.mediaType,
      snapshotFile,
    },
    capturedAt,
    actor: options.actor,
    mutationId: options.mutationId,
    generation: { mode: 'extractive', providerCall: false, providerStatus: 'disabled_by_policy' },
    review: {
      reasons: ['capture_source_not_fetched', 'capture_source_requires_review', 'extractive_draft_requires_review'],
      warningCodes: [],
    },
  };
  const manifestRaw = json(manifest);
  const withoutEntryHash: Omit<CaptureJournalEntry, 'entryHash'> = {
    schemaVersion: JOURNAL_SCHEMA,
    sequence: 1,
    operation: 'create',
    captureId,
    mutationId: options.mutationId,
    requestHash,
    sourceHash,
    candidateHash,
    manifestHash: hashRaw(manifestRaw),
    actor: options.actor,
    capturedAt,
    previousEntryHash: null,
  };
  const journal: CaptureJournalEntry = { ...withoutEntryHash, entryHash: hashValue(withoutEntryHash) };
  const staging = safeChild(root, `.${captureId}.${process.pid}.${Date.now()}.staging`);
  const target = safeChild(root, captureId);
  try {
    mkdirSync(staging, { mode: 0o750 });
    writeFileSync(join(staging, snapshotFile), options.request.source.content, { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
    writeFileSync(join(staging, 'candidate.json'), candidateRaw, { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
    writeFileSync(join(staging, 'manifest.json'), manifestRaw, { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
    writeFileSync(join(staging, 'journal.jsonl'), `${JSON.stringify(journal)}\n`, { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
    renameSync(staging, target);
  } catch (error) {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    if (existsSync(target)) {
      const record = readRecord(root, captureId);
      if (record.manifest.requestHash === requestHash) return { ...record, replayed: true };
    }
    fail('CAPTURE_CREATE_FAILED', error instanceof Error ? error.message : String(error), 500);
  }
  return readRecord(root, captureId);
}

export function summarizeCaptureRecord(record: CaptureRecord): CaptureSummary {
  return {
    captureId: record.manifest.captureId,
    objectId: record.candidate.object_id,
    title: record.candidate.title,
    sourceKind: record.manifest.source.kind,
    sourceUri: record.manifest.source.uri,
    sourceHash: record.manifest.sourceHash,
    capturedAt: record.manifest.capturedAt,
    generationMode: 'extractive',
    providerCall: false,
    reviewReasons: [...record.manifest.review.reasons],
    warningCodes: [...record.manifest.review.warningCodes],
  };
}
