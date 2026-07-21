import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { EnrichmentDraft } from '../lib/knowledge/enrichment-contract';
import { createCapture, type CaptureRecord } from '../lib/server/knowledge-capture-store';
import { runEnrichment } from '../lib/server/knowledge-enrichment-store';
import { upsertGoldAnnotation } from '../lib/server/knowledge-enrichment-eval';
import {
  createAuthorizedProviderRuntime,
  inspectProviderLedgerEvidence,
  readEnrichmentJobPolicy,
} from '../lib/server/knowledge-enrichment-provider';
import {
  EnrichmentCanaryReviewSchema,
  PilotControlError,
  evaluatePilotReadiness,
  readPilotPlan,
} from '../lib/server/knowledge-enrichment-pilot';
import { GET as getPilotReadiness } from '../app/api/knowledge/enrichments/pilot/route';

function root(): string {
  return mkdtempSync(join(tmpdir(), 'doccanvas-enrichment-pilot-'));
}

function captures(dir: string): CaptureRecord[] {
  return Array.from({ length: 20 }, (_, index) => createCapture({
    storeDir: join(dir, 'captures'),
    actor: 'owner.test',
    mutationId: `capture.pilot.${String(index + 1).padStart(2, '0')}`,
    capturedAt: `2026-07-19T08:${String(index).padStart(2, '0')}:00Z`,
    request: {
      source: {
        kind: 'url',
        sourceUri: `https://example.test/pilot/${index + 1}`,
        mediaType: 'text/markdown',
        content: `# Pilot source ${index + 1}\n\nUse independently reviewed evidence.\n\n- Measure result ${index + 1}`,
      },
      objectType: 'tip',
      knowledgeForm: { primary: 'procedure', subform: 'technique' },
      domainRef: 'ai-product.evaluation.pilot',
    },
  }));
}

function jobPolicy(captureIds: string[]) {
  return {
    schemaVersion: 'doccanvas-enrichment-job-policy-v1',
    jobId: 'job.enrichment.pilot.020',
    approvalId: 'approval.owner.pilot.020',
    approvedBy: 'owner.accountable',
    approvedAt: '2026-07-19T08:00:00Z',
    validFrom: '2026-07-19T08:00:00Z',
    validUntil: '2026-07-19T12:00:00Z',
    providerId: 'openai',
    modelId: 'model-explicitly-authorized',
    promptVersion: 'knowledge-enrichment-v1',
    allowedCaptureIds: captureIds,
    dataEgress: {
      sourceText: true,
      metadata: ['captureId', 'sourceHash'],
      classification: 'approved pilot cohort only',
    },
    limits: { maxCalls: 20, maxInputBytes: 64 * 1024, maxOutputTokens: 800, timeoutMs: 2_000 },
  };
}

function pilotPlan(captureIds: string[], policyHash: string) {
  return {
    schemaVersion: 'doccanvas-enrichment-pilot-plan-v1',
    pilotId: 'pilot.enrichment.020',
    jobId: 'job.enrichment.pilot.020',
    jobPolicyHash: policyHash,
    createdAt: '2026-07-19T08:00:00Z',
    validUntil: '2026-07-19T12:00:00Z',
    cohortCaptureIds: captureIds,
    humanGold: {
      assignmentId: 'gold.assignment.pilot.020',
      annotator: 'reviewer.independent',
      dueAt: '2026-07-19T18:00:00Z',
      requiredCount: 20,
      independentSourceReview: true,
      modelOutputNotCopied: true,
    },
    stages: { canaryCalls: 1, batchCalls: 19, pauseAfterCanary: true },
  };
}

function validDraft(): EnrichmentDraft {
  return {
    schemaVersion: 'doccanvas-enrichment-draft-v1',
    title: 'Pilot source',
    summary: 'Use independently reviewed evidence.',
    keyPoints: [{ text: 'Measure result.', evidenceLocators: [{ startLine: 5, endLine: 5 }] }],
    classification: {
      objectType: 'tip',
      knowledgeForm: { primary: 'procedure', subform: 'technique' },
      domainRefs: ['ai-product.evaluation.pilot'],
      evidenceLocators: [{ startLine: 1, endLine: 5 }],
    },
    abstentions: [],
  };
}

