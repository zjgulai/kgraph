import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { afterEach } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import {
  CaptureStoreError,
  createCapture,
  listCaptureRecords,
  readCaptureRecord,
  summarizeCaptureRecord,
  type CaptureRequest,
} from '../lib/server/knowledge-capture-store';
import { compileExtractiveDraft } from '../lib/knowledge/extractive-draft';
import { CaptureWorkspace } from '../components/workspace/CaptureWorkspace';
import { GET, POST } from '../app/api/knowledge/captures/route';
import { loadKnowledgeLibrary } from '../lib/server/knowledge-library';
import {
  knowledgeReviewPatchFromObject,
  loadKnowledgeReviewObject,
  updateKnowledgeReviewObject,
} from '../lib/server/knowledge-review-store';
import { buildKnowledgeCanvasProjection } from '../lib/knowledge/canvas-projection';

const root = resolve(import.meta.dirname, '..');
const packPath = resolve(root, '../product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json');
const original = {
  root: process.env.DOCCANVAS_ROOT,
  capture: process.env.DOCCANVAS_CAPTURE_STORE_PATH,
  knowledge: process.env.DOCCANVAS_KNOWLEDGE_STORE_PATH,
  pack: process.env.DOCCANVAS_KNOWLEDGE_PACK_PATH,
  mode: process.env.DOCCANVAS_WRITE_MODE,
  nodeEnv: process.env.NODE_ENV,
  token: process.env.DOCCANVAS_ADMIN_TOKEN,
  secret: process.env.DOCCANVAS_SESSION_SECRET,
};
const mutableEnv = process.env as Record<string, string | undefined>;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('DOCCANVAS_ROOT', original.root);
  restore('DOCCANVAS_CAPTURE_STORE_PATH', original.capture);
  restore('DOCCANVAS_KNOWLEDGE_STORE_PATH', original.knowledge);
  restore('DOCCANVAS_KNOWLEDGE_PACK_PATH', original.pack);
  restore('DOCCANVAS_WRITE_MODE', original.mode);
  restore('DOCCANVAS_ADMIN_TOKEN', original.token);
  restore('DOCCANVAS_SESSION_SECRET', original.secret);
  restore('NODE_ENV', original.nodeEnv);
});

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function urlRequest(content = '# Retrieval evaluation\n\nUse a fixed golden set before changing chunking.\n\n- Measure recall\n- Inspect failures'): CaptureRequest {
  return {
    source: {
      kind: 'url',
      sourceUri: 'https://example.test/retrieval-evaluation',
      mediaType: 'text/markdown',
      content,
    },
    title: '',
    objectType: 'tip',
    knowledgeForm: { primary: 'procedure', subform: 'technique' },
    domainRef: 'ai-product.evaluation.retrieval',
  };
}

function captureError(code: string) {
  return (error: unknown) => error instanceof CaptureStoreError && error.code === code;
}

test('extractive compiler and capture store create a deterministic provenance-bound candidate', () => {
  const storeDir = join(tempRoot('doccanvas-capture-'), 'captures');
  assert.deepEqual(listCaptureRecords({ storeDir }), []);
  assert.equal(existsSync(storeDir), false, 'read must not create the capture root');

  const firstDraft = compileExtractiveDraft(urlRequest(), {
    capturedAt: '2026-07-19T01:00:00Z',
    sourceHash: 'a'.repeat(64),
    sourceLocator: 'capture/test/source.md',
    captureId: 'capture-test',
  });
  const secondDraft = compileExtractiveDraft(urlRequest(), {
    capturedAt: '2026-07-19T01:00:00Z',
    sourceHash: 'a'.repeat(64),
    sourceLocator: 'capture/test/source.md',
    captureId: 'capture-test',
  });
  assert.deepEqual(firstDraft, secondDraft);
  assert.equal(firstDraft.promotion_state, 'human_review_required');
  assert.equal(firstDraft.evidence_grade, 'source_registered');
  assert.match(firstDraft.body, /generation_mode: extractive/u);
  assert.match(firstDraft.body, /provider_call: false/u);

  const created = createCapture({
    storeDir,
    request: urlRequest(),
    actor: 'owner.test',
    mutationId: 'capture.retrieval.001',
    capturedAt: '2026-07-19T01:00:00Z',
  });
  const replay = createCapture({
    storeDir,
    request: urlRequest(),
    actor: 'owner.test',
    mutationId: 'capture.retrieval.001',
    capturedAt: '2026-07-19T01:05:00Z',
  });
  assert.equal(created.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.manifest.captureId, created.manifest.captureId);
  assert.equal(created.manifest.generation.mode, 'extractive');
  assert.equal(created.manifest.generation.providerCall, false);
  assert.equal(created.candidate.source_refs[0]?.snapshot_hash, created.manifest.sourceHash.slice(7));
  assert.equal(listCaptureRecords({ storeDir }).length, 1);
  assert.deepEqual(summarizeCaptureRecord(created).reviewReasons, [
    'capture_source_not_fetched',
    'capture_source_requires_review',
    'extractive_draft_requires_review',
  ]);
});

