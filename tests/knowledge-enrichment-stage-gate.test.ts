import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ENRICHMENT_OUTPUT_JSON_SCHEMA, type EnrichmentDraft } from '../lib/knowledge/enrichment-contract';
import { createCapture, type CaptureRecord } from '../lib/server/knowledge-capture-store';
import { runEnrichment } from '../lib/server/knowledge-enrichment-store';
import {
  createAuthorizedProviderRuntime,
  inspectProviderLedgerEvidence,
  readEnrichmentJobPolicy,
} from '../lib/server/knowledge-enrichment-provider';
import {
  PilotControlError,
  createPilotReservationGate,
  evaluatePilotReadiness,
  readCanaryReviewEvidence,
  readPilotPlan,
  readStageAuthorization,
} from '../lib/server/knowledge-enrichment-pilot';

function root(): string {
  return mkdtempSync(join(tmpdir(), 'doccanvas-enrichment-stage-gate-'));
}

function createCohort(dir: string): CaptureRecord[] {
  return Array.from({ length: 20 }, (_, index) => createCapture({
    storeDir: join(dir, 'captures'),
    actor: 'owner.test',
    mutationId: `capture.stage.${String(index + 1).padStart(2, '0')}`,
    capturedAt: `2026-07-19T08:${String(index).padStart(2, '0')}:00Z`,
    request: {
      source: {
        kind: 'url', sourceUri: `https://example.test/stage/${index + 1}`, mediaType: 'text/markdown',
        content: `# Stage source ${index + 1}\n\nIndependent source evidence.\n\n- Measure result ${index + 1}`,
      },
      objectType: 'tip', knowledgeForm: { primary: 'procedure', subform: 'technique' },
      domainRef: 'ai-product.evaluation.pilot',
    },
  }));
}

function draft(): EnrichmentDraft {
  return {
    schemaVersion: 'doccanvas-enrichment-draft-v1',
    title: 'Stage source', summary: 'Independent source evidence.',
    keyPoints: [{ text: 'Measure result.', evidenceLocators: [{ startLine: 5, endLine: 5 }] }],
    classification: {
      objectType: 'tip', knowledgeForm: { primary: 'procedure', subform: 'technique' },
      domainRefs: ['ai-product.evaluation.pilot'], evidenceLocators: [{ startLine: 1, endLine: 5 }],
    },
    abstentions: [],
  };
}

function fixture() {
  const dir = root();
  const cohort = createCohort(dir);
  const captureIds = cohort.map(item => item.manifest.captureId);
  const policyFile = join(dir, 'job-policy.json');
  const apiKeyFile = join(dir, 'api-key');
  const ledgerFile = join(dir, 'provider-ledger.jsonl');
  const planFile = join(dir, 'pilot-plan.json');
  const policy = {
    schemaVersion: 'doccanvas-enrichment-job-policy-v1', jobId: 'job.enrichment.stage.020',
    approvalId: 'approval.owner.stage.020', approvedBy: 'owner.accountable',
    approvedAt: '2026-07-19T08:00:00Z', validFrom: '2026-07-19T08:00:00Z', validUntil: '2026-07-19T12:00:00Z',
    providerId: 'openai', modelId: 'model-explicitly-authorized', promptVersion: 'knowledge-enrichment-v1',
    allowedCaptureIds: captureIds,
    dataEgress: { sourceText: true, metadata: ['captureId', 'sourceHash'], classification: 'approved pilot cohort only' },
    limits: { maxCalls: 20, maxInputBytes: 64 * 1024, maxOutputTokens: 800, timeoutMs: 2_000 },
  };
  writeFileSync(policyFile, JSON.stringify(policy), { mode: 0o640 });
  writeFileSync(apiKeyFile, 'test-secret-never-exposed\n', { mode: 0o400 });
  chmodSync(apiKeyFile, 0o400);
  const loadedPolicy = readEnrichmentJobPolicy({ policyFile, now: '2026-07-19T09:00:00Z' });
  writeFileSync(planFile, JSON.stringify({
    schemaVersion: 'doccanvas-enrichment-pilot-plan-v1', pilotId: 'pilot.enrichment.stage.020',
    jobId: policy.jobId, jobPolicyHash: loadedPolicy.policyHash,
    createdAt: '2026-07-19T08:00:00Z', validUntil: '2026-07-19T12:00:00Z', cohortCaptureIds: captureIds,
    humanGold: {
      assignmentId: 'gold.assignment.stage.020', annotator: 'reviewer.independent', dueAt: '2026-07-19T18:00:00Z',
      requiredCount: 20, independentSourceReview: true, modelOutputNotCopied: true,
    },
    stages: { canaryCalls: 1, batchCalls: 19, pauseAfterCanary: true },
  }), { mode: 0o640 });
  const plan = readPilotPlan({ planFile, now: '2026-07-19T09:00:00Z' });
  const stageAuthorizationFile = join(dir, 'stage-authorization.json');
  writeFileSync(stageAuthorizationFile, JSON.stringify({
    schemaVersion: 'doccanvas-enrichment-stage-authorization-v1', authorizationId: 'stage.auth.canary.001',
    pilotId: plan.plan.pilotId, pilotPlanHash: plan.planHash, jobPolicyHash: loadedPolicy.policyHash,
    stage: 'canary', authorizedBy: 'owner.canary.approver', authorizedAt: '2026-07-19T09:00:00Z',
    validUntil: '2026-07-19T10:00:00Z', expectedReservedCalls: 0, maxNewCalls: 1,
    allowedCaptureIds: [captureIds[0]],
  }), { mode: 0o640 });
  return { dir, cohort, captureIds, policyFile, apiKeyFile, ledgerFile, planFile, stageAuthorizationFile, plan };
}

