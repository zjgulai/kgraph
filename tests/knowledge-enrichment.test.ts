import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { afterEach } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import {
  ENRICHMENT_OUTPUT_JSON_SCHEMA,
  EnrichmentDraftSchema,
  buildEnrichedKnowledgeObject,
  type EnrichmentDraft,
} from '../lib/knowledge/enrichment-contract';
import {
  EnrichmentStoreError,
  getEnrichmentRuntimeStatus,
  listEnrichmentRecords,
  readEnrichmentRecord,
  runEnrichment,
  type EnrichmentExecutor,
} from '../lib/server/knowledge-enrichment-store';
import { createCapture, type CaptureRequest } from '../lib/server/knowledge-capture-store';
import {
  GoldStoreError,
  evaluateEnrichmentResults,
  readCurrentGoldAnnotation,
  upsertGoldAnnotation,
} from '../lib/server/knowledge-enrichment-eval';
import { GET as getEnrichments, handleEnrichmentPost } from '../app/api/knowledge/enrichments/route';
import { POST as postGold } from '../app/api/knowledge/enrichments/gold/route';
import { EnrichmentWorkspace } from '../components/workspace/EnrichmentWorkspace';
import { loadKnowledgeLibrary } from '../lib/server/knowledge-library';
import { loadKnowledgeReviewObject } from '../lib/server/knowledge-review-store';

const packPath = resolve(import.meta.dirname, '../../product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json');

const originalMode = process.env.DOCCANVAS_ENRICHMENT_MODE;
const originalProvider = process.env.DOCCANVAS_ENRICHMENT_PROVIDER;
const originalModel = process.env.DOCCANVAS_ENRICHMENT_MODEL;
const originalWriteMode = process.env.DOCCANVAS_WRITE_MODE;
const originalNodeEnv = process.env.NODE_ENV;
const originalCapturePath = process.env.DOCCANVAS_CAPTURE_STORE_PATH;
const originalEnrichmentPath = process.env.DOCCANVAS_ENRICHMENT_STORE_PATH;
const originalGoldPath = process.env.DOCCANVAS_ENRICHMENT_GOLD_PATH;
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  if (originalMode === undefined) delete process.env.DOCCANVAS_ENRICHMENT_MODE;
  else process.env.DOCCANVAS_ENRICHMENT_MODE = originalMode;
  if (originalProvider === undefined) delete process.env.DOCCANVAS_ENRICHMENT_PROVIDER;
  else process.env.DOCCANVAS_ENRICHMENT_PROVIDER = originalProvider;
  if (originalModel === undefined) delete process.env.DOCCANVAS_ENRICHMENT_MODEL;
  else process.env.DOCCANVAS_ENRICHMENT_MODEL = originalModel;
  if (originalWriteMode === undefined) delete process.env.DOCCANVAS_WRITE_MODE;
  else process.env.DOCCANVAS_WRITE_MODE = originalWriteMode;
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = originalNodeEnv;
  if (originalCapturePath === undefined) delete process.env.DOCCANVAS_CAPTURE_STORE_PATH;
  else process.env.DOCCANVAS_CAPTURE_STORE_PATH = originalCapturePath;
  if (originalEnrichmentPath === undefined) delete process.env.DOCCANVAS_ENRICHMENT_STORE_PATH;
  else process.env.DOCCANVAS_ENRICHMENT_STORE_PATH = originalEnrichmentPath;
  if (originalGoldPath === undefined) delete process.env.DOCCANVAS_ENRICHMENT_GOLD_PATH;
  else process.env.DOCCANVAS_ENRICHMENT_GOLD_PATH = originalGoldPath;
});

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function request(): CaptureRequest {
  return {
    source: {
      kind: 'url',
      sourceUri: 'https://example.test/retrieval-evaluation',
      mediaType: 'text/markdown',
      content: '# Retrieval evaluation\n\nUse a fixed human golden set before changing chunking.\n\n- Measure recall\n- Inspect failures',
    },
    objectType: 'tip',
    knowledgeForm: { primary: 'procedure', subform: 'technique' },
    domainRef: 'ai-product.evaluation.retrieval',
  };
}