test('capture store rejects unsafe inputs, mutation drift and source tampering', () => {
  const storeDir = join(tempRoot('doccanvas-capture-bad-'), 'captures');
  assert.throws(() => createCapture({
    storeDir,
    request: {
      ...urlRequest(),
      source: { kind: 'url', sourceUri: 'file:///etc/passwd', mediaType: 'text/markdown', content: '# unsafe' },
    },
    actor: 'owner.test', mutationId: 'capture.bad.scheme', capturedAt: '2026-07-19T01:00:00Z',
  }), captureError('CAPTURE_SOURCE_URI_INVALID'));
  assert.equal(existsSync(storeDir), false, 'invalid input must not create the store root');

  const fileRequest: CaptureRequest = {
    ...urlRequest(),
    source: { kind: 'file', fileName: '../notes.md', mediaType: 'text/plain', content: 'unsafe' },
  };
  assert.throws(() => createCapture({
    storeDir, request: fileRequest, actor: 'owner.test', mutationId: 'capture.bad.file', capturedAt: '2026-07-19T01:00:00Z',
  }), captureError('CAPTURE_FILE_INVALID'));

  assert.throws(() => createCapture({
    storeDir,
    request: {
      ...urlRequest(),
      source: { kind: 'file', fileName: 'notes.md', mediaType: 'text/plain', content: 'mime drift' },
    },
    actor: 'owner.test', mutationId: 'capture.bad.mime', capturedAt: '2026-07-19T01:00:00Z',
  }), captureError('CAPTURE_MIME_INVALID'));
  assert.throws(() => createCapture({
    storeDir,
    request: urlRequest('binary\0payload'),
    actor: 'owner.test', mutationId: 'capture.bad.nul', capturedAt: '2026-07-19T01:00:00Z',
  }), captureError('CAPTURE_CONTENT_INVALID'));

  const created = createCapture({
    storeDir, request: urlRequest(), actor: 'owner.test', mutationId: 'capture.stable', capturedAt: '2026-07-19T01:00:00Z',
  });
  assert.throws(() => createCapture({
    storeDir,
    request: urlRequest('# changed'),
    actor: 'owner.test', mutationId: 'capture.stable', capturedAt: '2026-07-19T01:01:00Z',
  }), captureError('CAPTURE_MUTATION_CONFLICT'));

  writeFileSync(created.sourcePath, '# tampered\n', 'utf8');
  assert.throws(
    () => readCaptureRecord({ storeDir, captureId: created.manifest.captureId }),
    captureError('CAPTURE_SOURCE_HASH_MISMATCH'),
  );

  const manifestStore = join(tempRoot('doccanvas-capture-manifest-'), 'captures');
  const manifestRecord = createCapture({
    storeDir: manifestStore, request: urlRequest(), actor: 'owner.test', mutationId: 'capture.manifest', capturedAt: '2026-07-19T01:00:00Z',
  });
  const manifestPath = join(manifestRecord.directory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { generation: { providerCall: boolean } };
  manifest.generation.providerCall = true;
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');
  assert.throws(
    () => readCaptureRecord({ storeDir: manifestStore, captureId: manifestRecord.manifest.captureId }),
    captureError('CAPTURE_MANIFEST_INVALID'),
  );

  const symlinkBase = tempRoot('doccanvas-capture-symlink-');
  const realStore = join(symlinkBase, 'real');
  const linkedStore = join(symlinkBase, 'linked');
  mkdirSync(realStore);
  symlinkSync(realStore, linkedStore);
  assert.throws(() => listCaptureRecords({ storeDir: linkedStore }), captureError('CAPTURE_STORE_SYMLINK_REJECTED'));
});

test('captured candidates join Library and Review without modifying the immutable pack', () => {
  const dataRoot = tempRoot('doccanvas-capture-read-model-');
  const captureDir = join(dataRoot, 'captures');
  const knowledgeStoreDir = join(dataRoot, 'knowledge-candidates');
  const packBefore = readFileSync(packPath);
  const created = createCapture({
    storeDir: captureDir,
    request: urlRequest(),
    actor: 'owner.test', mutationId: 'capture.library.001', capturedAt: '2026-07-19T01:00:00Z',
  });

  const library = loadKnowledgeLibrary(packPath, knowledgeStoreDir, captureDir);
  assert.equal(library.items.length, 38);
  assert.equal(library.items[0]?.objectId, created.candidate.object_id);
  assert.equal(library.items[0]?.origin, 'capture');
  assert.equal(library.items[0]?.generationMode, 'extractive');
  const canvas = buildKnowledgeCanvasProjection(library.items);
  assert.equal(canvas.objects.length, 38);
  assert.equal(canvas.objects.some(item => item.objectId === created.candidate.object_id), true);

  const review = loadKnowledgeReviewObject({
    objectId: created.candidate.object_id,
    packPath,
    storeDir: knowledgeStoreDir,
    captureDir,
  });
  assert.equal(review.initialized, false);
  assert.equal(review.reviewReasons.includes('extractive_draft_requires_review'), true);
  const patch = knowledgeReviewPatchFromObject(review.object);
  patch.title = 'Retrieval evaluation · reviewed';
  const updated = updateKnowledgeReviewObject({
    objectId: review.object.object_id,
    baseRevision: review.revision,
    baseObjectHash: review.objectHash,
    patch,
    actor: 'owner.test', mutationId: 'capture.library.review.002', mutatedAt: '2026-07-19T02:00:00Z',
    packPath, storeDir: knowledgeStoreDir, captureDir,
  });
  assert.equal(updated.revision, 2);
  assert.equal(loadKnowledgeLibrary(packPath, knowledgeStoreDir, captureDir).items[0]?.title, 'Retrieval evaluation · reviewed');
  assert.deepEqual(readFileSync(packPath), packBefore);
});

test('capture API preserves readonly and Owner boundaries without provider calls', async () => {
  const dataRoot = tempRoot('doccanvas-capture-api-');
  process.env.DOCCANVAS_CAPTURE_STORE_PATH = join(dataRoot, 'captures');
  process.env.DOCCANVAS_KNOWLEDGE_STORE_PATH = join(dataRoot, 'knowledge-candidates');
  process.env.DOCCANVAS_KNOWLEDGE_PACK_PATH = packPath;
  process.env.DOCCANVAS_WRITE_MODE = 'readonly';
  mutableEnv.NODE_ENV = 'production';
  const readonly = await POST(new NextRequest('https://example.test/api/knowledge/captures', {
    method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' }, body: JSON.stringify(urlRequest()),
  }));
  assert.equal(readonly.status, 403);

  process.env.DOCCANVAS_WRITE_MODE = 'owner';
  process.env.DOCCANVAS_ADMIN_TOKEN = 'capture-owner-token';
  process.env.DOCCANVAS_SESSION_SECRET = 'capture-owner-session-secret';
  const locked = await POST(new NextRequest('https://example.test/api/knowledge/captures', {
    method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' }, body: JSON.stringify(urlRequest()),
  }));
  assert.equal(locked.status, 401);

  delete process.env.DOCCANVAS_WRITE_MODE;
  mutableEnv.NODE_ENV = 'development';
  const created = await POST(new NextRequest('http://localhost/api/knowledge/captures', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      ...urlRequest(), mutationId: 'capture.api.001',
    }),
  }));
  assert.equal(created.status, 201);
  const payload = await created.json();
  assert.equal(payload.capture.generationMode, 'extractive');
  assert.equal(payload.capture.providerCall, false);
  const listed = await GET();
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).captures.length, 1);
});

