import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { EnrichmentExecutorInput } from '../lib/server/knowledge-enrichment-store';
import { ENRICHMENT_OUTPUT_JSON_SCHEMA } from '../lib/knowledge/enrichment-contract';
import {
  ProviderRuntimeError,
  createAuthorizedProviderRuntime,
  createConfiguredProviderRuntime,
  createOpenAIResponsesExecutor,
  inspectConfiguredProviderRuntime,
  inspectProviderBudget,
  inspectProviderLedgerEvidence,
  readEnrichmentJobPolicy,
} from '../lib/server/knowledge-enrichment-provider';

function root(): string {
  return mkdtempSync(join(tmpdir(), 'doccanvas-enrichment-provider-'));
}

const captureId = 'capture-aaaaaaaaaaaaaaaaaaaaaaaa';
const sourceHash = `sha256:${'b'.repeat(64)}`;

function policy(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'doccanvas-enrichment-job-policy-v1',
    jobId: 'job.enrichment.pilot.001',
    approvalId: 'approval.owner.001',
    approvedBy: 'owner',
    approvedAt: '2026-07-19T08:00:00Z',
    validFrom: '2026-07-19T08:00:00Z',
    validUntil: '2026-07-19T10:00:00Z',
    providerId: 'openai',
    modelId: 'model-explicitly-authorized',
    promptVersion: 'knowledge-enrichment-v1',
    allowedCaptureIds: [captureId],
    dataEgress: {
      sourceText: true,
      metadata: ['captureId', 'sourceHash'],
      classification: 'owner-approved-capture-text',
    },
    limits: {
      maxCalls: 2,
      maxInputBytes: 64 * 1024,
      maxOutputTokens: 800,
      timeoutMs: 2_000,
    },
    ...overrides,
  };
}

function input(): EnrichmentExecutorInput {
  return {
    captureId,
    sourceText: '# Retrieval evaluation\n\nUse a fixed human gold set.\n\n- Measure recall',
    sourceHash,
    sourceLanguage: 'en',
    allowedDomainRefs: ['ai-product.evaluation.retrieval'],
    promptVersion: 'knowledge-enrichment-v1',
    maxOutputTokens: 800,
    outputSchema: ENRICHMENT_OUTPUT_JSON_SCHEMA,
  };
}

function validDraft() {
  return {
    schemaVersion: 'doccanvas-enrichment-draft-v1',
    title: 'Human-gold retrieval evaluation',
    summary: 'Use a fixed human gold set.',
    keyPoints: [{ text: 'Measure recall.', evidenceLocators: [{ startLine: 5, endLine: 5 }] }],
    classification: {
      objectType: 'tip',
      knowledgeForm: { primary: 'procedure', subform: 'technique' },
      domainRefs: ['ai-product.evaluation.retrieval'],
      evidenceLocators: [{ startLine: 3, endLine: 5 }],
    },
    abstentions: [],
  };
}

test('job policy is exact, time-bounded and symlink-safe', () => {
  const dir = root();
  const path = join(dir, 'policy.json');
  writeFileSync(path, JSON.stringify(policy()), { mode: 0o640 });
  const loaded = readEnrichmentJobPolicy({ policyFile: path, now: '2026-07-19T09:00:00Z' });
  assert.equal(loaded.policy.providerId, 'openai');
  assert.equal(loaded.policy.allowedCaptureIds[0], captureId);
  assert.match(loaded.policyHash, /^sha256:[a-f0-9]{64}$/u);

  const expired = join(dir, 'expired.json');
  writeFileSync(expired, JSON.stringify(policy()), { mode: 0o640 });
  assert.throws(
    () => readEnrichmentJobPolicy({ policyFile: expired, now: '2026-07-19T10:00:01Z' }),
    (error: unknown) => error instanceof ProviderRuntimeError && error.code === 'ENRICHMENT_JOB_EXPIRED',
  );
  const symlink = join(dir, 'policy-link.json');
  symlinkSync(path, symlink);
  assert.throws(
    () => readEnrichmentJobPolicy({ policyFile: symlink, now: '2026-07-19T09:00:00Z' }),
    (error: unknown) => error instanceof ProviderRuntimeError && error.code === 'ENRICHMENT_JOB_POLICY_SYMLINK_REJECTED',
  );
});

