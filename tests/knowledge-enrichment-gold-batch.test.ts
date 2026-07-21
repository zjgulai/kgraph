import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { afterEach } from 'node:test';
import { NextRequest } from 'next/server';
import { createCapture } from '../lib/server/knowledge-capture-store';
import { runEnrichment, type EnrichmentExecutor } from '../lib/server/knowledge-enrichment-store';
import { readCurrentGoldAnnotation } from '../lib/server/knowledge-enrichment-eval';
import {
  GoldBatchError,
  buildHumanGoldTaskPack,
  prepareHumanGoldBatchImport,
} from '../lib/server/knowledge-enrichment-gold-batch';
import { POST as postGoldBatch } from '../app/api/knowledge/enrichments/gold/batch/route';

const originalCapturePath = process.env.DOCCANVAS_CAPTURE_STORE_PATH;
const originalEnrichmentPath = process.env.DOCCANVAS_ENRICHMENT_STORE_PATH;
const originalGoldPath = process.env.DOCCANVAS_ENRICHMENT_GOLD_PATH;
const originalWriteMode = process.env.DOCCANVAS_WRITE_MODE;
const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  if (originalCapturePath === undefined) delete process.env.DOCCANVAS_CAPTURE_STORE_PATH;
  else process.env.DOCCANVAS_CAPTURE_STORE_PATH = originalCapturePath;
  if (originalEnrichmentPath === undefined) delete process.env.DOCCANVAS_ENRICHMENT_STORE_PATH;
  else process.env.DOCCANVAS_ENRICHMENT_STORE_PATH = originalEnrichmentPath;
  if (originalGoldPath === undefined) delete process.env.DOCCANVAS_ENRICHMENT_GOLD_PATH;
  else process.env.DOCCANVAS_ENRICHMENT_GOLD_PATH = originalGoldPath;
  if (originalWriteMode === undefined) delete process.env.DOCCANVAS_WRITE_MODE;
  else process.env.DOCCANVAS_WRITE_MODE = originalWriteMode;
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = originalNodeEnv;
});

function root(): string {
  return mkdtempSync(join(tmpdir(), 'doccanvas-gold-batch-'));
}

function draft() {
  return {
    schemaVersion: 'doccanvas-enrichment-draft-v1' as const,
    title: 'MODEL_ONLY_SECRET_TITLE',
    summary: 'A provider-only formulation that must not enter the blank task pack.',
    keyPoints: [{ text: 'Measure recall.', evidenceLocators: [{ startLine: 5, endLine: 5 }] }],
    classification: {
      objectType: 'tip' as const,
      knowledgeForm: { primary: 'procedure' as const, subform: 'technique' as const },
      domainRefs: ['ai-product.evaluation.retrieval'],
      evidenceLocators: [{ startLine: 3, endLine: 5 }],
    },
    abstentions: [],
  };
}

async function fixture() {
  const dir = root();
  const capture = createCapture({
    storeDir: join(dir, 'captures'),
    actor: 'owner.test', mutationId: 'capture.gold-batch.001', capturedAt: '2026-07-19T08:00:00Z',
    request: {
      source: {
        kind: 'url', sourceUri: 'https://example.test/gold', mediaType: 'text/markdown',
        content: '# Retrieval evaluation\n\nUse a fixed human gold set.\n\n- Measure recall',
      },
      objectType: 'tip', knowledgeForm: { primary: 'procedure', subform: 'technique' },
      domainRef: 'ai-product.evaluation.retrieval',
    },
  });
  const executor: EnrichmentExecutor = {
    executionMode: 'fixture', providerId: 'fixture', modelId: 'fixture:v1',
    async execute() { return { output: draft(), usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } }; },
  };
  const enrichment = await runEnrichment({
    storeDir: join(dir, 'enrichments'), captureStoreDir: join(dir, 'captures'),
    captureId: capture.manifest.captureId, actor: 'owner.test', mutationId: 'enrichment.gold-batch.001',
    enrichedAt: '2026-07-19T08:10:00Z', promptVersion: 'knowledge-enrichment-v1', executor,
    policy: {
      enabled: true, allowedExecutionModes: ['fixture'], allowedProviders: ['fixture'], allowedModels: ['fixture:v1'],
      maxInputBytes: 64 * 1024, maxOutputTokens: 800, timeoutMs: 2_000,
    },
  });
  return { dir, capture, enrichment };
}

function annotation(captureId: string, sourceHash: string) {
  return {
    captureId,
    sourceHash,
    title: 'Human-reviewed retrieval evaluation',
    summary: 'Use a fixed human gold set before comparing retrieval changes.',
    keyPoints: ['Measure recall with an independently reviewed set.'],
    classification: {
      objectType: 'tip' as const,
      knowledgeForm: { primary: 'procedure' as const, subform: 'technique' as const },
      domainRefs: ['ai-product.evaluation.retrieval'],
      evidenceLocators: [{ startLine: 3, endLine: 5 }],
    },
  };
}

