import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ENRICHMENT_OUTPUT_JSON_SCHEMA } from '../lib/knowledge/enrichment-contract';
import type { EnrichmentExecutorInput } from '../lib/server/knowledge-enrichment-store';
import {
  ProviderRuntimeError,
  createConfiguredProviderRuntime,
  createDeepSeekChatCompletionsExecutor,
  createKimiChatCompletionsExecutor,
  readEnrichmentJobPolicy,
} from '../lib/server/knowledge-enrichment-provider';

function root(): string {
  return mkdtempSync(join(tmpdir(), 'doccanvas-enrichment-multi-provider-'));
}

function secretFile(dir: string): string {
  const file = join(dir, 'api-key');
  writeFileSync(file, 'secret-value-not-for-logs\n', { mode: 0o400 });
  chmodSync(file, 0o400);
  return file;
}

function input(): EnrichmentExecutorInput {
  return {
    captureId: 'capture-aaaaaaaaaaaaaaaaaaaaaaaa',
    sourceText: '# Retrieval evaluation\n\nUse a fixed human gold set.\n\n- Measure recall',
    sourceHash: `sha256:${'b'.repeat(64)}`,
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

function policy(providerId: 'deepseek' | 'kimi', modelId: string) {
  return {
    schemaVersion: 'doccanvas-enrichment-job-policy-v1',
    jobId: `job.${providerId}.pilot.001`,
    approvalId: `approval.${providerId}.001`,
    approvedBy: 'owner',
    approvedAt: '2026-07-20T00:00:00Z',
    validFrom: '2026-07-20T00:00:00Z',
    validUntil: '2026-07-20T02:00:00Z',
    providerId,
    modelId,
    promptVersion: 'knowledge-enrichment-v1',
    allowedCaptureIds: ['capture-aaaaaaaaaaaaaaaaaaaaaaaa'],
    dataEgress: {
      sourceText: true,
      metadata: ['captureId', 'sourceHash'],
      classification: 'selected source text and bounded provenance only',
    },
    limits: { maxCalls: 1, maxInputBytes: 24 * 1024, maxOutputTokens: 800, timeoutMs: 30_000 },
  };
}

test('job policy accepts only the explicit supported provider profiles', () => {
  const dir = root();
  for (const [providerId, modelId] of [['deepseek', 'deepseek-v4-flash'], ['kimi', 'kimi-k2.6']] as const) {
    const file = join(dir, `${providerId}.json`);
    writeFileSync(file, JSON.stringify(policy(providerId, modelId)), { mode: 0o640 });
    const loaded = readEnrichmentJobPolicy({ policyFile: file, now: '2026-07-20T01:00:00Z' });
    assert.equal(loaded.policy.providerId, providerId);
    assert.equal(loaded.policy.modelId, modelId);
  }
  const unsupported = join(dir, 'unsupported.json');
  writeFileSync(unsupported, JSON.stringify({ ...policy('deepseek', 'deepseek-v4-flash'), providerId: 'custom' }), { mode: 0o640 });
  assert.throws(
    () => readEnrichmentJobPolicy({ policyFile: unsupported, now: '2026-07-20T01:00:00Z' }),
    (error: unknown) => error instanceof ProviderRuntimeError && error.code === 'ENRICHMENT_JOB_POLICY_INVALID',
  );
});

test('DeepSeek executor forces one strict non-thinking function result and maps usage', async () => {
  const dir = root();
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const executor = createDeepSeekChatCompletionsExecutor({
    modelId: 'deepseek-v4-flash',
    apiKeyFile: secretFile(dir),
    transport: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        choices: [{
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant', content: null,
            tool_calls: [{
              id: 'call_1', type: 'function',
              function: { name: 'submit_doccanvas_enrichment', arguments: JSON.stringify(validDraft()) },
            }],
          },
        }],
        usage: { prompt_tokens: 41, completion_tokens: 23, total_tokens: 64 },
      }), { status: 200 });
    },
  });
  const result = await executor.execute(input());
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://api.deepseek.com/chat/completions');
  const body = JSON.parse(String(calls[0]?.init.body));
  assert.equal(body.model, 'deepseek-v4-flash');
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.max_tokens, 800);
  assert.equal(body.tools[0].function.strict, true);
  assert.deepEqual(body.tools[0].function.parameters, ENRICHMENT_OUTPUT_JSON_SCHEMA);
  assert.equal(body.tool_choice.function.name, 'submit_doccanvas_enrichment');
  assert.match(body.messages[0].content, /primary language: en/u);
  assert.match(body.messages[0].content, /exactly the allowed domain references/u);
  assert.match(body.messages[1].content, /allowedDomainRefs: ai-product\.evaluation\.retrieval/u);
  assert.deepEqual(result.output, validDraft());
  assert.deepEqual(result.usage, { inputTokens: 41, outputTokens: 23, totalTokens: 64 });
  assert.doesNotMatch(JSON.stringify(result), /secret-value-not-for-logs/u);
});