function fixture() {
  const dir = root();
  const cohort = captures(dir);
  const captureIds = cohort.map(item => item.manifest.captureId);
  const policyFile = join(dir, 'job-policy.json');
  const apiKeyFile = join(dir, 'api-key');
  const ledgerFile = join(dir, 'provider-ledger.jsonl');
  const planFile = join(dir, 'pilot-plan.json');
  writeFileSync(policyFile, JSON.stringify(jobPolicy(captureIds)), { mode: 0o640 });
  writeFileSync(apiKeyFile, 'secret-value-never-exposed\n', { mode: 0o400 });
  chmodSync(apiKeyFile, 0o400);
  const loaded = readEnrichmentJobPolicy({ policyFile, now: '2026-07-19T09:00:00Z' });
  writeFileSync(planFile, JSON.stringify(pilotPlan(captureIds, loaded.policyHash)), { mode: 0o640 });
  return { dir, cohort, captureIds, policyFile, apiKeyFile, ledgerFile, planFile };
}

test('legacy four-check canary review cannot authorize batch and v2 requires language and taxonomy checks', () => {
  const common = {
    pilotId: 'pilot.enrichment.020',
    pilotPlanHash: `sha256:${'a'.repeat(64)}`,
    reservationId: `sha256:${'b'.repeat(64)}`,
    decision: 'approved_for_batch' as const,
    reviewedBy: 'reviewer.canary',
    reviewedAt: '2026-07-19T09:15:00Z',
  };
  assert.equal(EnrichmentCanaryReviewSchema.safeParse({
    ...common,
    schemaVersion: 'doccanvas-enrichment-canary-review-v1',
    checks: { schemaValid: true, sourceGrounded: true, sensitiveDataAcceptable: true, usageAccepted: true },
  }).success, false);
  assert.equal(EnrichmentCanaryReviewSchema.safeParse({
    ...common,
    schemaVersion: 'doccanvas-enrichment-canary-review-v2',
    checks: { schemaValid: true, sourceGrounded: true, sensitiveDataAcceptable: true, usageAccepted: true },
  }).success, false);
  assert.equal(EnrichmentCanaryReviewSchema.safeParse({
    ...common,
    schemaVersion: 'doccanvas-enrichment-canary-review-v2',
    checks: {
      schemaValid: true, sourceGrounded: true, sensitiveDataAcceptable: true, usageAccepted: true,
      sourceLanguagePreserved: true, domainTaxonomyPreserved: true,
    },
  }).success, true);
});

