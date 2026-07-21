import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import {
  KnowledgeObjectSchema,
  hashKnowledgeObject,
  validateKnowledgeObject,
  type KnowledgeObject,
} from '../../../scripts/lib/knowledge-object-contract';
import {
  KnowledgeObjectStoreError,
  createKnowledgeObjectRevision,
  readCurrentKnowledgeObject,
  readKnowledgeObjectRevision,
  updateKnowledgeObjectRevision,
} from '../../../scripts/lib/knowledge-object-store';
import { projectPath } from './project-root';
import { defaultKnowledgePackPath, loadKnowledgeLibrary, parseKnowledgeLibraryPack } from './knowledge-library';
import { splitKnowledgeBody } from '../knowledge/legacy-snapshot';
import { captureStorePath, listCaptureRecords } from './knowledge-capture-store';
import { enrichmentStorePath, latestEnrichmentForCapture } from './knowledge-enrichment-store';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

export const KnowledgeReviewPatchSchema = KnowledgeObjectSchema.pick({
  title: true,
  body: true,
  knowledge_form: true,
  domain_refs: true,
  asset_maturity: true,
  cognitive_lenses: true,
  scope: true,
  observed_at: true,
  source_refs: true,
  relations: true,
  supersedes: true,
  evidence_grade: true,
  confidence: true,
  usage_context: true,
  value_context: true,
}).extend({
  valid_time: KnowledgeObjectSchema.shape.valid_time.unwrap().nullable(),
}).strict();

export type KnowledgeReviewPatch = Pick<KnowledgeObject,
  | 'title'
  | 'body'
  | 'knowledge_form'
  | 'domain_refs'
  | 'asset_maturity'
  | 'scope'
  | 'observed_at'
  | 'source_refs'
  | 'evidence_grade'
> & { valid_time: KnowledgeObject['valid_time'] | null } & Partial<Pick<KnowledgeObject,
  | 'cognitive_lenses'
  | 'relations'
  | 'supersedes'
  | 'confidence'
  | 'usage_context'
  | 'value_context'
>>;

interface CandidatePackSource {
  ref: string;
  sha256: string;
}

interface CandidatePackReview {
  object_id: string;
  source_line: number;
  source_entry_hash: string;
  reasons: string[];
}

interface CandidatePackValue {
  generated_at: string;
  source: CandidatePackSource;
  objects: unknown[];
  object_hashes: Record<string, string>;
  review_queue: CandidatePackReview[];
}

interface KnowledgeSeedRecord {
  packGeneratedAt: string;
  packSource: CandidatePackSource;
  object: KnowledgeObject;
  objectHash: string;
  review: CandidatePackReview;
  warningCodes: string[];
  seedActor: string;
}

export interface KnowledgeReviewRecord {
  object: KnowledgeObject;
  objectHash: string;
  revision: number;
  initialized: boolean;
  reviewReasons: string[];
  resolvedReviewReasons: string[];
  warningCodes: string[];
  sourceLine: number;
}

export interface KnowledgeReviewQueueItem {
  objectId: string;
  title: string;
  revision: number;
  initialized: boolean;
  reviewReasonCount: number;
  resolvedReviewCount: number;
}

export interface KnowledgeReviewRevision {
  revision: number;
  objectHash: string;
  title: string;
  observedAt: string;
  current: boolean;
  virtualSeed: boolean;
}

export class KnowledgeReviewError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(`${code}: ${message}`);
    this.name = 'KnowledgeReviewError';
  }
}

function fail(code: string, message: string, status = 400): never {
  throw new KnowledgeReviewError(code, message, status);
}

function parseCandidatePack(packPath: string): CandidatePackValue {
  let raw: string;
  try {
    raw = readFileSync(packPath, 'utf8');
  } catch (error) {
    fail('KNOWLEDGE_REVIEW_PACK_READ_FAILED', `${packPath}: ${error instanceof Error ? error.message : String(error)}`, 500);
  }
  parseKnowledgeLibraryPack(raw);
  return JSON.parse(raw) as CandidatePackValue;
}

