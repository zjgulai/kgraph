import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
import type { KnowledgeObject } from '../../../scripts/lib/knowledge-object-contract';
import {
  KnowledgeObjectStoreError,
  readCurrentKnowledgeObject,
} from '../../../scripts/lib/knowledge-object-store';
import { projectKnowledgeObjectToLibraryItem } from '../knowledge/library-item';
import type { KnowledgeLibraryItem, KnowledgeLibraryProjection } from '../knowledge/library-types';
import { listCaptureRecords } from './knowledge-capture-store';
import { listEnrichmentRecords } from './knowledge-enrichment-store';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SNAPSHOT_PATTERN = /## Legacy structured snapshot\s+```json\s+([\s\S]*?)\s+```/u;
const PACK_FILENAME = 'shared-knowledge-v1-candidate-pack.json';

const SourceSchema = z.object({
  source_uri: z.string().min(1),
  locator: z.string().min(1),
  observed_at: z.string().datetime({ offset: true }),
  authority_origin: z.string().min(1),
}).passthrough();

const RelationSchema = z.object({
  relation_type: z.enum([
    'supports', 'contradicts', 'supersedes', 'requires', 'alternative_to', 'derived_from',
    'tested_by', 'used_in', 'blocks', 'optimizes_for', 'observed_in', 'context_depends_on',
  ]),
  target_id: z.string().min(1),
  rationale: z.string().optional(),
}).strict();

const KnowledgeObjectSchema = z.object({
  object_id: z.string().min(1),
  object_type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  knowledge_form: z.object({
    primary: z.string().min(1),
  }).passthrough(),
  domain_refs: z.array(z.string().min(1)).min(1),
  asset_maturity: z.string().min(1),
  scope: z.string().min(1),
  valid_time: z.object({
    from: z.string().datetime({ offset: true }).nullable(),
    until: z.string().datetime({ offset: true }).nullable(),
  }).strict(),
  observed_at: z.string().datetime({ offset: true }),
  source_refs: z.array(SourceSchema).min(1),
  relations: z.array(RelationSchema).optional(),
  evidence_grade: z.string().min(1),
  promotion_state: z.string().min(1),
  revision: z.number().int().min(1),
}).passthrough();

const ReviewItemSchema = z.object({
  object_id: z.string().min(1),
  reasons: z.array(z.string().min(1)).min(1),
}).passthrough();

const QaIssueSchema = z.object({
  code: z.string().min(1),
  object_id: z.string().min(1),
}).passthrough();

const CandidatePackSchema = z.object({
  schema_version: z.literal('ai-product-factory-knowledge-candidate-pack-v1'),
  generated_at: z.string().datetime({ offset: true }),
  source: z.object({
    ref: z.string().min(1),
    sha256: z.string().regex(HASH_PATTERN),
    entry_count: z.number().int().min(1),
  }).strict(),
  objects: z.array(KnowledgeObjectSchema).min(1),
  object_hashes: z.record(z.string().regex(HASH_PATTERN)),
  review_queue: z.array(ReviewItemSchema),
  qa: z.object({
    errors: z.array(QaIssueSchema),
    warnings: z.array(QaIssueSchema),
  }).strict(),
  pack_hash: z.string().regex(HASH_PATTERN),
}).passthrough();

const LegacySnapshotSchema = z.object({
  category: z.string().min(1),
  status: z.string().min(1),
  recommendation_rank: z.string().min(1),
  recommendation_context: z.string().default(''),
  version: z.string().nullable().optional(),
  stars: z.number().int().min(0).nullable().optional(),
  pricing: z.object({ model: z.string().optional() }).passthrough().optional(),
}).passthrough();