test('pilot preflight binds exactly 20 intact captures to policy and exposes no secret or source text', () => {
  const value = fixture();
  const plan = readPilotPlan({ planFile: value.planFile, now: '2026-07-19T09:00:00Z' });
  assert.match(plan.planHash, /^sha256:[a-f0-9]{64}$/u);
  const report = evaluatePilotReadiness({
    planFile: value.planFile,
    policyFile: value.policyFile,
    apiKeyFile: value.apiKeyFile,
    ledgerFile: value.ledgerFile,
    captureStoreDir: join(value.dir, 'captures'),
    enrichmentStoreDir: join(value.dir, 'enrichments'),
    goldStoreDir: join(value.dir, 'gold'),
    now: '2026-07-19T09:00:00Z',
  });
  assert.equal(report.mode, 'configured');
  assert.equal(report.readyForCanary, true);
  assert.equal(report.readyForBatch, false);
  assert.equal(report.executionAllowed, false);
  assert.equal(report.nextAction, 'provide_canary_stage_authorization');
  assert.equal(report.cohortCount, 20);
  assert.equal(report.gates.find(gate => gate.id === 'cohort')?.status, 'pass');
  assert.equal(report.gates.find(gate => gate.id === 'canary')?.status, 'ready');
  assert.doesNotMatch(JSON.stringify(report), /secret-value-never-exposed|Use independently reviewed evidence|\/tmp\//u);
});

test('pilot readiness API is read-only and reports an honest disabled state without configuration', async () => {
  const previous = process.env.DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE;
  delete process.env.DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE;
  try {
    const response = await getPilotReadiness();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const payload = await response.json();
    assert.equal(payload.pilot.mode, 'disabled');
    assert.equal(payload.pilot.state, 'not_configured');
    assert.equal(payload.pilot.readyForCanary, false);
    assert.equal(payload.pilot.gates.length, 7);
  } finally {
    if (previous === undefined) delete process.env.DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE;
    else process.env.DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE = previous;
  }
});

test('pilot preflight rejects cohort-policy drift instead of silently narrowing authorization', () => {
  const value = fixture();
  const raw = JSON.parse(readFileSync(value.planFile, 'utf8'));
  raw.cohortCaptureIds = raw.cohortCaptureIds.slice().reverse().slice(1).concat('capture-ffffffffffffffffffffffff');
  writeFileSync(value.planFile, JSON.stringify(raw), { mode: 0o640 });
  assert.throws(
    () => evaluatePilotReadiness({
      planFile: value.planFile, policyFile: value.policyFile, apiKeyFile: value.apiKeyFile,
      ledgerFile: value.ledgerFile, captureStoreDir: join(value.dir, 'captures'),
      enrichmentStoreDir: join(value.dir, 'enrichments'), goldStoreDir: join(value.dir, 'gold'),
      now: '2026-07-19T09:00:00Z',
    }),
    (error: unknown) => error instanceof PilotControlError && error.code === 'PILOT_COHORT_POLICY_MISMATCH',
  );
});

test('one successful canary still blocks batch until an independent approved review file is present', async () => {
  const value = fixture();
  const first = value.cohort[0]!;
  const runtime = createAuthorizedProviderRuntime({
    policyFile: value.policyFile,
    apiKeyFile: value.apiKeyFile,
    ledgerFile: value.ledgerFile,
    now: () => '2026-07-19T09:05:00Z',
    transport: async () => new Response(JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(validDraft()) }] }],
      usage: { input_tokens: 40, output_tokens: 20, total_tokens: 60 },
    }), { status: 200 }),
  });
  await runEnrichment({
    storeDir: join(value.dir, 'enrichments'),
    captureStoreDir: join(value.dir, 'captures'),
    captureId: first.manifest.captureId,
    actor: 'owner.test',
    mutationId: 'enrichment.pilot.canary.001',
    enrichedAt: '2026-07-19T09:05:00Z',
    promptVersion: runtime.promptVersion,
    executor: runtime.executor,
    policy: runtime.policy,
  });
  const pending = evaluatePilotReadiness({
    planFile: value.planFile, policyFile: value.policyFile, apiKeyFile: value.apiKeyFile,
    ledgerFile: value.ledgerFile, captureStoreDir: join(value.dir, 'captures'),
    enrichmentStoreDir: join(value.dir, 'enrichments'), goldStoreDir: join(value.dir, 'gold'),
    now: '2026-07-19T09:10:00Z',
  });
  assert.equal(pending.readyForBatch, false);
  assert.equal(pending.gates.find(gate => gate.id === 'canary')?.reason, 'canary_review_required');

  const evidence = inspectProviderLedgerEvidence({ policyFile: value.policyFile, ledgerFile: value.ledgerFile, now: '2026-07-19T09:10:00Z' });
  const reviewFile = join(value.dir, 'canary-review.json');
  const plan = readPilotPlan({ planFile: value.planFile, now: '2026-07-19T09:10:00Z' });
  writeFileSync(reviewFile, JSON.stringify({
    schemaVersion: 'doccanvas-enrichment-canary-review-v2',
    pilotId: plan.plan.pilotId,
    pilotPlanHash: plan.planHash,
    reservationId: evidence.reservations[0]?.reservationId,
    decision: 'approved_for_batch',
    reviewedBy: 'reviewer.canary',
    reviewedAt: '2026-07-19T09:15:00Z',
    checks: {
      schemaValid: true, sourceGrounded: true, sensitiveDataAcceptable: true, usageAccepted: true,
      sourceLanguagePreserved: true, domainTaxonomyPreserved: true,
    },
  }), { mode: 0o640 });
  const approved = evaluatePilotReadiness({
    planFile: value.planFile, policyFile: value.policyFile, apiKeyFile: value.apiKeyFile,
    ledgerFile: value.ledgerFile, captureStoreDir: join(value.dir, 'captures'),
    enrichmentStoreDir: join(value.dir, 'enrichments'), goldStoreDir: join(value.dir, 'gold'),
    canaryReviewFile: reviewFile, now: '2026-07-19T09:20:00Z',
  });
  assert.equal(approved.readyForBatch, true);
  assert.equal(approved.gates.find(gate => gate.id === 'canary')?.status, 'pass');
  assert.equal(approved.remainingCalls, 19);
});