function draft(): EnrichmentDraft {
  return {
    schemaVersion: 'doccanvas-enrichment-draft-v1',
    title: 'Retrieval evaluation with human gold',
    summary: 'Use a fixed human golden set before changing retrieval chunking.',
    keyPoints: [
      { text: 'Measure recall.', evidenceLocators: [{ startLine: 5, endLine: 5 }] },
      { text: 'Inspect failures.', evidenceLocators: [{ startLine: 6, endLine: 6 }] },
    ],
    classification: {
      objectType: 'tip',
      knowledgeForm: { primary: 'procedure', subform: 'technique' },
      domainRefs: ['ai-product.evaluation.retrieval'],
      evidenceLocators: [{ startLine: 3, endLine: 6 }],
    },
    abstentions: [],
  };
}

function fixtureExecutor(output: unknown = draft()): EnrichmentExecutor {
  return {
    executionMode: 'fixture',
    providerId: 'fixture',
    modelId: 'fixture:v1',
    async execute() {
      return { output, usage: { inputTokens: 42, outputTokens: 24, totalTokens: 66 } };
    },
  };
}

function capture(root: string) {
  return createCapture({
    storeDir: join(root, 'captures'),
    request: request(),
    actor: 'owner.test',
    mutationId: 'capture.enrichment.001',
    capturedAt: '2026-07-19T04:00:00Z',
  });
}

test('enrichment schema is strict and enriched candidates stay human-review-only', () => {
  assert.equal(EnrichmentDraftSchema.safeParse({ ...draft(), reasoning: 'hidden chain of thought' }).success, false);
  assert.equal(EnrichmentDraftSchema.safeParse({ ...draft(), classification: { ...draft().classification, objectType: 'unknown' } }).success, false);

  const root = tempRoot('doccanvas-enrichment-contract-');
  const captured = capture(root);
  const candidate = buildEnrichedKnowledgeObject(captured, draft(), {
    enrichmentId: 'enrich-aaaaaaaaaaaaaaaaaaaaaaaa',
    enrichedAt: '2026-07-19T04:30:00Z',
    providerId: 'fixture',
    modelId: 'fixture:v1',
    promptVersion: 'knowledge-enrichment-v1',
  });
  assert.equal(candidate.object_id, captured.candidate.object_id);
  assert.equal(candidate.evidence_grade, 'llm_distilled_candidate');
  assert.equal(candidate.promotion_state, 'human_review_required');
  assert.equal(candidate.created_by.actor_type, 'agent');
  assert.match(candidate.body, /generation_mode: provider_structured/u);
  assert.doesNotMatch(candidate.body, /chain.of.thought|reasoning:/iu);
});

test('provider JSON Schema carries the same domain reference constraints as runtime validation', () => {
  const domainRefs = ENRICHMENT_OUTPUT_JSON_SCHEMA.properties.classification.properties.domainRefs as {
    uniqueItems?: boolean;
    items: { pattern?: string };
  };
  assert.equal(domainRefs.uniqueItems, true);
  assert.equal(domainRefs.items.pattern, '^[a-zA-Z0-9][a-zA-Z0-9._-]+$');
  assert.equal(EnrichmentDraftSchema.safeParse({
    ...draft(),
    classification: { ...draft().classification, domainRefs: ['产品/架构', 'ai product'] },
  }).success, false);
});