test('Kimi executor uses exact structured output with thinking disabled and maps usage', async () => {
  const dir = root();
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const executor = createKimiChatCompletionsExecutor({
    modelId: 'kimi-k2.6',
    apiKeyFile: secretFile(dir),
    transport: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(validDraft()) } }],
        usage: { prompt_tokens: 45, completion_tokens: 24, total_tokens: 69 },
      }), { status: 200 });
    },
  });
  const result = await executor.execute(input());
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://api.moonshot.cn/v1/chat/completions');
  const body = JSON.parse(String(calls[0]?.init.body));
  assert.equal(body.model, 'kimi-k2.6');
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.max_completion_tokens, 800);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.match(body.messages[0].content, /primary language: en/u);
  assert.match(body.messages[1].content, /allowedDomainRefs: ai-product\.evaluation\.retrieval/u);
  assert.deepEqual(body.response_format.json_schema.schema, ENRICHMENT_OUTPUT_JSON_SCHEMA);
  assert.deepEqual(result.output, validDraft());
  assert.deepEqual(result.usage, { inputTokens: 45, outputTokens: 24, totalTokens: 69 });
});

test('chat adapters fail closed on truncation or malformed output without retry or secret leakage', async () => {
  const dir = root();
  const key = secretFile(dir);
  for (const createExecutor of [createDeepSeekChatCompletionsExecutor, createKimiChatCompletionsExecutor]) {
    let calls = 0;
    const executor = createExecutor({
      modelId: createExecutor === createDeepSeekChatCompletionsExecutor ? 'deepseek-v4-flash' : 'kimi-k2.6',
      apiKeyFile: key,
      transport: async () => {
        calls += 1;
        return new Response(JSON.stringify({
          choices: [{ finish_reason: 'length', message: { role: 'assistant', content: 'sensitive partial output' } }],
        }), { status: 200 });
      },
    });
    await assert.rejects(
      () => executor.execute(input()),
      (error: unknown) => error instanceof ProviderRuntimeError
        && error.code === 'ENRICHMENT_PROVIDER_INCOMPLETE'
        && !error.message.includes('sensitive partial output')
        && !error.message.includes('secret-value-not-for-logs'),
    );
    assert.equal(calls, 1);
  }
});

test('configured runtime selects the exact policy-bound DeepSeek profile and keeps the atomic gate', async () => {
  const dir = root();
  const policyFile = join(dir, 'policy.json');
  const keyFile = secretFile(dir);
  const ledgerFile = join(dir, 'ledger.jsonl');
  writeFileSync(policyFile, JSON.stringify(policy('deepseek', 'deepseek-v4-flash')), { mode: 0o640 });
  const names = [
    'DOCCANVAS_ENRICHMENT_MODE', 'DOCCANVAS_ENRICHMENT_PROVIDER', 'DOCCANVAS_ENRICHMENT_MODEL',
    'DOCCANVAS_ENRICHMENT_JOB_POLICY_FILE', 'DOCCANVAS_ENRICHMENT_API_KEY_FILE', 'DOCCANVAS_ENRICHMENT_LEDGER_PATH',
  ] as const;
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.DOCCANVAS_ENRICHMENT_MODE = 'provider';
    process.env.DOCCANVAS_ENRICHMENT_PROVIDER = 'deepseek';
    process.env.DOCCANVAS_ENRICHMENT_MODEL = 'deepseek-v4-flash';
    process.env.DOCCANVAS_ENRICHMENT_JOB_POLICY_FILE = policyFile;
    process.env.DOCCANVAS_ENRICHMENT_API_KEY_FILE = keyFile;
    process.env.DOCCANVAS_ENRICHMENT_LEDGER_PATH = ledgerFile;
    let calls = 0;
    const runtime = createConfiguredProviderRuntime({
      now: () => '2026-07-20T01:00:00Z',
      reservationGate: context => assert.equal(context.captureId, input().captureId),
      transport: async url => {
        calls += 1;
        assert.equal(url, 'https://api.deepseek.com/chat/completions');
        return new Response(JSON.stringify({
          choices: [{
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant', content: null,
              tool_calls: [{
                id: 'call_1', type: 'function',
                function: { name: 'submit_doccanvas_enrichment', arguments: JSON.stringify(validDraft()) },
              }],
            },
          }],
          usage: { prompt_tokens: 41, completion_tokens: 23, total_tokens: 64 },
        }), { status: 200 });
      },
    });
    assert.equal(runtime.jobPolicy.providerId, 'deepseek');
    assert.equal(runtime.executor.providerId, 'deepseek');
    await runtime.executor.execute(input());
    assert.equal(calls, 1);

    process.env.DOCCANVAS_ENRICHMENT_PROVIDER = 'kimi';
    assert.throws(
      () => createConfiguredProviderRuntime({ now: () => '2026-07-20T01:00:00Z', reservationGate: () => undefined }),
      (error: unknown) => error instanceof ProviderRuntimeError && error.code === 'ENRICHMENT_PROVIDER_POLICY_MISMATCH',
    );
  } finally {
    for (const name of names) {
      const value = before[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