test('OpenAI Responses executor sends strict schema once and maps completed output and usage', async () => {
  const dir = root();
  const keyPath = join(dir, 'api-key');
  writeFileSync(keyPath, 'secret-value-not-for-logs\n', { mode: 0o400 });
  chmodSync(keyPath, 0o400);
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const executor = createOpenAIResponsesExecutor({
    modelId: 'model-explicitly-authorized',
    apiKeyFile: keyPath,
    transport: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(validDraft()) }] }],
        usage: { input_tokens: 41, output_tokens: 23, total_tokens: 64 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const result = await executor.execute(input());
  assert.equal(calls.length, 1, 'adapter must not retry implicitly');
  assert.equal(calls[0]?.url, 'https://api.openai.com/v1/responses');
  const body = JSON.parse(String(calls[0]?.init.body));
  assert.equal(body.store, false);
  assert.equal(body.model, 'model-explicitly-authorized');
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.equal(body.max_output_tokens, 800);
  assert.match(body.input[0].content, /primary language: en/u);
  assert.match(body.input[1].content, /allowedDomainRefs: ai-product\.evaluation\.retrieval/u);
  assert.deepEqual(result.output, validDraft());
  assert.deepEqual(result.usage, { inputTokens: 41, outputTokens: 23, totalTokens: 64 });
  assert.doesNotMatch(JSON.stringify(result), /secret-value-not-for-logs/u);
});

test('OpenAI Responses executor rejects refusal, incomplete and provider errors without leaking content or retrying', async () => {
  const dir = root();
  const keyPath = join(dir, 'api-key');
  writeFileSync(keyPath, 'secret-value-not-for-logs\n', { mode: 0o400 });
  const cases = [
    {
      response: { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'sensitive refusal details' }] }] },
      code: 'OPENAI_ENRICHMENT_REFUSED',
    },
    {
      response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] },
      code: 'OPENAI_ENRICHMENT_INCOMPLETE',
    },
  ];
  for (const item of cases) {
    let calls = 0;
    const executor = createOpenAIResponsesExecutor({
      modelId: 'model-explicitly-authorized', apiKeyFile: keyPath,
      transport: async () => { calls += 1; return new Response(JSON.stringify(item.response), { status: 200 }); },
    });
    await assert.rejects(
      () => executor.execute(input()),
      (error: unknown) => error instanceof ProviderRuntimeError
        && error.code === item.code
        && !error.message.includes('sensitive refusal details')
        && !error.message.includes('secret-value-not-for-logs'),
    );
    assert.equal(calls, 1);
  }
});

test('authorized runtime enforces capture allowlist and fail-closed call budget with a hash-chain ledger', async () => {
  const dir = root();
  const policyFile = join(dir, 'policy.json');
  const keyFile = join(dir, 'api-key');
  const ledgerFile = join(dir, 'ledger.jsonl');
  writeFileSync(policyFile, JSON.stringify(policy({ limits: { maxCalls: 1, maxInputBytes: 64 * 1024, maxOutputTokens: 800, timeoutMs: 2_000 } })), { mode: 0o640 });
  writeFileSync(keyFile, 'secret-value-not-for-logs\n', { mode: 0o400 });
  let calls = 0;
  const runtime = createAuthorizedProviderRuntime({
    policyFile, apiKeyFile: keyFile, ledgerFile, now: () => '2026-07-19T09:00:00Z',
    transport: async () => {
      calls += 1;
      return new Response(JSON.stringify({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(validDraft()) }] }],
        usage: { input_tokens: 41, output_tokens: 23, total_tokens: 64 },
      }), { status: 200 });
    },
  });
  assert.equal(runtime.policy.allowedExecutionModes[0], 'provider');
  assert.equal(runtime.promptVersion, 'knowledge-enrichment-v1');
  await runtime.executor.execute(input());
  assert.equal(calls, 1);
  assert.throws(
    () => inspectProviderBudget({ policyFile, ledgerFile, now: '2026-07-19T09:00:00Z' }),
    (error: unknown) => error instanceof ProviderRuntimeError && error.code === 'ENRICHMENT_JOB_CALL_BUDGET_EXHAUSTED',
  );
  await assert.rejects(
    () => runtime.executor.execute(input()),
    (error: unknown) => error instanceof ProviderRuntimeError && error.code === 'ENRICHMENT_JOB_CALL_BUDGET_EXHAUSTED',
  );
  assert.equal(calls, 1);
  const ledger = readFileSync(ledgerFile, 'utf8');
  assert.match(ledger, /"event":"reserve"/u);
  assert.match(ledger, /"event":"succeeded"/u);
  assert.doesNotMatch(ledger, /secret-value-not-for-logs/u);
  const evidence = inspectProviderLedgerEvidence({ policyFile, ledgerFile, now: '2026-07-19T09:00:00Z' });
  assert.equal((evidence.budget as unknown as Record<string, unknown>).providerCompletedCalls, 1);
  assert.equal('succeededCalls' in evidence.budget, false);
  assert.equal((evidence.reservations[0] as unknown as Record<string, unknown>).providerStatus, 'provider_succeeded');
  assert.equal('status' in evidence.reservations[0]!, false);

  const wrongCapture = { ...input(), captureId: 'capture-cccccccccccccccccccccccc' };
  await assert.rejects(
    () => createAuthorizedProviderRuntime({
      policyFile, apiKeyFile: keyFile, ledgerFile: join(dir, 'second-ledger.jsonl'), now: () => '2026-07-19T09:00:00Z',
      transport: async () => { throw new Error('must not run'); },
    }).executor.execute(wrongCapture),
    (error: unknown) => error instanceof ProviderRuntimeError && error.code === 'ENRICHMENT_CAPTURE_NOT_AUTHORIZED',
  );
});

