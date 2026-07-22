import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvidenceRegistryWorkspace } from '../components/workspace/EvidenceRegistryWorkspace';
import { ProviderOperationsWorkspace } from '../components/workspace/ProviderOperationsWorkspace';
import { loadKnowledgeLibrary } from '../lib/server/knowledge-library';
import { buildProductOperationsProjection } from '../lib/product/operations-projection';

const root = resolve(import.meta.dirname, '..');
const packPath = resolve(root, '../product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json');

test('Evidence Registry gives every readiness conclusion stable evidence and freshness', () => {
  const library = loadKnowledgeLibrary(packPath);
  const projection = buildProductOperationsProjection({
    library,
    blueprints: [],
    artifacts: [],
    now: '2026-07-22T08:00:00Z',
  });

  assert.equal(projection.evidenceRegistry.schemaVersion, 'doccanvas-evidence-registry-v1');
  assert.equal(projection.evidenceRegistry.items.filter(item => item.kind === 'knowledge_source').length, library.items.length);
  assert.equal(new Set(projection.evidenceRegistry.items.map(item => item.evidenceId)).size, projection.evidenceRegistry.items.length);
  assert.equal(projection.evidenceRegistry.items.every(item => item.freshness.checkedAt === '2026-07-22T08:00:00Z'), true);
  assert.equal(projection.evidenceRegistry.readiness.every(claim => (
    claim.status !== 'ready'
    || (claim.evidenceIds.length > 0 && claim.evidenceIds.every(id => projection.evidenceRegistry.items.some(item => item.evidenceId === id)))
  )), true);
  assert.equal(projection.evolution.checks.every(check => check.evidenceIds.length > 0), true);
});

test('stale evidence degrades readiness and not_measured never becomes ready', () => {
  const source = loadKnowledgeLibrary(packPath);
  const library = {
    ...source,
    items: source.items.map(item => ({
      ...item,
      observedAt: '2024-01-01T00:00:00Z',
      source: { ...item.source, observedAt: '2024-01-01T00:00:00Z' },
    })),
  };
  const projection = buildProductOperationsProjection({
    library,
    blueprints: [],
    artifacts: [],
    now: '2026-07-22T08:00:00Z',
  });

  assert.equal(projection.evidenceRegistry.stats.stale > 0, true);
  assert.equal(projection.workflow.find(stage => stage.id === 'capture')?.state, 'blocked');
  assert.equal(projection.evolution.checks.find(check => check.id === 'safety_eval')?.status, 'not_measured');
  assert.equal(projection.evidenceRegistry.readiness.find(claim => claim.id === 'safety_eval')?.status, 'not_measured');
});

test('Provider Ops exposes governed hashes and budget without an execution control', () => {
  const projection = buildProductOperationsProjection({
    library: loadKnowledgeLibrary(packPath),
    blueprints: [],
    artifacts: [],
    now: '2026-07-22T08:00:00Z',
    provider: {
      runtime: {
        mode: 'configured', providerId: 'deepseek', modelId: 'deepseek-chat', ready: true, reason: 'ready',
        jobId: 'job-1', policyHash: 'sha256:policy',
        budget: { maxCalls: 20, reservedCalls: 1, remainingCalls: 19, providerCompletedCalls: 1, providerFailedCalls: 0 },
      },
      pilot: {
        state: 'canary_review_required', planHash: 'sha256:plan', authorizedStage: null,
        stageAuthorizationId: null, stageAuthorizationHash: null, authorizedCaptureIds: [],
        executionAllowed: false, cohortCount: 20, resultCount: 1, goldCount: 0,
        gates: [{ id: 'canary', status: 'pending', reason: 'review required', actual: 1, required: true }],
        nextAction: 'review canary',
      },
      evaluation: { status: 'insufficient_data', sampleCount: 1, minimumSamples: 20, gates: [] },
    },
  });

  assert.equal(projection.providerOps.policyHash, 'sha256:policy');
  assert.equal(projection.providerOps.planHash, 'sha256:plan');
  assert.equal(projection.providerOps.budget?.remainingCalls, 19);
  assert.equal(projection.providerOps.canExecute, false);
  const html = renderToStaticMarkup(React.createElement(ProviderOperationsWorkspace, { projection }));
  assert.match(html, /sha256:policy|sha256:plan|19/u);
  assert.doesNotMatch(html, /执行调用|开始批次|运行 Provider/u);
});

test('Evidence Registry UI exposes readable freshness and keeps not_measured distinct', () => {
  const projection = buildProductOperationsProjection({
    library: loadKnowledgeLibrary(packPath), blueprints: [], artifacts: [], now: '2026-07-22T08:00:00Z',
  });
  const html = renderToStaticMarkup(React.createElement(EvidenceRegistryWorkspace, { projection, initialEvidenceId: null }));
  assert.match(html, /Evidence Registry|新鲜度|尚未测量/u);
  assert.match(html, /data-state="not_measured"/u);
  assert.doesNotMatch(html, /not_measured[^<]*通过/u);
});
