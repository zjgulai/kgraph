import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test, { afterEach } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import {
  KnowledgeReviewError,
  knowledgeReviewPatchFromObject,
  listKnowledgeReviewQueue,
  listKnowledgeReviewRevisions,
  loadKnowledgeReviewObject,
  updateKnowledgeReviewObject,
} from '../lib/server/knowledge-review-store';
import { KnowledgeReviewWorkspace } from '../components/workspace/KnowledgeReviewWorkspace';
import { GET, PATCH } from '../app/api/knowledge/review/[objectId]/route';
import type { KnowledgeLibraryProjection } from '../lib/knowledge/library-types';
import { loadKnowledgeLibrary } from '../lib/server/knowledge-library';

const root = resolve(import.meta.dirname, '..');
const packPath = resolve(root, '../product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json');
const original = {
  root: process.env.DOCCANVAS_ROOT,
  store: process.env.DOCCANVAS_KNOWLEDGE_STORE_PATH,
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
  restore('DOCCANVAS_KNOWLEDGE_STORE_PATH', original.store);
  restore('DOCCANVAS_KNOWLEDGE_PACK_PATH', original.pack);
  restore('DOCCANVAS_WRITE_MODE', original.mode);
  restore('DOCCANVAS_ADMIN_TOKEN', original.token);
  restore('DOCCANVAS_SESSION_SECRET', original.secret);
  if (original.nodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = original.nodeEnv;
});

function tempStore(): string {
  return join(mkdtempSync(join(tmpdir(), 'doccanvas-review-')), 'knowledge-candidates');
}

function context(objectId: string) {
  return { params: Promise.resolve({ objectId }) };
}

function reviewError(code: string) {
  return (error: unknown) => error instanceof KnowledgeReviewError && error.code === code;
}

test('review read uses the immutable seed without creating writable state', () => {
  const storeDir = tempStore();
  const loaded = loadKnowledgeReviewObject({
    objectId: 'knowledge.mcp_servers.context7',
    packPath,
    storeDir,
  });

  assert.equal(loaded.revision, 1);
  assert.equal(loaded.initialized, false);
  assert.equal(loaded.object.title, 'Context7');
  assert.equal(loaded.reviewReasons.includes('valid_from_unknown'), true);
  assert.equal(existsSync(storeDir), false);
  assert.deepEqual(listKnowledgeReviewRevisions({
    objectId: loaded.object.object_id,
    packPath,
    storeDir,
  }).map(item => item.revision), [1]);
});

test('first review save creates a sparse revision overlay and stale CAS is rejected', () => {
  const storeDir = tempStore();
  const current = loadKnowledgeReviewObject({
    objectId: 'knowledge.mcp_servers.context7',
    packPath,
    storeDir,
  });
  const patch = knowledgeReviewPatchFromObject(current.object);
  patch.title = 'Context7 · reviewed';
  patch.valid_time = { from: '2026-07-04T00:00:00Z', until: null };

  const updated = updateKnowledgeReviewObject({
    objectId: current.object.object_id,
    baseRevision: current.revision,
    baseObjectHash: current.objectHash,
    patch,
    actor: 'owner.test',
    mutationId: 'review.context7.2',
    mutatedAt: '2026-07-18T12:00:00Z',
    packPath,
    storeDir,
  });
  assert.equal(updated.revision, 2);
  assert.equal(updated.initialized, true);
  assert.equal(updated.object.title, 'Context7 · reviewed');
  assert.equal(updated.resolvedReviewReasons.includes('valid_from_unknown'), true);
  const objectDir = join(storeDir, 'knowledge-objects', current.object.object_id);
  for (const directory of [storeDir, join(storeDir, 'knowledge-objects'), objectDir, join(objectDir, 'revisions')]) {
    assert.equal(statSync(directory).mode & 0o777, 0o750, `${directory} mode`);
  }
  for (const file of [join(objectDir, 'current.json'), join(objectDir, 'journal.jsonl'), join(objectDir, 'revisions/000001.json'), join(objectDir, 'revisions/000002.json')]) {
    assert.equal(statSync(file).mode & 0o777, 0o640, `${file} mode`);
  }
  assert.deepEqual(listKnowledgeReviewRevisions({
    objectId: current.object.object_id,
    packPath,
    storeDir,
  }).map(item => item.revision), [2, 1]);
  const queue = listKnowledgeReviewQueue({ packPath, storeDir });
  assert.equal(queue.filter(item => item.initialized).length, 1);
  assert.equal(queue.find(item => item.objectId === current.object.object_id)?.revision, 2);

  assert.throws(() => updateKnowledgeReviewObject({
    objectId: current.object.object_id,
    baseRevision: current.revision,
    baseObjectHash: current.objectHash,
    patch,
    actor: 'owner.test',
    mutationId: 'review.context7.stale',
    mutatedAt: '2026-07-18T12:01:00Z',
    packPath,
    storeDir,
  }), reviewError('KNOWLEDGE_REVIEW_CAS_CONFLICT'));
});