test('enrichment governance rejects source-language drift and domain taxonomy replacement before persistence', async () => {
  const chineseRoot = tempRoot('doccanvas-enrichment-language-governance-');
  const chineseCapture = createCapture({
    storeDir: join(chineseRoot, 'captures'),
    actor: 'owner.test',
    mutationId: 'capture.enrichment.language.001',
    capturedAt: '2026-07-20T01:00:00Z',
    request: {
      source: {
        kind: 'file', fileName: '验证方法.md', mediaType: 'text/markdown',
        content: '# 产品验证\n\n先确认真实用户是否需要这个想法，再投入完整开发。\n\n- 生成一页 PRD\n- 发布等待名单页面',
      },
      objectType: 'pattern',
      knowledgeForm: { primary: 'procedure', subform: 'workflow' },
      domainRef: 'ai-product.lifecycle.discovery',
    },
  });
  const englishDraft: EnrichmentDraft = {
    ...draft(),
    title: 'Validate demand before building',
    summary: 'Confirm real user demand before investing in full development.',
    keyPoints: [
      { text: 'Generate a one-page PRD.', evidenceLocators: [{ startLine: 5, endLine: 5 }] },
      { text: 'Publish a waitlist page.', evidenceLocators: [{ startLine: 6, endLine: 6 }] },
    ],
    classification: {
      ...draft().classification,
      objectType: 'pattern',
      knowledgeForm: { primary: 'procedure', subform: 'workflow' },
      domainRefs: ['ai-product.lifecycle.discovery'],
      evidenceLocators: [{ startLine: 1, endLine: 6 }],
    },
  };
  const baseOptions = {
    storeDir: join(chineseRoot, 'enrichments'),
    captureStoreDir: join(chineseRoot, 'captures'),
    captureId: chineseCapture.manifest.captureId,
    actor: 'owner.test',
    enrichedAt: '2026-07-20T01:05:00Z',
    promptVersion: 'knowledge-enrichment-v2',
    policy: {
      enabled: true,
      allowedExecutionModes: ['fixture'] as const,
      allowedProviders: ['fixture'],
      allowedModels: ['fixture:v1'],
      maxInputBytes: 64 * 1024,
      maxOutputTokens: 800,
      timeoutMs: 2_000,
    },
  };
  await assert.rejects(
    () => runEnrichment({ ...baseOptions, mutationId: 'enrichment.language.001', executor: fixtureExecutor(englishDraft) }),
    (error: unknown) => error instanceof EnrichmentStoreError
      && error.code === 'ENRICHMENT_OUTPUT_INVALID'
      && error.message.includes('ENRICHMENT_SOURCE_LANGUAGE_MISMATCH'),
  );
  assert.equal(listEnrichmentRecords({ storeDir: baseOptions.storeDir }).length, 0);

  const chineseDraft: EnrichmentDraft = {
    ...englishDraft,
    title: '开发前验证真实需求',
    summary: '先确认真实用户需要这个想法，再投入完整开发。',
    keyPoints: [
      { text: '生成一页 PRD。', evidenceLocators: [{ startLine: 5, endLine: 5 }] },
      { text: '发布等待名单页面。', evidenceLocators: [{ startLine: 6, endLine: 6 }] },
    ],
    classification: { ...englishDraft.classification, domainRefs: ['product-management'] },
  };
  await assert.rejects(
    () => runEnrichment({ ...baseOptions, mutationId: 'enrichment.domain.001', executor: fixtureExecutor(chineseDraft) }),
    (error: unknown) => error instanceof EnrichmentStoreError
      && error.code === 'ENRICHMENT_OUTPUT_INVALID'
      && error.message.includes('ENRICHMENT_DOMAIN_TAXONOMY_MISMATCH'),
  );
  assert.equal(listEnrichmentRecords({ storeDir: baseOptions.storeDir }).length, 0);
});

