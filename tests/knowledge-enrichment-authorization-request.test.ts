import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { createCapture } from '../lib/server/knowledge-capture-store';
import { runEnrichment } from '../lib/server/knowledge-enrichment-store';
import { createAuthorizedProviderRuntime, readEnrichmentJobPolicy } from '../lib/server/knowledge-enrichment-provider';
import { createPilotReservationGate, readPilotPlan } from '../lib/server/knowledge-enrichment-pilot';
import {
  buildPilotAuthorizationRequest,
  disabledPilotAuthorizationRequest,
} from '../lib/server/knowledge-enrichment-authorization-request';
import { GET as getAuthorizationRequest } from '../app/api/knowledge/enrichments/pilot/authorization-request/route';

function fixture(runtimeNow?: string) {
  const now = runtimeNow ?? '2026-07-19T09:00:00Z';
  const approvedAt = runtimeNow ? new Date(Date.parse(now) - 60_000).toISOString() : '2026-07-19T08:00:00Z';
  const validUntil = runtimeNow ? new Date(Date.parse(now) + 600_000).toISOString() : '2026-07-19T12:00:00Z';
  const goldDueAt = runtimeNow ? new Date(Date.parse(now) + 3_600_000).toISOString() : '2026-07-19T18:00:00Z';
  const dir = mkdtempSync(join(tmpdir(), 'doccanvas-pilot-authorization-request-'));
  const captures = Array.from({ length: 20 }, (_, index) => createCapture({
    storeDir: join(dir, 'captures'),
    actor: 'owner.test',
    mutationId: `capture.authorization.request.${String(index + 1).padStart(2, '0')}`,
    capturedAt: `2026-07-19T08:${String(index).padStart(2, '0')}:00Z`,
    request: {
      source: {
        kind: 'url', sourceUri: `https://example.test/authorization-request/${index + 1}`, mediaType: 'text/markdown',
        content: `# Authorization source ${index + 1}\n\nPrivate source body must not enter the request pack.\n\n- Evidence ${index + 1}`,
      },
      objectType: 'tip', knowledgeForm: { primary: 'procedure', subform: 'technique' },
      domainRef: 'ai-product.evaluation.pilot',
    },
  }));
  const captureIds = captures.map(item => item.manifest.captureId);
  const policyFile = join(dir, 'job-policy.json');
  const apiKeyFile = join(dir, 'api-key');
  const ledgerFile = join(dir, 'provider-ledger.jsonl');
  const planFile = join(dir, 'pilot-plan.json');
  writeFileSync(policyFile, JSON.stringify({
    schemaVersion: 'doccanvas-enrichment-job-policy-v1', jobId: 'job.authorization.request.020',
    approvalId: 'approval.authorization.request.020', approvedBy: 'owner.accountable',
    approvedAt, validFrom: approvedAt, validUntil,
    providerId: 'openai', modelId: 'model-explicitly-authorized', promptVersion: 'knowledge-enrichment-v1',
    allowedCaptureIds: captureIds,
    dataEgress: { sourceText: true, metadata: ['captureId', 'sourceHash'], classification: 'approved pilot cohort only' },
    limits: { maxCalls: 20, maxInputBytes: 65536, maxOutputTokens: 800, timeoutMs: 2000 },
  }), { mode: 0o640 });
  writeFileSync(apiKeyFile, 'authorization-request-secret-never-exposed\n', { mode: 0o400 });
  chmodSync(apiKeyFile, 0o400);
  const policy = readEnrichmentJobPolicy({ policyFile, now });
  writeFileSync(planFile, JSON.stringify({
    schemaVersion: 'doccanvas-enrichment-pilot-plan-v1', pilotId: 'pilot.authorization.request.020',
    jobId: policy.policy.jobId, jobPolicyHash: policy.policyHash,
    createdAt: approvedAt, validUntil, cohortCaptureIds: captureIds,
    humanGold: {
      assignmentId: 'gold.assignment.authorization.request.020', annotator: 'reviewer.independent',
      dueAt: goldDueAt, requiredCount: 20,
      independentSourceReview: true, modelOutputNotCopied: true,
    },
    stages: { canaryCalls: 1, batchCalls: 19, pauseAfterCanary: true },
  }), { mode: 0o640 });
  const plan = readPilotPlan({ planFile, now });
  return { dir, captureIds, policyFile, apiKeyFile, ledgerFile, planFile, policy, plan };
}