function seedRecord(
  objectId: string,
  packPath: string,
  captureDir = captureStorePath(),
  enrichmentDir = enrichmentStorePath(),
): KnowledgeSeedRecord {
  const pack = parseCandidatePack(packPath);
  const rawObject = pack.objects.find(value => (
    value !== null && typeof value === 'object' && (value as { object_id?: unknown }).object_id === objectId
  ));
  if (!rawObject) {
    const capture = listCaptureRecords({ storeDir: captureDir }).find(record => record.candidate.object_id === objectId);
    if (!capture) fail('KNOWLEDGE_REVIEW_OBJECT_NOT_FOUND', objectId, 404);
    const enrichment = latestEnrichmentForCapture({ storeDir: enrichmentDir, captureId: capture.manifest.captureId });
    const object = enrichment?.candidate ?? capture.candidate;
    const objectHash = enrichment?.manifest.candidateHash ?? capture.manifest.candidateHash;
    const reasons = enrichment
      ? capture.manifest.review.reasons.filter(reason => reason !== 'extractive_draft_requires_review').concat('provider_generated_draft_requires_review')
      : [...capture.manifest.review.reasons];
    return {
      packGeneratedAt: enrichment?.manifest.createdAt ?? capture.manifest.capturedAt,
      packSource: { ref: capture.manifest.source.uri, sha256: capture.manifest.sourceHash },
      object,
      objectHash,
      review: {
        object_id: object.object_id,
        source_line: 0,
        source_entry_hash: capture.manifest.sourceHash,
        reasons,
      },
      warningCodes: [...capture.manifest.review.warningCodes],
      seedActor: enrichment ? 'capture.provider_structured' : 'capture.extractive',
    };
  }
  const validation = validateKnowledgeObject(rawObject);
  if (!validation.success || !validation.knowledgeObject) {
    fail(
      'KNOWLEDGE_REVIEW_SEED_INVALID',
      validation.errors.map(item => `${item.code} ${item.path}: ${item.message}`).join('; '),
      500,
    );
  }
  const objectHash = pack.object_hashes[objectId];
  if (!objectHash || !HASH_PATTERN.test(objectHash)) {
    fail('KNOWLEDGE_REVIEW_SEED_HASH_MISSING', objectId, 500);
  }
  const review = pack.review_queue.find(item => item.object_id === objectId);
  if (!review) fail('KNOWLEDGE_REVIEW_QUEUE_MISSING', objectId, 500);
  const library = parseKnowledgeLibraryPack(JSON.stringify(pack));
  const item = library.items.find(candidate => candidate.objectId === objectId);
  return {
    packGeneratedAt: pack.generated_at,
    packSource: pack.source,
    object: validation.knowledgeObject,
    objectHash,
    review,
    warningCodes: item?.warningCodes ?? [],
    seedActor: 'import.legacy-shared-knowledge',
  };
}

export function knowledgeReviewStorePath(): string {
  const configured = process.env.DOCCANVAS_KNOWLEDGE_STORE_PATH?.trim();
  if (configured) {
    if (!isAbsolute(configured)) fail('KNOWLEDGE_REVIEW_STORE_PATH_INVALID', '配置路径必须是绝对路径', 500);
    return resolve(configured);
  }
  return projectPath('data/knowledge-candidates');
}

function storeMissing(error: unknown): boolean {
  return error instanceof KnowledgeObjectStoreError && error.code === 'KNOWLEDGE_OBJECT_NOT_FOUND';
}

function provenance(seed: KnowledgeSeedRecord, object: KnowledgeObject): void {
  const original = seed.object.source_refs;
  if (object.source_refs.length !== original.length) {
    fail('KNOWLEDGE_REVIEW_SOURCE_PROVENANCE_MISMATCH', 'UI-2 不允许新增或删除 seed source');
  }
  const expectedEntryHash = seed.review.source_entry_hash.replace(/^sha256:/, '');
  for (const [index, source] of object.source_refs.entries()) {
    const seedSource = original[index];
    if (
      !seedSource
      || source.source_id !== seedSource.source_id
      || source.snapshot_hash !== seedSource.snapshot_hash
      || source.locator !== seedSource.locator
      || (index === 0 && source.snapshot_hash !== expectedEntryHash)
    ) {
      fail('KNOWLEDGE_REVIEW_SOURCE_PROVENANCE_MISMATCH', `source_refs.${index} 的 ID/locator/snapshot hash 不可漂移`);
    }
  }
}

function preserveLegacySnapshot(seed: KnowledgeSeedRecord, object: KnowledgeObject): void {
  const seedSnapshot = splitKnowledgeBody(seed.object.body).legacySnapshot;
  if (!seedSnapshot) return;
  if (splitKnowledgeBody(object.body).legacySnapshot !== seedSnapshot) {
    fail('KNOWLEDGE_REVIEW_LEGACY_SNAPSHOT_MISMATCH', 'Legacy structured snapshot 是只读迁移证据，不允许修改或删除');
  }
}

