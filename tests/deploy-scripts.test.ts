import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOY_SCRIPT = join(ROOT, 'scripts/deploy-prepare.sh');
const VERIFY_SCRIPT = join(ROOT, 'scripts/verify-release.sh');
const SEEDS = [
  ['VibeTrack.md', 'VibeTrack.md'],
  ['v2.7-Pro.md', 'v2.7-Pro.md'],
  ['Playbook-v2.md', 'Playbook-v2.md'],
] as const;

function sha256(filePath: string) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function createDeployFixture(t: TestContext) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'doccanvas-deploy-'));
  const source = join(fixtureRoot, 'doccanvas');
  const bin = join(fixtureRoot, 'bin');
  const releases = join(fixtureRoot, 'releases');
  const runtime = join(fixtureRoot, 'runtime');
  const callLog = join(fixtureRoot, 'calls.log');
  mkdirSync(join(source, 'scripts'), { recursive: true });
  mkdirSync(join(source, 'documents'), { recursive: true });
  mkdirSync(join(source, '.next/standalone/.next'), { recursive: true });
  mkdirSync(join(source, '.next/static/chunks'), { recursive: true });
  mkdirSync(join(source, 'public'), { recursive: true });
  mkdirSync(bin);
  mkdirSync(releases);
  mkdirSync(runtime);

  writeFileSync(join(source, 'scripts/deploy-prepare.sh'), readFileSync(DEPLOY_SCRIPT));
  writeFileSync(join(source, 'scripts/verify-release.sh'), readFileSync(VERIFY_SCRIPT));
  chmodSync(join(source, 'scripts/deploy-prepare.sh'), 0o755);
  chmodSync(join(source, 'scripts/verify-release.sh'), 0o755);
  writeFileSync(join(source, 'package.json'), '{"name":"fixture"}\n');
  writeFileSync(join(source, 'package-lock.json'), '{"lockfileVersion":3}\n');
  writeFileSync(join(source, 'ecosystem.config.cjs'), 'module.exports = { apps: [] };\n');
  writeFileSync(join(source, 'nginx.conf'), 'server {}\n');
  writeFileSync(join(source, '.next/standalone/server.js'), '// fixture server\n');
  writeFileSync(join(source, '.next/standalone/.next/BUILD_ID'), 'fixture-build\n');
  writeFileSync(join(source, '.next/static/chunks/app.js'), 'fixture-static\n');
  writeFileSync(join(source, 'public/favicon.svg'), '<svg/>\n');
  for (const [sourceName] of SEEDS) {
    writeFileSync(join(source, 'documents', sourceName), `# ${sourceName}\n`);
  }

  const npmStub = join(bin, 'npm');
  writeFileSync(npmStub, `#!/usr/bin/env bash
set -eu
echo "$*" >> "$CALL_LOG"
if [[ "\${FAIL_NPM_COMMAND:-}" == "\${1:-}" ]]; then
  exit "\${FAIL_NPM_CODE:-42}"
fi
`);
  chmodSync(npmStub, 0o755);

  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  return { fixtureRoot, source, bin, releases, runtime, callLog };
}