function gateOptions(value: ReturnType<typeof fixture>, now = '2026-07-19T09:05:00Z') {
  return {
    planFile: value.planFile, stageAuthorizationFile: value.stageAuthorizationFile,
    policyFile: value.policyFile, apiKeyFile: value.apiKeyFile, ledgerFile: value.ledgerFile,
    captureStoreDir: join(value.dir, 'captures'), enrichmentStoreDir: join(value.dir, 'enrichments'),
    goldStoreDir: join(value.dir, 'gold'), now: () => now,
  };
}

function runtime(value: ReturnType<typeof fixture>, calls: { count: number }, now = () => '2026-07-19T09:05:00Z') {
  return createAuthorizedProviderRuntime({
    policyFile: value.policyFile, apiKeyFile: value.apiKeyFile, ledgerFile: value.ledgerFile, now,
    reservationGate: createPilotReservationGate({ ...gateOptions(value, now()), now }),
    transport: async () => {
      calls.count += 1;
      return new Response(JSON.stringify({
        status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(draft()) }] }],
        usage: { input_tokens: 40, output_tokens: 20, total_tokens: 60 },
      }), { status: 200 });
    },
  });
}

test('stage authorization is strict, plan-bound and exact for the canary capture', () => {
  const value = fixture();
  const loaded = readStageAuthorization({
    authorizationFile: value.stageAuthorizationFile, planFile: value.planFile, now: '2026-07-19T09:05:00Z',
  });
  assert.equal(loaded.authorization.stage, 'canary');
  assert.deepEqual(loaded.authorization.allowedCaptureIds, [value.captureIds[0]]);
  assert.match(loaded.authorizationHash, /^sha256:[a-f0-9]{64}$/u);
  const drift = JSON.parse(JSON.stringify(loaded.authorization));
  drift.allowedCaptureIds = [value.captureIds[1]];
  writeFileSync(value.stageAuthorizationFile, JSON.stringify(drift), { mode: 0o640 });
  assert.throws(
    () => readStageAuthorization({ authorizationFile: value.stageAuthorizationFile, planFile: value.planFile, now: '2026-07-19T09:05:00Z' }),
    (error: unknown) => error instanceof PilotControlError && error.code === 'PILOT_STAGE_AUTHORIZATION_SCOPE_MISMATCH',
  );
});

test('atomic canary gate allows one call and blocks every second reservation before approved review', async () => {
  const value = fixture();
  const calls = { count: 0 };
  const configured = runtime(value, calls);
  await runEnrichment({
    storeDir: join(value.dir, 'enrichments'), captureStoreDir: join(value.dir, 'captures'),
    captureId: value.captureIds[0]!, actor: 'owner.test', mutationId: 'enrichment.stage.canary.001',
    enrichedAt: '2026-07-19T09:05:00Z', promptVersion: configured.promptVersion,
    executor: configured.executor, policy: configured.policy,
  });
  await assert.rejects(() => configured.executor.execute({
    captureId: value.captureIds[1]!, sourceText: '# blocked', sourceHash: value.cohort[1]!.manifest.sourceHash,
    sourceLanguage: 'en', allowedDomainRefs: ['ai-product.evaluation.pilot'],
    promptVersion: configured.promptVersion, maxOutputTokens: 800, outputSchema: ENRICHMENT_OUTPUT_JSON_SCHEMA,
  }));
  const evidence = inspectProviderLedgerEvidence({ policyFile: value.policyFile, ledgerFile: value.ledgerFile, now: '2026-07-19T09:10:00Z' });
  assert.equal(calls.count, 1);
  assert.equal(evidence.reservations.length, 1);
});

