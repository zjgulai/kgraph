import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import test from 'node:test';
import { readEnrichmentJobPolicy } from '../lib/server/knowledge-enrichment-provider';
import { readPilotPlan } from '../lib/server/knowledge-enrichment-pilot';
import { createEnrichmentUnlockPack } from '../lib/server/knowledge-enrichment-unlock-pack';

test('unlock pack compiles twenty real document sections without granting or calling Provider', () => {
  const parent = mkdtempSync(join(tmpdir(), 'doccanvas-unlock-pack-'));
  const outputDir = join(parent, 'pilot-001');
  const apiKeyFile = join(parent, 'secrets', 'openai-api-key');
  const now = '2026-07-19T16:00:00Z';

  const result = createEnrichmentUnlockPack({ outputDir, apiKeyFile, now });

  assert.equal(result.status, 'awaiting_secret_install');
  assert.equal(result.providerId, 'openai');
  assert.equal(result.modelId, 'gpt-5.6-terra');
  assert.equal(result.captureIds.length, 20);
  assert.equal(new Set(result.captureIds).size, 20);
  assert.equal(result.providerCall, false);
  assert.equal(result.ledgerWrite, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.evidenceGrade, 'L2-fixture-or-dry-run');

  const manifest = JSON.parse(readFileSync(join(outputDir, 'pack-manifest.json'), 'utf8'));
  assert.deepEqual(manifest.cohort.documentCounts, { 'playbook-v2': 7, 'v2-pro': 7, 'vibe-track': 6 });
  assert.equal(manifest.cohort.items.length, 20);
  assert.ok(manifest.cohort.items.every((item: { bytes: number }) => item.bytes > 0 && item.bytes <= 24 * 1024));
  assert.ok(manifest.cohort.items.every((item: { sourceHash: string }) => /^sha256:[a-f0-9]{64}$/u.test(item.sourceHash)));
  assert.equal(manifest.authorizationGranted, false);
  assert.equal(manifest.providerCall, false);
  assert.equal(manifest.ledgerWrite, false);
  assert.equal(manifest.modelSelection.inferenceMode, 'provider-default-medium');
  assert.equal(manifest.modelSelection.modelSource, 'https://developers.openai.com/api/docs/guides/latest-model');

  const policy = readEnrichmentJobPolicy({ policyFile: join(outputDir, 'job-policy.json'), now });
  const plan = readPilotPlan({ planFile: join(outputDir, 'pilot-plan.json'), now });
  assert.equal(policy.policy.modelId, 'gpt-5.6-terra');
  assert.equal(policy.policy.promptVersion, 'knowledge-enrichment-v2');
  assert.deepEqual(policy.policy.allowedCaptureIds, result.captureIds);
  assert.deepEqual(plan.plan.cohortCaptureIds, result.captureIds);
  assert.equal(plan.plan.jobPolicyHash, policy.policyHash);
  assert.equal(plan.planHash, result.planHash);
  assert.equal(policy.policyHash, result.policyHash);
  assert.equal(policy.policy.limits.maxCalls, 20);
  assert.equal(policy.policy.limits.maxInputBytes, 24 * 1024);
  assert.equal(policy.policy.limits.maxOutputTokens, 900);
  assert.equal(policy.policy.limits.timeoutMs, 30_000);
  assert.equal(plan.plan.humanGold.annotator, 'reviewer.independent');
  assert.notEqual(plan.plan.humanGold.annotator, policy.policy.approvedBy);

  const template = JSON.parse(readFileSync(join(outputDir, 'canary-stage-authorization.template.json'), 'utf8'));
  assert.equal(template.authorizationGranted, false);
  assert.deepEqual(template.requiredOperatorFields, ['authorizedBy', 'authorizedAt', 'validUntil']);
  assert.deepEqual(template.receipt.allowedCaptureIds, [result.captureIds[0]]);
  assert.equal(template.receipt.pilotPlanHash, result.planHash);
  assert.equal(template.receipt.jobPolicyHash, result.policyHash);
  assert.equal(template.receipt.authorizedBy, null);
  assert.equal(template.receipt.authorizedAt, null);
  assert.equal(template.receipt.validUntil, null);

  const serializedPublicArtifacts = [
    readFileSync(join(outputDir, 'pack-manifest.json'), 'utf8'),
    readFileSync(join(outputDir, 'operator-env.sh'), 'utf8'),
    readFileSync(join(outputDir, 'canary-stage-authorization.template.json'), 'utf8'),
  ].join('\n');
  assert.doesNotMatch(serializedPublicArtifacts, /BEGIN_UNTRUSTED_SOURCE|sk-[a-zA-Z0-9]/u);
  assert.equal(existsSync(apiKeyFile), false);
  assert.equal(existsSync(join(outputDir, 'provider-ledger.jsonl')), false);
  assert.equal(existsSync(join(outputDir, 'stage-authorization.json')), false);
  assert.equal(existsSync(join(outputDir, 'authorization-request.json')), false);
  assert.throws(() => createEnrichmentUnlockPack({ outputDir, apiKeyFile, now }), /UNLOCK_PACK_ALREADY_EXISTS/u);
});