test('twenty mock-transport results plus twenty independent gold records reach evaluation readiness only after canary approval', async () => {
  const value = fixture();
  let clock = '2026-07-19T09:05:00Z';
  const runtime = createAuthorizedProviderRuntime({
    policyFile: value.policyFile,
    apiKeyFile: value.apiKeyFile,
    ledgerFile: value.ledgerFile,
    now: () => clock,
    transport: async () => new Response(JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(validDraft()) }] }],
      usage: { input_tokens: 40, output_tokens: 20, total_tokens: 60 },
    }), { status: 200 }),
  });
  const reviewFile = join(value.dir, 'canary-review.json');
  for (const [index, capture] of value.cohort.entries()) {
    await runEnrichment({
      storeDir: join(value.dir, 'enrichments'), captureStoreDir: join(value.dir, 'captures'),
      captureId: capture.manifest.captureId, actor: 'owner.test',
      mutationId: `enrichment.pilot.batch.${String(index + 1).padStart(2, '0')}`,
      enrichedAt: clock, promptVersion: runtime.promptVersion, executor: runtime.executor, policy: runtime.policy,
    });
    if (index === 0) {
      const evidence = inspectProviderLedgerEvidence({ policyFile: value.policyFile, ledgerFile: value.ledgerFile, now: clock });
      const plan = readPilotPlan({ planFile: value.planFile, now: clock });
      writeFileSync(reviewFile, JSON.stringify({
        schemaVersion: 'doccanvas-enrichment-canary-review-v2', pilotId: plan.plan.pilotId,
        pilotPlanHash: plan.planHash, reservationId: evidence.reservations[0]?.reservationId,
        decision: 'approved_for_batch', reviewedBy: 'reviewer.canary', reviewedAt: '2026-07-19T09:15:00Z',
        checks: {
          schemaValid: true, sourceGrounded: true, sensitiveDataAcceptable: true, usageAccepted: true,
          sourceLanguagePreserved: true, domainTaxonomyPreserved: true,
        },
      }), { mode: 0o640 });
      clock = '2026-07-19T09:20:00Z';
    }
    upsertGoldAnnotation({
      storeDir: join(value.dir, 'gold'), actor: 'reviewer.independent',
      mutationId: `gold.pilot.${String(index + 1).padStart(2, '0')}`, annotatedAt: '2026-07-19T10:00:00Z',
      annotation: {
        captureId: capture.manifest.captureId, sourceHash: capture.manifest.sourceHash,
        title: validDraft().title, summary: validDraft().summary,
        keyPoints: validDraft().keyPoints.map(item => item.text), classification: validDraft().classification,
      },
    });
  }
  const withoutReceipt = evaluatePilotReadiness({
    planFile: value.planFile, policyFile: value.policyFile, apiKeyFile: value.apiKeyFile,
    ledgerFile: value.ledgerFile, captureStoreDir: join(value.dir, 'captures'),
    enrichmentStoreDir: join(value.dir, 'enrichments'), goldStoreDir: join(value.dir, 'gold'),
    canaryReviewFile: reviewFile, now: '2026-07-19T10:05:00Z',
  });
  assert.equal(withoutReceipt.readyForReadinessEvaluation, false);
  assert.equal(withoutReceipt.gates.find(gate => gate.id === 'gold')?.reason, 'gold_completion_receipt_required');

  const plan = readPilotPlan({ planFile: value.planFile, now: '2026-07-19T10:05:00Z' });
  const completionFile = join(value.dir, 'gold-completion.json');
  writeFileSync(completionFile, JSON.stringify({
    schemaVersion: 'doccanvas-enrichment-gold-completion-v1', pilotId: plan.plan.pilotId,
    pilotPlanHash: plan.planHash, assignmentId: plan.plan.humanGold.assignmentId,
    taskPackId: 'gold-pack-aaaaaaaaaaaaaaaaaaaaaaaa', taskPackHash: `sha256:${'c'.repeat(64)}`,
    completedBy: plan.plan.humanGold.annotator, completedAt: '2026-07-19T10:01:00Z',
    independentSourceReview: true, modelOutputNotCopied: true,
    items: value.cohort.map(capture => ({ captureId: capture.manifest.captureId, sourceHash: capture.manifest.sourceHash })),
  }), { mode: 0o640 });
  const report = evaluatePilotReadiness({
    planFile: value.planFile, policyFile: value.policyFile, apiKeyFile: value.apiKeyFile,
    ledgerFile: value.ledgerFile, captureStoreDir: join(value.dir, 'captures'),
    enrichmentStoreDir: join(value.dir, 'enrichments'), goldStoreDir: join(value.dir, 'gold'),
    canaryReviewFile: reviewFile, goldCompletionFile: completionFile, now: '2026-07-19T10:05:00Z',
  });
  assert.equal(report.state, 'ready_for_evaluation');
  assert.equal(report.readyForReadinessEvaluation, true);
  assert.equal(report.resultCount, 20);
  assert.equal(report.goldCount, 20);
  assert.equal(report.remainingCalls, 0);
  assert.equal(report.gates.find(gate => gate.id === 'gold')?.status, 'pass');
});