function requestOptions(value: ReturnType<typeof fixture>) {
  return {
    planFile: value.planFile,
    policyFile: value.policyFile,
    apiKeyFile: value.apiKeyFile,
    ledgerFile: value.ledgerFile,
    captureStoreDir: join(value.dir, 'captures'),
    enrichmentStoreDir: join(value.dir, 'enrichments'),
    goldStoreDir: join(value.dir, 'gold'),
    now: '2026-07-19T09:05:00Z',
  };
}

test('authorization request is a hashed L2 approval subject, not an authorization or provider call', () => {
  const value = fixture();
  const request = buildPilotAuthorizationRequest(requestOptions(value));
  assert.equal(request.schemaVersion, 'doccanvas-enrichment-authorization-request-v2');
  assert.equal(request.evidenceGrade, 'L2-fixture-or-dry-run');
  assert.equal(request.state, 'ready_for_receipt');
  assert.equal(request.requestedStage, 'canary');
  assert.equal(request.providerCall, false);
  assert.equal(request.authorizationGranted, false);
  assert.equal(request.executionAllowed, false);
  assert.equal(request.policyHash, value.policy.policyHash);
  assert.equal(request.planHash, value.plan.planHash);
  assert.deepEqual(request.requestedCaptureIds, [value.captureIds[0]]);
  assert.equal(request.ledgerBaseline.reservedCalls, 0);
  assert.equal(request.receiptTemplate?.stage, 'canary');
  assert.deepEqual(request.receiptTemplate?.allowedCaptureIds, [value.captureIds[0]]);
  assert.match(request.requestHash, /^sha256:[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(request), /authorization-request-secret-never-exposed|Private source body|\/tmp\//u);
  assert.equal(existsSync(value.ledgerFile), false);
});

test('a present receipt is reported without allowing the request artifact to grant authorization', () => {
  const value = fixture();
  const stageAuthorizationFile = join(value.dir, 'stage-authorization.json');
  writeFileSync(stageAuthorizationFile, JSON.stringify({
    schemaVersion: 'doccanvas-enrichment-stage-authorization-v1', authorizationId: 'stage.authorization.request.canary.001',
    pilotId: value.plan.plan.pilotId, pilotPlanHash: value.plan.planHash, jobPolicyHash: value.policy.policyHash,
    stage: 'canary', authorizedBy: 'owner.canary.approver', authorizedAt: '2026-07-19T09:00:00Z',
    validUntil: '2026-07-19T10:00:00Z', expectedReservedCalls: 0, maxNewCalls: 1,
    allowedCaptureIds: [value.captureIds[0]],
  }), { mode: 0o640 });
  const request = buildPilotAuthorizationRequest({ ...requestOptions(value), stageAuthorizationFile });
  assert.equal(request.state, 'receipt_present');
  assert.equal(request.executionAllowed, true);
  assert.equal(request.authorizationGranted, false);
  assert.equal(request.stageAuthorizationId, 'stage.authorization.request.canary.001');
  assert.match(request.stageAuthorizationHash ?? '', /^sha256:[a-f0-9]{64}$/u);
  assert.equal(existsSync(value.ledgerFile), false);
});

test('a consumed canary receipt is not repackaged as a fresh authorization request', async () => {
  const value = fixture();
  const stageAuthorizationFile = join(value.dir, 'stage-authorization.json');
  writeFileSync(stageAuthorizationFile, JSON.stringify({
    schemaVersion: 'doccanvas-enrichment-stage-authorization-v1', authorizationId: 'stage.authorization.request.consumed.001',
    pilotId: value.plan.plan.pilotId, pilotPlanHash: value.plan.planHash, jobPolicyHash: value.policy.policyHash,
    stage: 'canary', authorizedBy: 'owner.canary.approver', authorizedAt: '2026-07-19T09:00:00Z',
    validUntil: '2026-07-19T10:00:00Z', expectedReservedCalls: 0, maxNewCalls: 1,
    allowedCaptureIds: [value.captureIds[0]],
  }), { mode: 0o640 });
  const gateOptions = { ...requestOptions(value), stageAuthorizationFile };
  const runtime = createAuthorizedProviderRuntime({
    policyFile: value.policyFile, apiKeyFile: value.apiKeyFile, ledgerFile: value.ledgerFile,
    now: () => '2026-07-19T09:05:00Z', reservationGate: createPilotReservationGate({ ...gateOptions, now: () => '2026-07-19T09:05:00Z' }),
    transport: async () => new Response(JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
        schemaVersion: 'doccanvas-enrichment-draft-v1', title: 'Authorization source',
        summary: 'Private source body must not enter the request pack.',
        keyPoints: [{ text: 'Evidence.', evidenceLocators: [{ startLine: 5, endLine: 5 }] }],
        classification: {
          objectType: 'tip', knowledgeForm: { primary: 'procedure', subform: 'technique' },
          domainRefs: ['ai-product.evaluation.pilot'], evidenceLocators: [{ startLine: 1, endLine: 5 }],
        },
        abstentions: [],
      }) }] }],
      usage: { input_tokens: 40, output_tokens: 20, total_tokens: 60 },
    }), { status: 200 }),
  });
  await runEnrichment({
    storeDir: join(value.dir, 'enrichments'), captureStoreDir: join(value.dir, 'captures'),
    captureId: value.captureIds[0]!, actor: 'owner.test', mutationId: 'enrichment.authorization.request.consumed.001',
    enrichedAt: '2026-07-19T09:05:00Z', promptVersion: runtime.promptVersion,
    executor: runtime.executor, policy: runtime.policy,
  });
  const request = buildPilotAuthorizationRequest({ ...requestOptions(value), stageAuthorizationFile });
  assert.equal(request.state, 'blocked');
  assert.equal(request.requestedStage, null);
  assert.deepEqual(request.requestedCaptureIds, []);
  assert.equal(request.executionAllowed, false);
});