test('blank gold task pack contains immutable source but no model output', async () => {
  const value = await fixture();
  const pack = buildHumanGoldTaskPack({
    captures: [value.capture], enrichments: [value.enrichment], gold: [], generatedAt: '2026-07-19T08:30:00Z',
  });
  assert.equal(pack.tasks.length, 1);
  assert.equal(pack.tasks[0]?.annotation, null);
  assert.equal(pack.tasks[0]?.sourceHash, value.capture.manifest.sourceHash);
  assert.match(pack.tasks[0]?.sourceText ?? '', /fixed human gold set/u);
  assert.doesNotMatch(JSON.stringify(pack), /MODEL_ONLY_SECRET_TITLE|provider-only formulation|fixture:v1/u);
});

test('completed gold pack requires independent attestation, source integrity, locators and current-gold CAS', async () => {
  const value = await fixture();
  const blank = buildHumanGoldTaskPack({
    captures: [value.capture], enrichments: [value.enrichment], gold: [], generatedAt: '2026-07-19T08:30:00Z',
  });
  const completed = {
    ...blank,
    completion: {
      completedBy: 'reviewer.one', completedAt: '2026-07-19T09:00:00Z',
      independentSourceReview: true as const, modelOutputNotCopied: true as const,
    },
    tasks: blank.tasks.map(task => ({
      ...task,
      annotation: annotation(task.captureId, task.sourceHash),
    })),
  };
  const prepared = prepareHumanGoldBatchImport({ value: completed, captures: [value.capture], gold: [] });
  assert.equal(prepared.items.length, 1);
  assert.equal(prepared.items[0]?.annotation.title, 'Human-reviewed retrieval evaluation');
  assert.equal(prepared.items[0]?.baseRevision, undefined);
  assert.match(prepared.items[0]?.mutationId ?? '', /^gold\.batch\.gold-pack-/u);

  assert.throws(
    () => prepareHumanGoldBatchImport({
      value: { ...completed, completion: { ...completed.completion, modelOutputNotCopied: false } },
      captures: [value.capture], gold: [],
    }),
    (error: unknown) => error instanceof GoldBatchError && error.code === 'ENRICHMENT_GOLD_PACK_INVALID',
  );
  assert.throws(
    () => prepareHumanGoldBatchImport({
      value: { ...completed, tasks: completed.tasks.map(task => ({ ...task, sourceText: `${task.sourceText}\ntampered` })) },
      captures: [value.capture], gold: [],
    }),
    (error: unknown) => error instanceof GoldBatchError && error.code === 'ENRICHMENT_GOLD_PACK_HASH_MISMATCH',
  );
  assert.throws(
    () => prepareHumanGoldBatchImport({
      value: { ...completed, tasks: completed.tasks.map(task => ({
        ...task,
        annotation: { ...task.annotation, classification: { ...task.annotation.classification, evidenceLocators: [{ startLine: 99, endLine: 99 }] } },
      })) },
      captures: [value.capture], gold: [],
    }),
    (error: unknown) => error instanceof GoldBatchError && error.code === 'ENRICHMENT_GOLD_PACK_LOCATOR_INVALID',
  );
});

test('gold batch API exports blank work, imports once, and replays the same completed pack safely', async () => {
  const value = await fixture();
  process.env.DOCCANVAS_CAPTURE_STORE_PATH = join(value.dir, 'captures');
  process.env.DOCCANVAS_ENRICHMENT_STORE_PATH = join(value.dir, 'enrichments');
  process.env.DOCCANVAS_ENRICHMENT_GOLD_PATH = join(value.dir, 'gold');
  process.env.DOCCANVAS_WRITE_MODE = 'dev';
  mutableEnv.NODE_ENV = 'development';

  const exported = await postGoldBatch(new NextRequest('http://localhost/api/knowledge/enrichments/gold/batch', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'export' }),
  }));
  assert.equal(exported.status, 200);
  const blank = (await exported.json()).pack;
  assert.equal(blank.tasks[0].annotation, null);
  assert.doesNotMatch(JSON.stringify(blank), /MODEL_ONLY_SECRET_TITLE|fixture:v1/u);

  const completed = {
    ...blank,
    completion: {
      completedBy: 'reviewer.api', completedAt: '2026-07-19T09:30:00Z',
      independentSourceReview: true, modelOutputNotCopied: true,
    },
    tasks: blank.tasks.map((task: { captureId: string; sourceHash: string }) => ({
      ...task,
      annotation: annotation(task.captureId, task.sourceHash),
    })),
  };
  const request = () => new NextRequest('http://localhost/api/knowledge/enrichments/gold/batch', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'import', pack: completed }),
  });
  const imported = await postGoldBatch(request());
  assert.equal(imported.status, 200);
  assert.equal((await imported.json()).importedCount, 1);
  assert.equal(readCurrentGoldAnnotation({ storeDir: join(value.dir, 'gold'), captureId: value.capture.manifest.captureId }).revision, 1);

  const replayed = await postGoldBatch(request());
  assert.equal(replayed.status, 200);
  assert.equal((await replayed.json()).replaySafe, true);
  assert.equal(readCurrentGoldAnnotation({ storeDir: join(value.dir, 'gold'), captureId: value.capture.manifest.captureId }).revision, 1);

  process.env.DOCCANVAS_WRITE_MODE = 'readonly';
  mutableEnv.NODE_ENV = 'production';
  const denied = await postGoldBatch(request());
  assert.equal(denied.status, 403);
});
