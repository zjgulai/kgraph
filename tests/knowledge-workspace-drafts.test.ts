import assert from 'node:assert/strict';
import test from 'node:test';
import type { KnowledgeReviewPatch } from '../lib/server/knowledge-review-store';
import {
  CAPTURE_DRAFT_STORAGE_KEY,
  mergeReviewConflict,
  parseCaptureDraft,
  parseReviewDraft,
  reviewDraftStorageKey,
  serializeCaptureDraft,
  serializeReviewDraft,
} from '../lib/knowledge/workspace-drafts';

const captureDraft = {
  sourceKind: 'url' as const,
  sourceUri: 'https://example.test/source',
  file: null,
  content: 'source body',
  title: 'Candidate title',
  domainRef: 'ai-product.capture',
};

const reviewPatch = {
  title: 'Base title',
  body: 'Base body',
  knowledge_form: { primary: 'procedure', subforms: ['technique'] },
  domain_refs: ['ai-product.capture'],
  asset_maturity: 'captured',
  cognitive_lenses: [],
  scope: { includes: [], excludes: [] },
  valid_time: null,
  observed_at: '2026-07-22T00:00:00Z',
  source_refs: [],
  relations: [],
  supersedes: [],
  evidence_grade: 'source_registered',
  confidence: 0.5,
  usage_context: {},
  value_context: {},
} as unknown as KnowledgeReviewPatch;

test('capture drafts are versioned, bounded and reject malformed storage', () => {
  assert.equal(CAPTURE_DRAFT_STORAGE_KEY, 'doccanvas:capture-draft:v1');
  assert.deepEqual(parseCaptureDraft(serializeCaptureDraft(captureDraft)), captureDraft);
  assert.equal(parseCaptureDraft('{"schemaVersion":"wrong"}'), null);
  assert.throws(() => serializeCaptureDraft({ ...captureDraft, content: 'x'.repeat(1024 * 1024 + 1) }), /CAPTURE_DRAFT_TOO_LARGE/u);
});

test('review drafts preserve base, local values and deterministic three-way choices', () => {
  const local = { ...reviewPatch, title: 'Local title', body: 'Local body' };
  const stored = {
    objectId: 'knowledge.capture.example',
    baseRevision: 2,
    baseObjectHash: `sha256:${'a'.repeat(64)}`,
    base: reviewPatch,
    local,
  };
  assert.equal(reviewDraftStorageKey(stored.objectId), 'doccanvas:review-draft:v1:knowledge.capture.example');
  assert.deepEqual(parseReviewDraft(serializeReviewDraft(stored)), stored);

  const current = { ...reviewPatch, title: 'Server title', body: 'Server body' };
  assert.deepEqual(
    mergeReviewConflict(current, local, { title: 'current', body: 'local' }),
    { ...local, title: 'Server title', body: 'Local body' },
  );
});