test('executor receives deterministic language and exact stable-domain governance in its hashed request', async () => {
  const root = tempRoot('doccanvas-enrichment-governance-input-');
  const captured = capture(root);
  const observed: Record<string, unknown>[] = [];
  const executor: EnrichmentExecutor = {
    ...fixtureExecutor(),
    async execute(input) {
      observed.push(input as unknown as Record<string, unknown>);
      return { output: draft(), usage: { inputTokens: 42, outputTokens: 24, totalTokens: 66 } };
    },
  };
  const created = await runEnrichment({
    storeDir: join(root, 'enrichments'), captureStoreDir: join(root, 'captures'),
    captureId: captured.manifest.captureId, actor: 'owner.test', mutationId: 'enrichment.governance.input.001',
    enrichedAt: '2026-07-20T01:10:00Z', promptVersion: 'knowledge-enrichment-v2', executor,
    policy: {
      enabled: true, allowedExecutionModes: ['fixture'], allowedProviders: ['fixture'], allowedModels: ['fixture:v1'],
      maxInputBytes: 64 * 1024, maxOutputTokens: 800, timeoutMs: 2_000,
    },
  });
  const observedInput = observed[0]!;
  assert.equal(observedInput.sourceLanguage, 'en');
  assert.deepEqual(observedInput.allowedDomainRefs, ['ai-product.evaluation.retrieval']);
  const schema = observedInput.outputSchema as { properties?: { classification?: { properties?: { domainRefs?: { minItems?: number; maxItems?: number; items?: { enum?: string[] } } } } } };
  assert.equal(schema.properties?.classification?.properties?.domainRefs?.minItems, 1);
  assert.equal(schema.properties?.classification?.properties?.domainRefs?.maxItems, 1);
  assert.deepEqual(schema.properties?.classification?.properties?.domainRefs?.items?.enum, ['ai-product.evaluation.retrieval']);
  const persistedRequest = JSON.parse(readFileSync(join(created.directory, 'request.json'), 'utf8')) as { governance?: unknown };
  assert.deepEqual(persistedRequest.governance, {
    sourceLanguage: 'en',
    allowedDomainRefs: ['ai-product.evaluation.retrieval'],
  });
});