test('unlock pack emits an exact DeepSeek primary pilot without changing the twenty-source cohort', () => {
  const parent = mkdtempSync(join(tmpdir(), 'doccanvas-unlock-pack-deepseek-'));
  const outputDir = join(parent, 'pilot-deepseek');
  const apiKeyFile = join(parent, 'secrets', 'deepseek-api-key');
  const now = '2026-07-20T01:00:00Z';
  const result = createEnrichmentUnlockPack({ outputDir, apiKeyFile, now, providerId: 'deepseek' });

  assert.equal(result.providerId, 'deepseek');
  assert.equal(result.modelId, 'deepseek-v4-flash');
  assert.equal(result.status, 'awaiting_secret_install');
  assert.equal(result.captureIds.length, 20);
  const manifest = JSON.parse(readFileSync(join(outputDir, 'pack-manifest.json'), 'utf8'));
  assert.equal(manifest.providerId, 'deepseek');
  assert.equal(manifest.modelSelection.inferenceMode, 'thinking-disabled');
  assert.equal(manifest.modelSelection.modelSource, 'https://api-docs.deepseek.com/quick_start/pricing');
  const policy = readEnrichmentJobPolicy({ policyFile: join(outputDir, 'job-policy.json'), now });
  assert.equal(policy.policy.providerId, 'deepseek');
  assert.equal(policy.policy.modelId, 'deepseek-v4-flash');
  assert.equal(policy.policy.promptVersion, 'knowledge-enrichment-v2');
  const env = readFileSync(join(outputDir, 'operator-env.sh'), 'utf8');
  assert.match(env, /DOCCANVAS_ENRICHMENT_PROVIDER='deepseek'/u);
  assert.match(env, /DOCCANVAS_ENRICHMENT_MODEL='deepseek-v4-flash'/u);
  assert.doesNotMatch(env, /secret-value|sk-/u);
  assert.equal(existsSync(apiKeyFile), false);
  assert.equal(existsSync(join(outputDir, 'provider-ledger.jsonl')), false);
});

test('unlock pack rejects relative output and secret paths before creating files', () => {
  const parent = mkdtempSync(join(tmpdir(), 'doccanvas-unlock-pack-invalid-'));
  assert.throws(() => createEnrichmentUnlockPack({
    outputDir: 'relative-pack',
    apiKeyFile: join(parent, 'openai-api-key'),
    now: '2026-07-19T16:00:00Z',
  }), /UNLOCK_PACK_OUTPUT_PATH_INVALID/u);
  assert.throws(() => createEnrichmentUnlockPack({
    outputDir: join(parent, 'pilot-001'),
    apiKeyFile: 'relative-secret',
    now: '2026-07-19T16:00:00Z',
  }), /UNLOCK_PACK_SECRET_PATH_INVALID/u);
  assert.equal(existsSync(join(parent, 'pilot-001')), false);

  const realParent = mkdtempSync(join(tmpdir(), 'doccanvas-unlock-pack-real-'));
  const linkedParent = join(parent, 'linked-parent');
  symlinkSync(realParent, linkedParent, 'dir');
  assert.throws(() => createEnrichmentUnlockPack({
    outputDir: join(linkedParent, 'pilot-002'),
    apiKeyFile: join(parent, 'openai-api-key'),
    now: '2026-07-19T16:00:00Z',
  }), /UNLOCK_PACK_OUTPUT_PARENT_INVALID/u);
  assert.equal(existsSync(join(realParent, 'pilot-002')), false);
});

test('operator CLI publishes one awaiting-secret pack and refuses overwrite', () => {
  const parent = mkdtempSync(join(tmpdir(), 'doccanvas-unlock-pack-cli-'));
  const outputDir = join(parent, 'pilot-cli');
  const apiKeyFile = join(parent, 'secrets', 'openai-api-key');
  const args = [
    join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    join(process.cwd(), 'scripts', 'enrichment-pilot-unlock-pack.ts'),
    '--output-dir', outputDir,
    '--api-key-file', apiKeyFile,
  ];
  const first = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(first.status, 2, first.stderr);
  assert.equal(JSON.parse(first.stdout).status, 'awaiting_secret_install');
  const manifest = readFileSync(join(outputDir, 'pack-manifest.json'), 'utf8');
  const replay = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(replay.status, 1);
  assert.match(replay.stderr, /UNLOCK_PACK_ALREADY_EXISTS/u);
  assert.equal(readFileSync(join(outputDir, 'pack-manifest.json'), 'utf8'), manifest);
  assert.equal(existsSync(join(outputDir, 'provider-ledger.jsonl')), false);
});