function record(seed: KnowledgeSeedRecord, object: KnowledgeObject, objectHash: string, initialized: boolean): KnowledgeReviewRecord {
  provenance(seed, object);
  const resolvedReviewReasons = seed.review.reasons.filter(reason => (
    reason === 'valid_from_unknown' && Boolean(object.valid_time?.from)
  ));
  return {
    object,
    objectHash,
    revision: object.revision,
    initialized,
    reviewReasons: [...seed.review.reasons],
    resolvedReviewReasons,
    warningCodes: [...seed.warningCodes],
    sourceLine: seed.review.source_line,
  };
}

export function listKnowledgeReviewQueue(options: {
  packPath?: string;
  storeDir?: string;
  captureDir?: string;
  enrichmentDir?: string;
} = {}): KnowledgeReviewQueueItem[] {
  const packPath = options.packPath ?? defaultKnowledgePackPath();
  const storeDir = options.storeDir ?? knowledgeReviewStorePath();
  const library = loadKnowledgeLibrary(
    packPath,
    storeDir,
    options.captureDir ?? captureStorePath(),
    options.enrichmentDir ?? enrichmentStorePath(),
  );
  return library.items.map(item => {
    try {
      const current = readCurrentKnowledgeObject(storeDir, item.objectId);
      const resolvedReviewCount = item.reviewReasons.filter(reason => (
        reason === 'valid_from_unknown' && Boolean(current.knowledgeObject.valid_time?.from)
      )).length;
      return {
        objectId: item.objectId,
        title: current.knowledgeObject.title,
        revision: current.pointer.revision,
        initialized: true,
        reviewReasonCount: item.reviewReasons.length,
        resolvedReviewCount,
      };
    } catch (error) {
      if (!storeMissing(error)) throw error;
      return {
        objectId: item.objectId,
        title: item.title,
        revision: 1,
        initialized: false,
        reviewReasonCount: item.reviewReasons.length,
        resolvedReviewCount: 0,
      };
    }
  });
}

export function knowledgeReviewPatchFromObject(object: KnowledgeObject): KnowledgeReviewPatch {
  const parsed = KnowledgeReviewPatchSchema.parse({
    title: object.title,
    body: object.body,
    knowledge_form: object.knowledge_form,
    domain_refs: object.domain_refs,
    asset_maturity: object.asset_maturity,
    cognitive_lenses: object.cognitive_lenses,
    scope: object.scope,
    valid_time: object.valid_time ?? null,
    observed_at: object.observed_at,
    source_refs: object.source_refs,
    relations: object.relations,
    supersedes: object.supersedes,
    evidence_grade: object.evidence_grade,
    confidence: object.confidence,
    usage_context: object.usage_context,
    value_context: object.value_context,
  });
  return structuredClone(parsed) as KnowledgeReviewPatch;
}

export function loadKnowledgeReviewObject(options: {
  objectId: string;
  packPath?: string;
  storeDir?: string;
  captureDir?: string;
  enrichmentDir?: string;
}): KnowledgeReviewRecord {
  const packPath = options.packPath ?? defaultKnowledgePackPath();
  const storeDir = options.storeDir ?? knowledgeReviewStorePath();
  const seed = seedRecord(
    options.objectId,
    packPath,
    options.captureDir ?? captureStorePath(),
    options.enrichmentDir ?? enrichmentStorePath(),
  );
  try {
    const current = readCurrentKnowledgeObject(storeDir, options.objectId);
    return record(seed, current.knowledgeObject, current.pointer.document_hash, true);
  } catch (error) {
    if (!storeMissing(error)) throw error;
    return record(seed, seed.object, seed.objectHash, false);
  }
}

export function listKnowledgeReviewRevisions(options: {
  objectId: string;
  packPath?: string;
  storeDir?: string;
  captureDir?: string;
}): KnowledgeReviewRevision[] {
  const packPath = options.packPath ?? defaultKnowledgePackPath();
  const storeDir = options.storeDir ?? knowledgeReviewStorePath();
  const current = loadKnowledgeReviewObject({ ...options, packPath, storeDir });
  if (!current.initialized) {
    return [{
      revision: 1,
      objectHash: current.objectHash,
      title: current.object.title,
      observedAt: current.object.observed_at,
      current: true,
      virtualSeed: true,
    }];
  }
  const revisions: KnowledgeReviewRevision[] = [];
  for (let revision = current.revision; revision >= 1; revision -= 1) {
    const item = readKnowledgeObjectRevision(storeDir, options.objectId, revision);
    revisions.push({
      revision,
      objectHash: item.pointer.document_hash,
      title: item.knowledgeObject.title,
      observedAt: item.knowledgeObject.observed_at,
      current: revision === current.revision,
      virtualSeed: false,
    });
  }
  return revisions;
}