test('gateway is disabled by default and fixture execution is idempotent, bounded and tamper-evident', async () => {
  delete process.env.DOCCANVAS_ENRICHMENT_MODE;
  assert.deepEqual(getEnrichmentRuntimeStatus(), {
    mode: 'disabled', providerId: null, modelId: null, ready: false, reason: 'disabled_by_policy',
  });

  const root = tempRoot('doccanvas-enrichment-store-');
  const captured = capture(root);
  let calls = 0;
  const executor = fixtureExecutor();
  const countingExecutor: EnrichmentExecutor = { ...executor, execute: async input => { calls += 1; return executor.execute(input); } };
  const options = {
    storeDir: join(root, 'enrichments'),
    captureStoreDir: join(root, 'captures'),
    captureId: captured.manifest.captureId,
    actor: 'owner.test',
    mutationId: 'enrichment.fixture.001',
    enrichedAt: '2026-07-19T04:30:00Z',
    promptVersion: 'knowledge-enrichment-v1',
    executor: countingExecutor,
    policy: {
      enabled: true,
      allowedExecutionModes: ['fixture'] as const,
      allowedProviders: ['fixture'],
      allowedModels: ['fixture:v1'],
      maxInputBytes: 64 * 1024,
      maxOutputTokens: 800,
      timeoutMs: 2_000,
    },
  };
  const created = await runEnrichment(options);
  const replay = await runEnrichment({ ...options, enrichedAt: '2026-07-19T04:31:00Z' });
  assert.equal(calls, 1);
  assert.equal(created.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(created.manifest.providerCall, false, 'fixture proof is not a provider call');
  assert.equal(created.manifest.executionMode, 'fixture');
  assert.equal(listEnrichmentRecords({ storeDir: options.storeDir }).length, 1);

  await assert.rejects(
    () => runEnrichment({
      ...options,
      mutationId: 'enrichment.fixture.002',
      promptVersion: 'knowledge-enrichment-v2',
      executor: fixtureExecutor({ ...draft(), reasoning: 'forbidden' }),
    }),
    (error: unknown) => error instanceof EnrichmentStoreError && error.code === 'ENRICHMENT_OUTPUT_INVALID',
  );
  assert.equal(listEnrichmentRecords({ storeDir: options.storeDir }).length, 1, 'invalid output must not create a record');

  writeFileSync(join(created.directory, 'draft.json'), '{}\n', 'utf8');
  assert.throws(
    () => readEnrichmentRecord({ storeDir: options.storeDir, enrichmentId: created.manifest.enrichmentId }),
    (error: unknown) => error instanceof EnrichmentStoreError && error.code === 'ENRICHMENT_DRAFT_HASH_MISMATCH',
  );
});

test('human gold uses immutable revisions and CAS, then evaluation reports insufficient data or a reproducible pass', async () => {
  const root = tempRoot('doccanvas-enrichment-eval-');
  const captured = capture(root);
  const enrichment = await runEnrichment({
    storeDir: join(root, 'enrichments'), captureStoreDir: join(root, 'captures'),
    captureId: captured.manifest.captureId, actor: 'owner.test', mutationId: 'enrichment.eval.001',
    enrichedAt: '2026-07-19T04:30:00Z', promptVersion: 'knowledge-enrichment-v1', executor: fixtureExecutor(),
    policy: {
      enabled: true, allowedExecutionModes: ['fixture'], allowedProviders: ['fixture'], allowedModels: ['fixture:v1'],
      maxInputBytes: 64 * 1024, maxOutputTokens: 800, timeoutMs: 2_000,
    },
  });
  const goldDir = join(root, 'gold');
  const annotation = {
    captureId: captured.manifest.captureId,
    sourceHash: captured.manifest.sourceHash,
    title: draft().title,
    summary: draft().summary,
    keyPoints: draft().keyPoints.map(point => point.text),
    classification: draft().classification,
  };
  const first = upsertGoldAnnotation({
    storeDir: goldDir, annotation, actor: 'owner.test', mutationId: 'gold.eval.001', annotatedAt: '2026-07-19T05:00:00Z',
  });
  assert.equal(first.revision, 1);
  assert.equal(readCurrentGoldAnnotation({ storeDir: goldDir, captureId: captured.manifest.captureId }).revision, 1);
  assert.throws(() => upsertGoldAnnotation({
    storeDir: goldDir, annotation: { ...annotation, title: 'stale update' }, actor: 'owner.test', mutationId: 'gold.eval.002',
    annotatedAt: '2026-07-19T05:05:00Z', baseRevision: 0, baseAnnotationHash: first.annotationHash,
  }), (error: unknown) => error instanceof GoldStoreError && error.code === 'ENRICHMENT_GOLD_CAS_CONFLICT');
  const second = upsertGoldAnnotation({
    storeDir: goldDir,
    annotation: { ...annotation, title: 'Retrieval evaluation with reviewed human gold' },
    actor: 'owner.test',
    mutationId: 'gold.eval.002',
    annotatedAt: '2026-07-19T05:10:00Z',
    baseRevision: first.revision,
    baseAnnotationHash: first.annotationHash,
  });
  assert.equal(second.revision, 2);
  assert.equal(JSON.parse(readFileSync(join(goldDir, captured.manifest.captureId, 'revisions', '000001.json'), 'utf8')).annotation.title, annotation.title);
  const lockPath = join(goldDir, `.${captured.manifest.captureId}.lock`);
  mkdirSync(lockPath);
  assert.throws(() => upsertGoldAnnotation({
    storeDir: goldDir,
    annotation: { ...annotation, title: 'concurrent write' },
    actor: 'owner.test',
    mutationId: 'gold.eval.003',
    annotatedAt: '2026-07-19T05:11:00Z',
    baseRevision: second.revision,
    baseAnnotationHash: second.annotationHash,
  }), (error: unknown) => error instanceof GoldStoreError && error.code === 'ENRICHMENT_GOLD_WRITE_BUSY');
  rmSync(lockPath, { recursive: true });

  const insufficient = evaluateEnrichmentResults({ enrichments: [enrichment], gold: [first], minimumSamples: 20 });
  assert.equal(insufficient.status, 'insufficient_data');
  assert.equal(insufficient.sampleCount, 1);
  const ready = evaluateEnrichmentResults({ enrichments: [enrichment], gold: [first], minimumSamples: 1 });
  assert.equal(ready.status, 'passed');
  assert.equal(ready.policy.minimumClassificationExactMatch, 0.9);
  assert.equal(ready.gates.length, 6);
  assert.equal(ready.gates.every(gate => gate.passed), true);
  assert.equal(ready.metrics.classificationExactMatch, 1);
  assert.equal(ready.metrics.titleTokenF1, 1);
  assert.equal(ready.metrics.summaryTokenF1, 1);
  assert.equal(ready.metrics.keyPointCoverage, 1);
  const schemaFailed = evaluateEnrichmentResults({ enrichments: [enrichment], gold: [first], minimumSamples: 1, schemaFailureCount: 1 });
  assert.equal(schemaFailed.status, 'failed');
  assert.equal(schemaFailed.gates.find(gate => gate.metric === 'schemaFailureRate')?.passed, false);
  assert.equal(existsSync(goldDir), true);
  assert.match(readFileSync(join(goldDir, captured.manifest.captureId, 'journal.jsonl'), 'utf8'), /gold\.eval\.001/u);
});

test('Enrichment API keeps readonly/default-disabled boundaries and fixture injection is explicit', async () => {
  const root = tempRoot('doccanvas-enrichment-api-');
  const captured = capture(root);
  process.env.DOCCANVAS_CAPTURE_STORE_PATH = join(root, 'captures');
  process.env.DOCCANVAS_ENRICHMENT_STORE_PATH = join(root, 'enrichments');
  process.env.DOCCANVAS_ENRICHMENT_GOLD_PATH = join(root, 'gold');
  process.env.DOCCANVAS_WRITE_MODE = 'readonly';
  mutableEnv.NODE_ENV = 'production';
  const readonly = await handleEnrichmentPost(new NextRequest('https://example.test/api/knowledge/enrichments', {
    method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' },
    body: JSON.stringify({ captureId: captured.manifest.captureId }),
  }));
  assert.equal(readonly.status, 403);

  delete process.env.DOCCANVAS_WRITE_MODE;
  mutableEnv.NODE_ENV = 'development';
  const disabled = await handleEnrichmentPost(new NextRequest('http://localhost/api/knowledge/enrichments', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ captureId: captured.manifest.captureId }),
  }));
  assert.equal(disabled.status, 409);
  assert.equal((await disabled.json()).code, 'ENRICHMENT_DISABLED_BY_POLICY');

  process.env.DOCCANVAS_ENRICHMENT_MODE = 'provider';
  process.env.DOCCANVAS_ENRICHMENT_PROVIDER = 'openai';
  process.env.DOCCANVAS_ENRICHMENT_MODEL = 'model-explicitly-authorized';
  process.env.DOCCANVAS_ENRICHMENT_JOB_POLICY_FILE = join(root, 'missing-policy.json');
  process.env.DOCCANVAS_ENRICHMENT_API_KEY_FILE = join(root, 'missing-api-key');
  process.env.DOCCANVAS_ENRICHMENT_LEDGER_PATH = join(root, 'provider-ledger.jsonl');
  const missingStageGate = await handleEnrichmentPost(new NextRequest('http://localhost/api/knowledge/enrichments', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ captureId: captured.manifest.captureId }),
  }));
  assert.equal(missingStageGate.status, 503);
  assert.equal((await missingStageGate.json()).code, 'ENRICHMENT_PILOT_STAGE_CONFIGURATION_INCOMPLETE');
  delete process.env.DOCCANVAS_ENRICHMENT_MODE;
  delete process.env.DOCCANVAS_ENRICHMENT_PROVIDER;
  delete process.env.DOCCANVAS_ENRICHMENT_MODEL;
  delete process.env.DOCCANVAS_ENRICHMENT_JOB_POLICY_FILE;
  delete process.env.DOCCANVAS_ENRICHMENT_API_KEY_FILE;
  delete process.env.DOCCANVAS_ENRICHMENT_LEDGER_PATH;

  const injected = await handleEnrichmentPost(new NextRequest('http://localhost/api/knowledge/enrichments', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ captureId: captured.manifest.captureId, mutationId: 'enrichment.api.fixture.001' }),
  }), {
    executor: fixtureExecutor(),
    policy: {
      enabled: true, allowedExecutionModes: ['fixture'], allowedProviders: ['fixture'], allowedModels: ['fixture:v1'],
      maxInputBytes: 64 * 1024, maxOutputTokens: 800, timeoutMs: 2_000,
    },
    storeDir: join(root, 'enrichments'), captureStoreDir: join(root, 'captures'),
    promptVersion: 'knowledge-enrichment-v1', enrichedAt: '2026-07-19T04:30:00Z',
  });
  assert.equal(injected.status, 201);
  const injectedPayload = await injected.json();
  assert.equal(injectedPayload.enrichment.providerCall, false);
  assert.equal(injectedPayload.enrichment.executionMode, 'fixture');
  const library = loadKnowledgeLibrary(packPath, join(root, 'knowledge'), join(root, 'captures'), join(root, 'enrichments'));
  const enrichedItem = library.items.find(item => item.objectId === captured.candidate.object_id);
  assert.equal(enrichedItem?.generationMode, 'provider_structured');
  assert.equal(enrichedItem?.evidenceGrade, 'llm_distilled_candidate');
  assert.equal(enrichedItem?.title, draft().title);
  const review = loadKnowledgeReviewObject({
    objectId: captured.candidate.object_id,
    packPath,
    storeDir: join(root, 'knowledge'),
    captureDir: join(root, 'captures'),
    enrichmentDir: join(root, 'enrichments'),
  });
  assert.equal(review.object.title, draft().title);
  assert.equal(review.reviewReasons.includes('provider_generated_draft_requires_review'), true);
  const listed = await getEnrichments();
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).enrichments.length, 1);

  const goldResponse = await postGold(new NextRequest('http://localhost/api/knowledge/enrichments/gold', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      annotation: {
        captureId: captured.manifest.captureId,
        sourceHash: captured.manifest.sourceHash,
        title: draft().title,
        summary: draft().summary,
        keyPoints: draft().keyPoints.map(point => point.text),
        classification: draft().classification,
      },
      mutationId: 'gold.api.001',
    }),
  }));
  assert.equal(goldResponse.status, 201);
  assert.equal((await goldResponse.json()).gold.revision, 1);
});