test('review rejects missing fact time, source provenance drift, legacy snapshot edits and promotion escalation', () => {
  const storeDir = tempStore();
  const current = loadKnowledgeReviewObject({
    objectId: 'knowledge.mcp_servers.context7',
    packPath,
    storeDir,
  });
  const withoutTime = knowledgeReviewPatchFromObject(current.object);
  withoutTime.valid_time = null;
  assert.throws(() => updateKnowledgeReviewObject({
    objectId: current.object.object_id,
    baseRevision: current.revision,
    baseObjectHash: current.objectHash,
    patch: withoutTime,
    actor: 'owner.test', mutationId: 'review.context7.no-time', mutatedAt: '2026-07-18T12:00:00Z',
    packPath, storeDir,
  }), reviewError('KNOWLEDGE_REVIEW_OBJECT_INVALID'));

  const sourceDrift = knowledgeReviewPatchFromObject(current.object);
  sourceDrift.source_refs[0]!.snapshot_hash = '0'.repeat(64);
  assert.throws(() => updateKnowledgeReviewObject({
    objectId: current.object.object_id,
    baseRevision: current.revision,
    baseObjectHash: current.objectHash,
    patch: sourceDrift,
    actor: 'owner.test', mutationId: 'review.context7.source-drift', mutatedAt: '2026-07-18T12:00:00Z',
    packPath, storeDir,
  }), reviewError('KNOWLEDGE_REVIEW_SOURCE_PROVENANCE_MISMATCH'));

  const legacyDrift = knowledgeReviewPatchFromObject(current.object);
  legacyDrift.valid_time = { from: '2026-07-04T00:00:00Z', until: null };
  legacyDrift.body = legacyDrift.body.replace('"review_state": "approved"', '"review_state": "candidate"');
  assert.throws(() => updateKnowledgeReviewObject({
    objectId: current.object.object_id,
    baseRevision: current.revision,
    baseObjectHash: current.objectHash,
    patch: legacyDrift,
    actor: 'owner.test', mutationId: 'review.context7.legacy-drift', mutatedAt: '2026-07-18T12:00:00Z',
    packPath, storeDir,
  }), reviewError('KNOWLEDGE_REVIEW_LEGACY_SNAPSHOT_MISMATCH'));

  const futureSource = knowledgeReviewPatchFromObject(current.object);
  futureSource.source_refs[0]!.observed_at = '2026-07-05T00:00:00Z';
  assert.throws(() => updateKnowledgeReviewObject({
    objectId: current.object.object_id,
    baseRevision: current.revision,
    baseObjectHash: current.objectHash,
    patch: futureSource,
    actor: 'owner.test', mutationId: 'review.context7.future-source', mutatedAt: '2026-07-18T12:00:00Z',
    packPath, storeDir,
  }), reviewError('KNOWLEDGE_REVIEW_OBJECT_INVALID'));

  const routeSource = readFileSync(resolve(root, 'app/api/knowledge/review/[objectId]/route.ts'), 'utf8');
  assert.doesNotMatch(routeSource, /approved_for_staging|canonical/u);
});