function runDeploy(
  fixture: ReturnType<typeof createDeployFixture>,
  releaseDir: string,
  dataDir: string,
  env: Record<string, string> = {},
) {
  return spawnSync('bash', [join(fixture.source, 'scripts/deploy-prepare.sh'), releaseDir, dataDir], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH ?? ''}`,
      CALL_LOG: fixture.callLog,
      ...env,
    },
  });
}

test('deployment scripts expose a fail-closed, side-effect-free preparation contract', () => {
  const source = readFileSync(DEPLOY_SCRIPT, 'utf-8');

  assert.match(source, /set -Eeuo pipefail/);
  assert.match(source, /\$#\s+-ne\s+2/);
  assert.match(source, /npm ci --include=dev --no-audit --no-fund/);
  assert.match(source, /npm run verify:local/);
  assert.doesNotMatch(source, /^\s*pm2\s/m);
  assert.doesNotMatch(source, /^\s*(?:systemctl|nginx)\s/m);
  assert.doesNotMatch(source, /Deployment Complete/);
  assert.ok(existsSync(VERIFY_SCRIPT), 'verify-release.sh must exist');
  const verifier = readFileSync(VERIFY_SCRIPT, 'utf-8');
  assert.match(verifier, /--connect-timeout/);
  assert.match(verifier, /--max-time/);
  assert.match(verifier, /__doccanvas_build_id\.txt/);
  assert.match(verifier, /checks\?\.registry\?\.ok/);
  assert.match(verifier, /doc\.parseable/);
  assert.match(verifier, /health response leaks nodeVersion/);
});

test('PM2 config uses immutable release and mutable data paths with supported restart fields', () => {
  const source = readFileSync(join(ROOT, 'ecosystem.config.cjs'), 'utf-8');

  assert.match(source, /cwd:\s*['"]\/opt\/doccanvas\/current['"]/);
  assert.match(source, /DOCCANVAS_ROOT:\s*['"]\/var\/lib\/doccanvas['"]/);
  assert.match(source, /HOSTNAME:\s*['"]127\.0\.0\.1['"]/);
  assert.match(source, /kill_timeout:\s*15_?000/);
  assert.match(source, /exp_backoff_restart_delay:\s*100/);
  assert.doesNotMatch(source, /health_check|health_interval/);
  assert.doesNotMatch(source, /^\s*restart_delay\s*:/m);
});

test('Nginx config bounds requests and applies security headers and write rate limiting', () => {
  const source = readFileSync(join(ROOT, 'nginx.conf'), 'utf-8');

  assert.match(source, /client_max_body_size\s+3m;/);
  assert.match(source, /limit_req_zone/);
  assert.match(source, /limit_req_status\s+429;/);
  assert.match(source, /X-Content-Type-Options/);
  assert.match(source, /Content-Security-Policy|X-Frame-Options/);
  assert.match(source, /proxy_pass\s+http:\/\/127\.0\.0\.1:3200;/);
});

test('npm ci failure exits nonzero without publishing release or data', (t) => {
  const fixture = createDeployFixture(t);
  const releaseDir = join(fixture.releases, 'release-ci-fail');
  const dataDir = join(fixture.runtime, 'data-ci-fail');

  const result = runDeploy(fixture, releaseDir, dataDir, {
    FAIL_NPM_COMMAND: 'ci',
    FAIL_NPM_CODE: '42',
  });

  assert.equal(result.status, 42, result.stderr);
  assert.equal(existsSync(releaseDir), false);
  assert.equal(existsSync(dataDir), false);
  assert.doesNotMatch(result.stdout, /Release candidate prepared|Deployment Complete/);
  assert.equal(readFileSync(fixture.callLog, 'utf-8').trim(), 'ci --include=dev --no-audit --no-fund');
});

test('verification failure exits nonzero without publishing release or data', (t) => {
  const fixture = createDeployFixture(t);
  const releaseDir = join(fixture.releases, 'release-verify-fail');
  const dataDir = join(fixture.runtime, 'data-verify-fail');

  const result = runDeploy(fixture, releaseDir, dataDir, {
    FAIL_NPM_COMMAND: 'run',
    FAIL_NPM_CODE: '43',
  });

  assert.equal(result.status, 43, result.stderr);
  assert.equal(existsSync(releaseDir), false);
  assert.equal(existsSync(dataDir), false);
  assert.doesNotMatch(result.stdout, /Release candidate prepared|Deployment Complete/);
});

test('successful preparation copies standalone assets and seeds only missing documents', (t) => {
  const fixture = createDeployFixture(t);
  const releaseDir = join(fixture.releases, 'release-ok');
  const dataDir = join(fixture.runtime, 'data-ok');
  const preserved = join(dataDir, 'documents/VibeTrack.md');
  mkdirSync(dirname(preserved), { recursive: true });
  writeFileSync(preserved, '# owner-edited content\n');
  const before = sha256(preserved);

  const result = runDeploy(fixture, releaseDir, dataDir);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Release candidate prepared/);
  assert.doesNotMatch(result.stdout, /Deployment Complete/);
  assert.equal(sha256(preserved), before);
  assert.equal(readFileSync(preserved, 'utf-8'), '# owner-edited content\n');
  assert.ok(existsSync(join(dataDir, 'documents/v2.7-Pro.md')));
  assert.ok(existsSync(join(dataDir, 'documents/Playbook-v2.md')));
  assert.ok(existsSync(join(dataDir, 'documents/user')));
  assert.ok(existsSync(join(dataDir, 'data/canvases')));
  assert.ok(existsSync(join(releaseDir, '.next/standalone/server.js')));
  assert.ok(existsSync(join(releaseDir, '.next/standalone/public/favicon.svg')));
  assert.equal(
    readFileSync(join(releaseDir, '.next/standalone/public/__doccanvas_build_id.txt'), 'utf-8'),
    'fixture-build\n',
  );
  assert.ok(existsSync(join(releaseDir, '.next/standalone/.next/static/chunks/app.js')));
  assert.ok(existsSync(join(releaseDir, 'scripts/verify-release.sh')));
  assert.equal(
    readFileSync(fixture.callLog, 'utf-8').trim(),
    'ci --include=dev --no-audit --no-fund\nrun verify:local',
  );
});

test('missing seed fails before npm or partial data creation', (t) => {
  const fixture = createDeployFixture(t);
  unlinkSync(join(fixture.source, 'documents', SEEDS[2][0]));
  const releaseDir = join(fixture.releases, 'release-missing-seed');
  const dataDir = join(fixture.runtime, 'data-missing-seed');

  const result = runDeploy(fixture, releaseDir, dataDir);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing seed source/);
  assert.equal(existsSync(releaseDir), false);
  assert.equal(existsSync(dataDir), false);
  assert.equal(existsSync(fixture.callLog), false);
});

test('existing or overlapping release paths fail before npm', (t) => {
  const fixture = createDeployFixture(t);
  const existingRelease = join(fixture.releases, 'existing');
  mkdirSync(existingRelease);

  const existingResult = runDeploy(fixture, existingRelease, join(fixture.runtime, 'data-existing'));
  assert.notEqual(existingResult.status, 0);
  assert.match(existingResult.stderr, /release already exists/);

  const overlapResult = runDeploy(
    fixture,
    join(fixture.source, 'nested-release'),
    join(fixture.runtime, 'data-overlap'),
  );
  assert.notEqual(overlapResult.status, 0);
  assert.match(overlapResult.stderr, /release and source paths must not overlap/);
  assert.equal(existsSync(fixture.callLog), false);
});

test('dot-dot targets, publish locks, and nested data symlinks fail before npm', (t) => {
  const fixture = createDeployFixture(t);
  const dotParent = join(fixture.releases, 'dot-parent');
  mkdirSync(dotParent);
  const dotResult = runDeploy(
    fixture,
    `${dotParent}/..`,
    join(fixture.runtime, 'data-dot'),
  );
  assert.notEqual(dotResult.status, 0);
  assert.match(dotResult.stderr, /must not end in \. or \.\./);

  const lockedRelease = join(fixture.releases, 'locked-release');
  mkdirSync(`${lockedRelease}.publish-lock`);
  const lockResult = runDeploy(fixture, lockedRelease, join(fixture.runtime, 'data-locked'));
  assert.notEqual(lockResult.status, 0);
  assert.match(lockResult.stderr, /publication is locked/);

  const outside = join(fixture.fixtureRoot, 'outside-documents');
  const symlinkData = join(fixture.runtime, 'data-symlink');
  mkdirSync(outside);
  mkdirSync(symlinkData);
  symlinkSync(outside, join(symlinkData, 'documents'));
  const symlinkResult = runDeploy(
    fixture,
    join(fixture.releases, 'release-symlink'),
    symlinkData,
  );
  assert.notEqual(symlinkResult.status, 0);
  assert.match(symlinkResult.stderr, /data directory component is unsafe/);
  assert.equal(existsSync(fixture.callLog), false);
});

test('verify-release fails closed when required candidate artifacts are missing', (t) => {
  const fixture = createDeployFixture(t);
  const emptyRelease = join(fixture.releases, 'empty-release');
  const emptyData = join(fixture.runtime, 'empty-data');
  mkdirSync(emptyRelease);
  mkdirSync(emptyData);

  const result = spawnSync('bash', [VERIFY_SCRIPT, emptyRelease, emptyData], { encoding: 'utf-8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /required file missing or unsafe/);
  assert.doesNotMatch(result.stdout, /Release candidate verified/);
});