test('Enrichment Workspace states are transparent and mobile write controls are CSS/JS gated', async () => {
  const emptyEvaluation = evaluateEnrichmentResults({ enrichments: [], gold: [], minimumSamples: 20 });
  const html = renderToStaticMarkup(React.createElement(EnrichmentWorkspace, {
    captures: [],
    initialEnrichments: [],
    initialGold: [],
    runtime: getEnrichmentRuntimeStatus(),
    evaluation: emptyEvaluation,
    writePolicy: { mode: 'readonly', writable: false, tokenRequired: false },
  }));
  assert.match(html, /AI Enrichment/u);
  assert.match(html, /Provider disabled/u);
  assert.match(html, /insufficient_data/u);
  assert.match(html, /PILOT CONTROL PLANE|not_configured|本视图只做预检/u);
  assert.doesNotMatch(html, /保存 Human-gold|Provider ready/u);

  const source = readFileSync(join(import.meta.dirname, '../components/workspace/EnrichmentWorkspace.tsx'), 'utf8');
  const routeSource = readFileSync(join(import.meta.dirname, '../app/api/knowledge/enrichments/route.ts'), 'utf8');
  const css = readFileSync(join(import.meta.dirname, '../app/globals.css'), 'utf8');
  assert.match(source, /useMobileEnrichment|INDEPENDENT HUMAN ANNOTATION|模型输出没有被自动当作 gold|导出空白任务包|导入独立标注|PILOT CONTROL PLANE|导出授权请求/u);
  assert.match(source, /\/api\/knowledge\/enrichments\/gold\/batch/u);
  assert.match(source, /\/api\/knowledge\/enrichments\/pilot\/authorization-request|authorizationGranted|不创建 receipt/u);
  assert.match(source, /runtime\.ready && pilotReadiness\.executionAllowed|authorizedCaptureIds/u);
  assert.match(routeSource, /reservationGateFactory: createConfiguredPilotReservationGate|getConfiguredPilotReadiness/u);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.enrichment-eval__batch,[\s\S]*\.enrichment-gold-form,[\s\S]*display: none/u);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.enrichment-pilot__request-action,[\s\S]*\.enrichment-pilot__request \{ display: none; \}/u);
  assert.doesNotMatch(source, /fetch\(['"]https?:|chain.of.thought|reasoning:/iu);
});