test('review route reuses readonly/Owner write access and returns a CAS conflict', async () => {
  const storeDir = tempStore();
  process.env.DOCCANVAS_KNOWLEDGE_STORE_PATH = storeDir;
  process.env.DOCCANVAS_KNOWLEDGE_PACK_PATH = packPath;
  process.env.DOCCANVAS_WRITE_MODE = 'readonly';
  mutableEnv.NODE_ENV = 'production';
  const readonlyResponse = await PATCH(new NextRequest('https://example.test/api/knowledge/review/knowledge.mcp_servers.context7', {
    method: 'PATCH', headers: { origin: 'https://example.test', 'content-type': 'application/json' }, body: '{}',
  }), context('knowledge.mcp_servers.context7'));
  assert.equal(readonlyResponse.status, 403);

  process.env.DOCCANVAS_WRITE_MODE = 'owner';
  process.env.DOCCANVAS_ADMIN_TOKEN = 'owner-review-test-token';
  process.env.DOCCANVAS_SESSION_SECRET = 'owner-review-test-session-secret';
  const ownerLockedResponse = await PATCH(new NextRequest('https://example.test/api/knowledge/review/knowledge.mcp_servers.context7', {
    method: 'PATCH', headers: { origin: 'https://example.test', 'content-type': 'application/json' }, body: '{}',
  }), context('knowledge.mcp_servers.context7'));
  assert.equal(ownerLockedResponse.status, 401);

  delete process.env.DOCCANVAS_WRITE_MODE;
  mutableEnv.NODE_ENV = 'development';
  const readResponse = await GET(new NextRequest('http://localhost/api/knowledge/review/knowledge.mcp_servers.context7'), context('knowledge.mcp_servers.context7'));
  assert.equal(readResponse.status, 200);
  const current = await readResponse.json();
  const patch = knowledgeReviewPatchFromObject(current.object);
  patch.valid_time = { from: '2026-07-04T00:00:00Z', until: null };
  const first = await PATCH(new NextRequest('http://localhost/api/knowledge/review/knowledge.mcp_servers.context7', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      baseRevision: current.revision,
      baseObjectHash: current.objectHash,
      patch,
    }),
  }), context('knowledge.mcp_servers.context7'));
  assert.equal(first.status, 200);
  const stale = await PATCH(new NextRequest('http://localhost/api/knowledge/review/knowledge.mcp_servers.context7', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      baseRevision: current.revision,
      baseObjectHash: current.objectHash,
      patch,
    }),
  }), context('knowledge.mcp_servers.context7'));
  assert.equal(stale.status, 409);
});

test('review workspace exposes candidate governance without canonical actions', () => {
  const library: KnowledgeLibraryProjection = loadKnowledgeLibrary(packPath);
  const html = renderToStaticMarkup(React.createElement(KnowledgeReviewWorkspace, {
    library,
    writePolicy: { mode: 'readonly', writable: false, tokenRequired: false },
    onSelectKnowledge: () => undefined,
  }));
  assert.match(html, /Review Queue/u);
  assert.match(html, /37/u);
  assert.match(html, /candidate/u);
  assert.doesNotMatch(html, /保存修订|通过并发布|canonical promotion/u);

  const source = readFileSync(resolve(root, 'components/workspace/KnowledgeReviewWorkspace.tsx'), 'utf8');
  assert.match(source, /OwnerSessionControl/u);
  assert.match(source, /isMobile/u);
  assert.match(source, /window\.confirm/u);
  assert.match(source, /splitKnowledgeBody/u);
  assert.match(source, /Legacy snapshot/u);
  const ownerSource = readFileSync(resolve(root, 'components/canvas/OwnerSessionControl.tsx'), 'utf8');
  assert.match(ownerSource, /autoComplete="username"/u);
  assert.match(ownerSource, /autoComplete="current-password"/u);
  assert.doesNotMatch(source, /sessionStorage|X-DocCanvas-Token|#[a-fA-F0-9]{3,8}\b/u);
});