function ensureSeedRevision(seed: KnowledgeSeedRecord, storeDir: string): void {
  try {
    readCurrentKnowledgeObject(storeDir, seed.object.object_id);
    return;
  } catch (error) {
    if (!storeMissing(error)) throw error;
  }
  createKnowledgeObjectRevision({
    storeDir,
    knowledgeObject: seed.object,
    actor: seed.seedActor,
    mutationId: `seed.${seed.objectHash.slice(7, 39)}`,
    mutatedAt: seed.packGeneratedAt,
  });
}

function mapStoreError(error: unknown): never {
  if (error instanceof KnowledgeObjectStoreError) {
    if (error.code === 'KNOWLEDGE_OBJECT_CAS_CONFLICT') {
      fail('KNOWLEDGE_REVIEW_CAS_CONFLICT', error.message, 409);
    }
    if (error.code === 'KNOWLEDGE_OBJECT_NOT_FOUND') {
      fail('KNOWLEDGE_REVIEW_OBJECT_NOT_FOUND', error.message, 404);
    }
    if (error.code === 'KNOWLEDGE_OBJECT_INVALID' || error.code === 'KNOWLEDGE_OBJECT_NOT_CANDIDATE') {
      fail('KNOWLEDGE_REVIEW_OBJECT_INVALID', error.message);
    }
    fail('KNOWLEDGE_REVIEW_STORE_FAILED', error.message, 500);
  }
  throw error;
}

export function updateKnowledgeReviewObject(options: {
  objectId: string;
  baseRevision: number;
  baseObjectHash: string;
  patch: KnowledgeReviewPatch;
  actor: string;
  mutationId?: string;
  mutatedAt?: string;
  packPath?: string;
  storeDir?: string;
  captureDir?: string;
  enrichmentDir?: string;
}): KnowledgeReviewRecord {
  const packPath = options.packPath ?? defaultKnowledgePackPath();
  const storeDir = options.storeDir ?? knowledgeReviewStorePath();
  const seed = seedRecord(
    options.objectId,
    packPath,
    options.captureDir ?? captureStorePath(),
    options.enrichmentDir ?? enrichmentStorePath(),
  );
  const patchResult = KnowledgeReviewPatchSchema.safeParse(options.patch);
  if (!patchResult.success) {
    fail('KNOWLEDGE_REVIEW_OBJECT_INVALID', patchResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  const before = loadKnowledgeReviewObject({
    objectId: options.objectId,
    packPath,
    storeDir,
    captureDir: options.captureDir,
    enrichmentDir: options.enrichmentDir,
  });
  if (before.revision !== options.baseRevision || before.objectHash !== options.baseObjectHash) {
    fail('KNOWLEDGE_REVIEW_CAS_CONFLICT', `current=${before.revision}/${before.objectHash}`, 409);
  }
  const next = {
    ...before.object,
    ...structuredClone(patchResult.data),
    valid_time: patchResult.data.valid_time ?? undefined,
    object_id: before.object.object_id,
    promotion_state: before.object.promotion_state,
    created_by: before.object.created_by,
    revision: before.revision + 1,
    schema_version: before.object.schema_version,
  } satisfies KnowledgeObject;
  provenance(seed, next);
  preserveLegacySnapshot(seed, next);
  const validation = validateKnowledgeObject(next);
  if (!validation.success || !validation.knowledgeObject) {
    fail('KNOWLEDGE_REVIEW_OBJECT_INVALID', validation.errors.map(item => `${item.code} ${item.path}: ${item.message}`).join('; '));
  }
  try {
    ensureSeedRevision(seed, storeDir);
    const updated = updateKnowledgeObjectRevision({
      storeDir,
      knowledgeObject: validation.knowledgeObject,
      baseRevision: options.baseRevision,
      baseDocumentHash: options.baseObjectHash,
      actor: options.actor,
      mutationId: options.mutationId ?? `review.${randomUUID()}`,
      mutatedAt: options.mutatedAt ?? new Date().toISOString(),
    });
    return record(seed, updated.knowledgeObject, updated.pointer.document_hash, true);
  } catch (error) {
    mapStoreError(error);
  }
}