type CandidatePack = z.infer<typeof CandidatePackSchema>;

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function hashValue(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

function parseLegacySnapshot(body: string, objectId: string) {
  const match = body.match(SNAPSHOT_PATTERN);
  if (!match?.[1]) fail('KNOWLEDGE_LEGACY_SNAPSHOT_MISSING', objectId);
  let value: unknown;
  try {
    value = JSON.parse(match[1]);
  } catch (error) {
    fail('KNOWLEDGE_LEGACY_SNAPSHOT_INVALID', `${objectId}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = LegacySnapshotSchema.safeParse(value);
  if (!parsed.success) {
    fail('KNOWLEDGE_LEGACY_SNAPSHOT_INVALID', `${objectId}: ${parsed.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  }
  return parsed.data;
}

function verifyPack(pack: CandidatePack): void {
  if (pack.qa.errors.length > 0) fail('KNOWLEDGE_PACK_QA_FAILED', `${pack.qa.errors.length} errors`);
  if (pack.source.entry_count !== pack.objects.length) {
    fail('KNOWLEDGE_PACK_ENTRY_COUNT_INVALID', 'source.entry_count 与 objects.length 不一致');
  }
  const objectIds = pack.objects.map(object => object.object_id);
  if (new Set(objectIds).size !== objectIds.length) fail('KNOWLEDGE_PACK_OBJECT_ID_DUPLICATE', 'object_id 重复');
  const reviewIds = pack.review_queue.map(item => item.object_id);
  if (
    reviewIds.length !== objectIds.length
    || new Set(reviewIds).size !== objectIds.length
    || objectIds.some(objectId => !reviewIds.includes(objectId))
  ) {
    fail('KNOWLEDGE_PACK_REVIEW_COVERAGE_INVALID', 'review queue 未一对一覆盖 objects');
  }
  if (Object.keys(pack.object_hashes).length !== objectIds.length) {
    fail('KNOWLEDGE_PACK_OBJECT_HASH_COVERAGE_INVALID', 'object hashes 未一对一覆盖 objects');
  }
  for (const object of pack.objects) {
    const actual = `sha256:${hashValue(object)}`;
    if (pack.object_hashes[object.object_id] !== actual) {
      fail('KNOWLEDGE_PACK_OBJECT_HASH_MISMATCH', object.object_id);
    }
  }
  const { pack_hash: _packHash, ...withoutHash } = pack;
  if (pack.pack_hash !== `sha256:${hashValue(withoutHash)}`) {
    fail('KNOWLEDGE_PACK_HASH_MISMATCH', 'pack_hash 不匹配');
  }
}

function toLibraryProjection(pack: CandidatePack): KnowledgeLibraryProjection {
  const reviewById = new Map(pack.review_queue.map(item => [item.object_id, item.reasons]));
  const warningsById = new Map<string, string[]>();
  for (const warning of pack.qa.warnings) {
    const codes = warningsById.get(warning.object_id) ?? [];
    codes.push(warning.code);
    warningsById.set(warning.object_id, codes);
  }
  const items: KnowledgeLibraryItem[] = pack.objects.map(object => {
    const legacy = parseLegacySnapshot(object.body, object.object_id);
    return projectKnowledgeObjectToLibraryItem(object as KnowledgeObject, pack.object_hashes[object.object_id]!, {
      legacy: {
        category: legacy.category,
        status: legacy.status,
        recommendationRank: legacy.recommendation_rank,
        recommendationContext: legacy.recommendation_context,
        version: legacy.version ?? null,
        stars: legacy.stars ?? null,
        pricingModel: legacy.pricing?.model ?? null,
      },
      origin: 'legacy_seed',
      reviewReasons: [...(reviewById.get(object.object_id) ?? [])],
      warningCodes: [...(warningsById.get(object.object_id) ?? [])],
    });
  });
  return {
    schemaVersion: 'doccanvas-knowledge-library-projection-v1',
    source: {
      ref: pack.source.ref,
      packHash: pack.pack_hash,
      sourceHash: pack.source.sha256,
      generatedAt: pack.generated_at,
    },
    stats: {
      total: items.length,
      reviewRequired: items.filter(item => item.promotionState === 'human_review_required').length,
      warningCount: pack.qa.warnings.length,
      domainCount: new Set(items.flatMap(item => item.domainRefs)).size,
      lifecycleReview: items.filter(item => item.legacy.status !== 'active').length,
    },
    items,
  };
}

export function parseKnowledgeLibraryPack(raw: string): KnowledgeLibraryProjection {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    fail('KNOWLEDGE_PACK_JSON_INVALID', error instanceof Error ? error.message : String(error));
  }
  const parsed = CandidatePackSchema.safeParse(value);
  if (!parsed.success) {
    fail('KNOWLEDGE_PACK_SCHEMA_INVALID', parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  }
  verifyPack(parsed.data);
  return toLibraryProjection(parsed.data);
}

export function defaultKnowledgePackPath(): string {
  const configured = process.env.DOCCANVAS_KNOWLEDGE_PACK_PATH?.trim();
  if (configured) return resolve(configured);
  const packaged = resolve(process.cwd(), 'knowledge', PACK_FILENAME);
  if (existsSync(packaged)) return packaged;
  return resolve(process.cwd(), '..', 'product', 'knowledge-object-fixtures', PACK_FILENAME);
}

function unresolvedReviewReasons(reasons: readonly string[], object: KnowledgeObject): string[] {
  return reasons.filter(reason => !(reason === 'valid_from_unknown' && Boolean(object.valid_time?.from)));
}

function applyCandidateOverlay(
  projection: KnowledgeLibraryProjection,
  storeDir: string | undefined,
): KnowledgeLibraryProjection {
  if (!storeDir || !existsSync(storeDir)) return projection;
  const items = projection.items.map(item => {
    try {
      const current = readCurrentKnowledgeObject(storeDir, item.objectId);
      return projectKnowledgeObjectToLibraryItem(
        current.knowledgeObject,
        current.pointer.document_hash,
        {
          legacy: item.legacy,
          origin: item.origin,
          generationMode: item.generationMode,
          reviewReasons: unresolvedReviewReasons(item.reviewReasons, current.knowledgeObject),
          warningCodes: item.warningCodes,
        },
      );
    } catch (error) {
      if (error instanceof KnowledgeObjectStoreError && error.code === 'KNOWLEDGE_OBJECT_NOT_FOUND') return item;
      throw error;
    }
  });
  return { ...projection, items };
}

function mergeCapturedItems(
  projection: KnowledgeLibraryProjection,
  captureDir: string | undefined,
  enrichmentDir: string | undefined,
): KnowledgeLibraryProjection {
  if (!captureDir) return projection;
  const latestEnrichment = new Map<string, ReturnType<typeof listEnrichmentRecords>[number]>();
  for (const enrichment of enrichmentDir ? listEnrichmentRecords({ storeDir: enrichmentDir }) : []) {
    if (!latestEnrichment.has(enrichment.manifest.captureId)) latestEnrichment.set(enrichment.manifest.captureId, enrichment);
  }
  const captured = listCaptureRecords({ storeDir: captureDir }).map(record => {
    const enrichment = latestEnrichment.get(record.manifest.captureId);
    return projectKnowledgeObjectToLibraryItem(
      enrichment?.candidate ?? record.candidate,
      enrichment?.manifest.candidateHash ?? record.manifest.candidateHash,
      {
      origin: 'capture',
      generationMode: enrichment ? 'provider_structured' : 'extractive',
      legacy: {
        category: 'Captured evidence',
        status: 'candidate',
        recommendationRank: 'unranked',
        recommendationContext: enrichment
          ? 'Provider-structured candidate; requires independent human review.'
          : 'Deterministic extractive draft; requires human review.',
        version: null,
        stars: null,
        pricingModel: null,
      },
      reviewReasons: enrichment
        ? record.manifest.review.reasons.filter(reason => reason !== 'extractive_draft_requires_review').concat('provider_generated_draft_requires_review')
        : [...record.manifest.review.reasons],
      warningCodes: [...record.manifest.review.warningCodes],
      },
    );
  });
  if (captured.length === 0) return projection;
  const seedIds = new Set(projection.items.map(item => item.objectId));
  for (const item of captured) {
    if (seedIds.has(item.objectId)) fail('KNOWLEDGE_CAPTURE_OBJECT_ID_CONFLICT', item.objectId);
  }
  const items = [...captured, ...projection.items];
  return {
    ...projection,
    stats: {
      total: items.length,
      reviewRequired: items.filter(item => item.promotionState === 'human_review_required').length,
      warningCount: items.reduce((total, item) => total + item.warningCodes.length, 0),
      domainCount: new Set(items.flatMap(item => item.domainRefs)).size,
      lifecycleReview: items.filter(item => item.legacy.status !== 'active').length,
    },
    items,
  };
}

export function loadKnowledgeLibrary(
  packPath = defaultKnowledgePackPath(),
  storeDir?: string,
  captureDir?: string,
  enrichmentDir?: string,
): KnowledgeLibraryProjection {
  let raw: string;
  try {
    raw = readFileSync(packPath, 'utf8');
  } catch (error) {
    fail('KNOWLEDGE_PACK_READ_FAILED', `${packPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return applyCandidateOverlay(mergeCapturedItems(parseKnowledgeLibraryPack(raw), captureDir, enrichmentDir), storeDir);
}