test('Capture Workspace is an evidence intake desk and mobile has no write controls', () => {
  const readonlyHtml = renderToStaticMarkup(React.createElement(CaptureWorkspace, {
    captures: [],
    writePolicy: { mode: 'readonly', writable: false, tokenRequired: false },
    onCandidateCreated: () => undefined,
  }));
  assert.match(readonlyHtml, /Capture Inbox/u);
  assert.match(readonlyHtml, /Provider disabled/u);
  assert.doesNotMatch(readonlyHtml, /上传并生成|<form/u);

  const source = readFileSync(resolve(root, 'components/workspace/CaptureWorkspace.tsx'), 'utf8');
  assert.match(source, /isMobile/u);
  assert.match(source, /OwnerSessionControl/u);
  assert.match(source, /accept="\.md,\.markdown,\.txt"/u);
  assert.match(source, /parseCaptureDraft/u);
  assert.match(source, /localStorage\.setItem\(CAPTURE_DRAFT_STORAGE_KEY/u);
  assert.match(source, /sourceDigest/u);
  assert.match(source, /duplicateCaptures/u);
  assert.match(source, /来源快照预览/u);
  assert.doesNotMatch(source, /canonical|provider_call:\s*true|fetch\(['"]https?:/u);
  const routeSource = readFileSync(resolve(root, 'app/api/knowledge/captures/route.ts'), 'utf8');
  assert.doesNotMatch(routeSource, /fetch\(|openai|anthropic|gemini/u);
});