test('disabled request and protected API remain honest when no pilot configuration exists', async () => {
  const disabled = disabledPilotAuthorizationRequest('pilot_plan_not_configured', '2026-07-19T09:05:00Z');
  assert.equal(disabled.state, 'not_configured');
  assert.equal(disabled.authorizationGranted, false);
  assert.deepEqual(disabled.requestedCaptureIds, []);
  assert.match(disabled.requestHash, /^sha256:[a-f0-9]{64}$/u);

  const previousMode = process.env.DOCCANVAS_WRITE_MODE;
  const previousPlan = process.env.DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE;
  const mutableEnv = process.env as { NODE_ENV?: string };
  const previousNodeEnv = mutableEnv.NODE_ENV;
  delete process.env.DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE;
  try {
    delete process.env.DOCCANVAS_WRITE_MODE;
    mutableEnv.NODE_ENV = 'production';
    const readonly = await getAuthorizationRequest(new NextRequest('http://localhost/api/knowledge/enrichments/pilot/authorization-request'));
    assert.equal(readonly.status, 403);
    process.env.DOCCANVAS_WRITE_MODE = 'dev';
    mutableEnv.NODE_ENV = 'development';
    const response = await getAuthorizationRequest(new NextRequest('http://localhost/api/knowledge/enrichments/pilot/authorization-request'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const payload = await response.json();
    assert.equal(payload.request.state, 'not_configured');
    assert.equal(payload.request.providerCall, false);
  } finally {
    if (previousMode === undefined) delete process.env.DOCCANVAS_WRITE_MODE;
    else process.env.DOCCANVAS_WRITE_MODE = previousMode;
    if (previousPlan === undefined) delete process.env.DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE;
    else process.env.DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE = previousPlan;
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previousNodeEnv;
  }
});

test('operator CLI writes a create-only request pack and never creates a ledger', () => {
  const value = fixture(new Date().toISOString());
  const output = join(value.dir, 'authorization-request.json');
  const env = {
    ...process.env,
    DOCCANVAS_ENRICHMENT_MODE: 'provider',
    DOCCANVAS_ENRICHMENT_PROVIDER: 'openai',
    DOCCANVAS_ENRICHMENT_MODEL: 'model-explicitly-authorized',
    DOCCANVAS_ENRICHMENT_JOB_POLICY_FILE: value.policyFile,
    DOCCANVAS_ENRICHMENT_API_KEY_FILE: value.apiKeyFile,
    DOCCANVAS_ENRICHMENT_LEDGER_PATH: value.ledgerFile,
    DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE: value.planFile,
    DOCCANVAS_CAPTURE_STORE_PATH: join(value.dir, 'captures'),
    DOCCANVAS_ENRICHMENT_STORE_PATH: join(value.dir, 'enrichments'),
    DOCCANVAS_ENRICHMENT_GOLD_PATH: join(value.dir, 'gold'),
  };
  const first = spawnSync(process.execPath, [
    join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    join(process.cwd(), 'scripts', 'enrichment-pilot-authorization-request.ts'),
    '--output', output,
  ], { cwd: process.cwd(), env, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).state, 'ready_for_receipt');
  const original = readFileSync(output, 'utf8');
  const replay = spawnSync(process.execPath, [
    join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    join(process.cwd(), 'scripts', 'enrichment-pilot-authorization-request.ts'),
    '--output', output,
  ], { cwd: process.cwd(), env, encoding: 'utf8' });
  assert.notEqual(replay.status, 0);
  assert.equal(readFileSync(output, 'utf8'), original);
  assert.equal(existsSync(value.ledgerFile), false);
});