test('two concurrent canary attempts produce at most one reservation and one transport call', async () => {
  const value = fixture();
  const calls = { count: 0 };
  const configured = runtime(value, calls);
  const input = {
    captureId: value.captureIds[0]!,
    sourceText: '# Stage source\n\nIndependent source evidence.\n\n- Measure result',
    sourceHash: value.cohort[0]!.manifest.sourceHash,
    sourceLanguage: 'en' as const,
    allowedDomainRefs: ['ai-product.evaluation.pilot'],
    promptVersion: configured.promptVersion,
    maxOutputTokens: 800,
    outputSchema: ENRICHMENT_OUTPUT_JSON_SCHEMA,
  };
  const outcomes = await Promise.allSettled([
    configured.executor.execute(input),
    configured.executor.execute(input),
  ]);
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(item => item.status === 'rejected').length, 1);
  assert.equal(calls.count, 1);
  assert.equal(inspectProviderLedgerEvidence({
    policyFile: value.policyFile, ledgerFile: value.ledgerFile, now: '2026-07-19T09:10:00Z',
  }).reservations.length, 1);
});

test('batch authorization binds successful canary review before any of the remaining nineteen calls', async () => {
  const value = fixture();
  const calls = { count: 0 };
  const canary = runtime(value, calls);
  await runEnrichment({
    storeDir: join(value.dir, 'enrichments'), captureStoreDir: join(value.dir, 'captures'),
    captureId: value.captureIds[0]!, actor: 'owner.test', mutationId: 'enrichment.stage.canary.001',
    enrichedAt: '2026-07-19T09:05:00Z', promptVersion: canary.promptVersion, executor: canary.executor, policy: canary.policy,
  });
  const evidence = inspectProviderLedgerEvidence({ policyFile: value.policyFile, ledgerFile: value.ledgerFile, now: '2026-07-19T09:10:00Z' });
  const reviewFile = join(value.dir, 'canary-review.json');
  writeFileSync(reviewFile, JSON.stringify({
    schemaVersion: 'doccanvas-enrichment-canary-review-v2', pilotId: value.plan.plan.pilotId,
    pilotPlanHash: value.plan.planHash, reservationId: evidence.reservations[0]!.reservationId,
    decision: 'approved_for_batch', reviewedBy: 'reviewer.canary', reviewedAt: '2026-07-19T09:15:00Z',
    checks: {
      schemaValid: true, sourceGrounded: true, sensitiveDataAcceptable: true, usageAccepted: true,
      sourceLanguagePreserved: true, domainTaxonomyPreserved: true,
    },
  }), { mode: 0o640 });
  const review = readCanaryReviewEvidence({ reviewFile, planFile: value.planFile, now: '2026-07-19T09:20:00Z' });
  writeFileSync(value.stageAuthorizationFile, JSON.stringify({
    schemaVersion: 'doccanvas-enrichment-stage-authorization-v1', authorizationId: 'stage.auth.batch.001',
    pilotId: value.plan.plan.pilotId, pilotPlanHash: value.plan.planHash,
    jobPolicyHash: readEnrichmentJobPolicy({ policyFile: value.policyFile, now: '2026-07-19T09:20:00Z' }).policyHash,
    stage: 'batch', authorizedBy: 'owner.batch.approver', authorizedAt: '2026-07-19T09:20:00Z',
    validUntil: '2026-07-19T11:00:00Z', expectedReservedCalls: 1, maxNewCalls: 19,
    canaryReservationId: evidence.reservations[0]!.reservationId, canaryReviewHash: review.reviewHash,
    allowedCaptureIds: value.captureIds.slice(1),
  }), { mode: 0o640 });
  const report = evaluatePilotReadiness({
    ...gateOptions(value, '2026-07-19T09:20:00Z'), canaryReviewFile: reviewFile, now: '2026-07-19T09:20:00Z',
  });
  assert.equal(report.readyForBatch, true);
  assert.equal(report.executionAllowed, true);
  assert.equal(report.authorizedStage, 'batch');
  assert.deepEqual(report.authorizedCaptureIds, value.captureIds.slice(1));
  const batch = createAuthorizedProviderRuntime({
    policyFile: value.policyFile, apiKeyFile: value.apiKeyFile, ledgerFile: value.ledgerFile,
    now: () => '2026-07-19T09:20:00Z',
    reservationGate: createPilotReservationGate({ ...gateOptions(value, '2026-07-19T09:20:00Z'), canaryReviewFile: reviewFile }),
    transport: async () => {
      calls.count += 1;
      return new Response(JSON.stringify({
        status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(draft()) }] }],
        usage: { input_tokens: 40, output_tokens: 20, total_tokens: 60 },
      }), { status: 200 });
    },
  });
  await runEnrichment({
    storeDir: join(value.dir, 'enrichments'), captureStoreDir: join(value.dir, 'captures'),
    captureId: value.captureIds[1]!, actor: 'owner.test', mutationId: 'enrichment.stage.batch.001',
    enrichedAt: '2026-07-19T09:20:00Z', promptVersion: batch.promptVersion, executor: batch.executor, policy: batch.policy,
  });
  assert.equal(calls.count, 2);
  assert.equal(inspectProviderLedgerEvidence({ policyFile: value.policyFile, ledgerFile: value.ledgerFile, now: '2026-07-19T09:21:00Z' }).reservations.length, 2);
});