test('configured runtime is ready only with an exact environment-policy match and duplicate requests cannot double-call', async () => {
  const dir = root();
  const policyFile = join(dir, 'policy.json');
  const keyFile = join(dir, 'api-key');
  const ledgerFile = join(dir, 'ledger.jsonl');
  writeFileSync(policyFile, JSON.stringify(policy()), { mode: 0o640 });
  writeFileSync(keyFile, 'secret-value-not-for-logs\n', { mode: 0o400 });
  const names = [
    'DOCCANVAS_ENRICHMENT_MODE', 'DOCCANVAS_ENRICHMENT_PROVIDER', 'DOCCANVAS_ENRICHMENT_MODEL',
    'DOCCANVAS_ENRICHMENT_JOB_POLICY_FILE', 'DOCCANVAS_ENRICHMENT_API_KEY_FILE', 'DOCCANVAS_ENRICHMENT_LEDGER_PATH',
  ] as const;
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.DOCCANVAS_ENRICHMENT_MODE = 'provider';
    process.env.DOCCANVAS_ENRICHMENT_PROVIDER = 'openai';
    process.env.DOCCANVAS_ENRICHMENT_MODEL = 'model-explicitly-authorized';
    process.env.DOCCANVAS_ENRICHMENT_JOB_POLICY_FILE = policyFile;
    process.env.DOCCANVAS_ENRICHMENT_API_KEY_FILE = keyFile;
    process.env.DOCCANVAS_ENRICHMENT_LEDGER_PATH = ledgerFile;
    const status = inspectConfiguredProviderRuntime('2026-07-19T09:00:00Z');
    assert.equal(status.ready, true);
    assert.equal(status.reason, 'authorized_job_ready');
    assert.equal(status.budget?.remainingCalls, 2);
    assert.throws(
      () => createConfiguredProviderRuntime(),
      (error: unknown) => error instanceof ProviderRuntimeError && error.code === 'ENRICHMENT_PILOT_STAGE_GATE_REQUIRED',
    );
    let calls = 0;
    const runtime = createConfiguredProviderRuntime({
      now: () => '2026-07-19T09:00:00Z',
      reservationGate: context => {
        assert.equal(context.captureId, 'capture-aaaaaaaaaaaaaaaaaaaaaaaa');
        assert.equal(context.reservations.length, 0);
      },
      transport: async () => {
        calls += 1;
        return new Response(JSON.stringify({
          status: 'completed',
          output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(validDraft()) }] }],
          usage: { input_tokens: 41, output_tokens: 23, total_tokens: 64 },
        }), { status: 200 });
      },
    });
    await runtime.executor.execute(input());
    await assert.rejects(
      () => runtime.executor.execute(input()),
      (error: unknown) => error instanceof ProviderRuntimeError && error.code === 'ENRICHMENT_JOB_REQUEST_ALREADY_RESERVED',
    );
    assert.equal(calls, 1);

    writeFileSync(policyFile, JSON.stringify(policy({ approvalId: 'approval.owner.002' })), { mode: 0o640 });
    assert.throws(
      () => inspectProviderBudget({ policyFile, ledgerFile, now: '2026-07-19T09:00:00Z' }),
      (error: unknown) => error instanceof ProviderRuntimeError && error.code === 'ENRICHMENT_JOB_POLICY_DRIFT',
    );
  } finally {
    for (const name of names) {
      const value = before[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
