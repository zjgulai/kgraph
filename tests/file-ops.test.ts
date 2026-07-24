import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs, { existsSync, linkSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test, { type TestContext } from 'node:test';
import { atomicWriteJson, atomicWriteText, withFileLock } from '../lib/server/file-ops';

const DEAD_PID = 2_147_483_647;
const STALE_CREATED_AT = Date.now() - 31_000;

function createFixture(t: TestContext) {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'doccanvas-file-lock-'));
  const lockPath = join(fixtureDir, 'fixture.lock');
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));
  return lockPath;
}

function readJournalRecords(journalPath: string): Array<Record<string, unknown>> {
  return readFileSync(journalPath, 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as Record<string, unknown>);
}

test('atomic data writes enforce private directory and file modes independently of process umask', (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'doccanvas-atomic-write-'));
  const nestedDir = join(fixtureDir, 'nested');
  const filePath = join(nestedDir, 'record.json');
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));

  const previousUmask = process.umask(0);
  try {
    atomicWriteJson(filePath, { ok: true });
    atomicWriteText(filePath, 'updated\n');
  } finally {
    process.umask(previousUmask);
  }

  assert.equal(statSync(nestedDir).mode & 0o777, 0o750);
  assert.equal(statSync(filePath).mode & 0o777, 0o640);
  assert.equal(readFileSync(filePath, 'utf-8'), 'updated\n');
  assert.deepEqual(fs.readdirSync(nestedDir), ['record.json']);
});

test('writes pid and numeric createdAt metadata while holding a lock', async (t) => {
  const lockPath = createFixture(t);
  const startedAt = Date.now();

  await withFileLock(lockPath, () => {
    const metadata = JSON.parse(readFileSync(lockPath, 'utf-8')) as Record<string, unknown>;
    assert.deepEqual(Object.keys(metadata).sort(), ['createdAt', 'pid', 'token']);
    assert.equal(metadata.pid, process.pid);
    assert.equal(typeof metadata.createdAt, 'number');
    assert.equal(typeof metadata.token, 'string');
    assert.ok((metadata.token as string).length >= 16);
    assert.ok((metadata.createdAt as number) >= startedAt);
    assert.ok((metadata.createdAt as number) <= Date.now());
  });

  assert.equal(existsSync(lockPath), false);
});

test('releases its token-owned lock when bind-mount inode observations drift', async (t) => {
  const lockPath = createFixture(t);
  const originalStatSync = fs.statSync;
  t.mock.method(fs, 'statSync', ((...args: Parameters<typeof fs.statSync>) => {
    const stat = Reflect.apply(originalStatSync, fs, args) as fs.Stats;
    if (String(args[0]) !== lockPath) return stat;
    return { ...stat, dev: stat.dev, ino: stat.ino + 1 } as fs.Stats;
  }) as typeof fs.statSync);

  const result = await withFileLock(lockPath, () => 'released');

  assert.equal(result, 'released');
  assert.equal(existsSync(lockPath), false);
});

test('preserves a replacement lock with a different token and reports cleanup failure', async (t) => {
  const lockPath = createFixture(t);
  const replacement = JSON.stringify({
    pid: process.pid,
    createdAt: Date.now(),
    token: 'replacement-owner-token',
  });

  await assert.rejects(withFileLock(lockPath, () => {
    rmSync(lockPath);
    writeFileSync(lockPath, replacement, 'utf-8');
  }), /File lock cleanup failed/);

  assert.equal(readFileSync(lockPath, 'utf-8'), replacement);
});

test('reclaims a lock older than 30 seconds when its valid pid is not alive', async (t) => {
  const lockPath = createFixture(t);
  writeFileSync(lockPath, JSON.stringify({ pid: DEAD_PID, createdAt: STALE_CREATED_AT }), 'utf-8');

  const result = await withFileLock(lockPath, () => 'recovered', 0);

  assert.equal(result, 'recovered');
  assert.equal(existsSync(lockPath), false);
});

test('does not reclaim a recent lock owned by a dead pid', async (t) => {
  const lockPath = createFixture(t);
  const metadata = JSON.stringify({ pid: DEAD_PID, createdAt: Date.now() });
  writeFileSync(lockPath, metadata, 'utf-8');
  let called = false;

  await assert.rejects(
    withFileLock(lockPath, () => { called = true; }, 0),
    /Could not acquire file lock/,
  );

  assert.equal(called, false);
  assert.equal(readFileSync(lockPath, 'utf-8'), metadata);
});

test('does not reclaim an old lock owned by a live pid', async (t) => {
  const lockPath = createFixture(t);
  const metadata = JSON.stringify({ pid: process.pid, createdAt: STALE_CREATED_AT });
  writeFileSync(lockPath, metadata, 'utf-8');
  let called = false;

  await assert.rejects(
    withFileLock(lockPath, () => { called = true; }, 0),
    /Could not acquire file lock/,
  );

  assert.equal(called, false);
  assert.equal(readFileSync(lockPath, 'utf-8'), metadata);
});

test('does not reclaim malformed lock metadata', async (t) => {
  const lockPath = createFixture(t);
  const malformed = JSON.stringify({ pid: 'not-a-pid', createdAt: STALE_CREATED_AT });
  writeFileSync(lockPath, malformed, 'utf-8');
  let called = false;

  await assert.rejects(
    withFileLock(lockPath, () => { called = true; }, 0),
    /Could not acquire file lock/,
  );

  assert.equal(called, false);
  assert.equal(readFileSync(lockPath, 'utf-8'), malformed);
});

for (const malformed of [
  { name: 'negative', createdAt: -1 },
  { name: 'fractional', createdAt: STALE_CREATED_AT + 0.5 },
  {
    name: 'unsafe integer',
    createdAt: Number.MAX_SAFE_INTEGER + 1,
    now: Number.MAX_SAFE_INTEGER + 100_001,
  },
]) {
  test(`does not reclaim ${malformed.name} createdAt metadata`, async (t) => {
    const lockPath = createFixture(t);
    if (malformed.now !== undefined) {
      t.mock.method(Date, 'now', () => malformed.now as number);
    }
    const metadata = JSON.stringify({ pid: DEAD_PID, createdAt: malformed.createdAt });
    writeFileSync(lockPath, metadata, 'utf-8');
    let called = false;

    await assert.rejects(
      withFileLock(lockPath, () => { called = true; }, 0),
      /Could not acquire file lock/,
    );

    assert.equal(called, false);
    assert.equal(readFileSync(lockPath, 'utf-8'), metadata);
  });
}

test('does not skip a sealed malformed earlier live recovery claim', async (t) => {
  const lockPath = createFixture(t);
  const journalPath = `${lockPath}.recovery-journal`;
  const metadata = JSON.stringify({ pid: DEAD_PID, createdAt: STALE_CREATED_AT });
  writeFileSync(lockPath, metadata, 'utf-8');
  writeFileSync(
    journalPath,
    `{"type":"claim","token":"earlier","claimantPid":${process.pid},"lock":BROKEN}\n`,
    'utf-8',
  );
  let called = false;

  await assert.rejects(withFileLock(lockPath, () => { called = true; }, 0));

  assert.equal(called, false);
  assert.equal(readFileSync(lockPath, 'utf-8'), metadata);
});

test('does not reclaim while the recovery journal has an unsealed tail partial', async (t) => {
  const lockPath = createFixture(t);
  const journalPath = `${lockPath}.recovery-journal`;
  const metadata = JSON.stringify({ pid: DEAD_PID, createdAt: STALE_CREATED_AT });
  writeFileSync(lockPath, metadata, 'utf-8');
  writeFileSync(journalPath, '{"type":"claim","token":"partial"', 'utf-8');
  let called = false;

  await assert.rejects(withFileLock(lockPath, () => { called = true; }, 0));

  assert.equal(called, false);
  assert.equal(readFileSync(lockPath, 'utf-8'), metadata);
});

test('serializes stale recovery across a real competing process', async (t) => {
  const lockPath = createFixture(t);
  const recoveryJournalPath = `${lockPath}.recovery-journal`;
  const enteredPath = `${lockPath}.entered`;
  const staleMetadata = JSON.stringify({ pid: DEAD_PID, createdAt: STALE_CREATED_AT });
  writeFileSync(lockPath, staleMetadata, 'utf-8');

  const holder = spawn(process.execPath, [
    '--eval',
    "console.log('HOLDER_READY'); setInterval(() => {}, 1_000);",
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (holder.exitCode === null) holder.kill('SIGKILL'); });
  let holderStdout = '';
  holder.stdout.on('data', chunk => { holderStdout += String(chunk); });
  while (!holderStdout.includes('HOLDER_READY')) {
    const exited = holder.exitCode !== null;
    assert.equal(exited, false, 'recovery holder exited before ready');
    await delay(10);
  }

  const lockStat = statSync(lockPath);
  writeFileSync(recoveryJournalPath, `${JSON.stringify({
    type: 'claim',
    token: 'holder-claim',
    claimantPid: holder.pid,
    lock: { dev: lockStat.dev, ino: lockStat.ino, createdAt: STALE_CREATED_AT },
  })}\n`, 'utf-8');

  const workerSource = [
    "import { writeFileSync } from 'node:fs';",
    "const loaded = await import('./lib/server/file-ops.ts');",
    'const { withFileLock } = loaded.default ?? loaded;',
    "console.log('READY');",
    `await withFileLock(${JSON.stringify(lockPath)}, () => {`,
    `  writeFileSync(${JSON.stringify(enteredPath)}, 'entered', 'utf-8');`,
    '}, 2_000);',
  ].join('\n');
  const child = spawn(process.execPath, [
    '--import', 'tsx',
    '--input-type=module',
    '--eval', workerSource,
  ], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  const exitPromise = once(child, 'exit');
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += String(chunk); });
  child.stderr.on('data', chunk => { stderr += String(chunk); });

  while (!stdout.includes('READY')) {
    const exited = child.exitCode !== null;
    assert.equal(exited, false, `worker exited before READY: ${stderr}`);
    await delay(10);
  }

  const claimDeadline = Date.now() + 2_000;
  let workerClaimObserved = false;
  while (!workerClaimObserved) {
    if (existsSync(recoveryJournalPath)) {
      workerClaimObserved = readJournalRecords(recoveryJournalPath).some(record =>
        record.type === 'claim' && record.claimantPid === child.pid);
    }
    assert.equal(child.exitCode, null, `worker exited before publishing claim: ${stderr}`);
    assert.ok(Date.now() < claimDeadline, 'worker did not publish a recovery claim before deadline');
    if (!workerClaimObserved) await delay(10);
  }

  const protectedWhileHeld = existsSync(lockPath)
    && readFileSync(lockPath, 'utf-8') === staleMetadata
    && !existsSync(enteredPath);
  holder.kill('SIGTERM');
  await once(holder, 'exit');

  const [exitCode, signal] = await exitPromise;
  assert.equal(protectedWhileHeld, true, 'competing reclaimer bypassed the live recovery claimant');
  assert.equal(exitCode, 0, `worker failed with signal ${signal}: ${stderr}`);
  assert.equal(readFileSync(enteredPath, 'utf-8'), 'entered');
});

test('finishes a crashed reclaimer hard-link claim without leaving recovery blocked', async (t) => {
  const lockPath = createFixture(t);
  const recoveryPath = `${lockPath}.recovery`;
  writeFileSync(lockPath, JSON.stringify({ pid: DEAD_PID, createdAt: STALE_CREATED_AT }), 'utf-8');
  linkSync(lockPath, recoveryPath);

  const result = await withFileLock(lockPath, () => 'recovered', 0);

  assert.equal(result, 'recovered');
  assert.equal(existsSync(lockPath), false);
  assert.equal(existsSync(recoveryPath), false);
});

test('removes its own lock when metadata writing fails', async (t) => {
  const lockPath = createFixture(t);
  const failure = Object.assign(new Error('injected metadata write failure'), { code: 'EIO' });
  const originalWriteFileSync = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', ((...args: Parameters<typeof fs.writeFileSync>) => {
    if (typeof args[0] === 'number') throw failure;
    return Reflect.apply(originalWriteFileSync, fs, args);
  }) as typeof fs.writeFileSync);
  let called = false;

  await assert.rejects(
    withFileLock(lockPath, () => { called = true; }),
    /Could not acquire file lock/,
  );

  assert.equal(called, false);
  assert.equal(existsSync(lockPath), false);
});

test('does not publish a main lock when candidate identity cannot be established', async (t) => {
  const lockPath = createFixture(t);
  const failure = Object.assign(new Error('injected candidate fstat failure'), { code: 'EIO' });
  const originalFstatSync = fs.fstatSync;
  let injected = false;
  t.mock.method(fs, 'fstatSync', ((...args: Parameters<typeof fs.fstatSync>) => {
    if (!injected) {
      injected = true;
      throw failure;
    }
    return Reflect.apply(originalFstatSync, fs, args);
  }) as typeof fs.fstatSync);
  let called = false;

  await assert.rejects(
    withFileLock(lockPath, () => { called = true; }),
    /Could not acquire file lock/,
  );

  assert.equal(called, false);
  assert.equal(existsSync(lockPath), false);
  assert.deepEqual(fs.readdirSync(dirname(lockPath)), []);
});

test('does not remove a replacement lock after metadata writing fails', async (t) => {
  const lockPath = createFixture(t);
  const replacement = JSON.stringify({ pid: process.pid, createdAt: Date.now() });
  const failure = Object.assign(new Error('injected metadata write failure'), { code: 'EIO' });
  const originalWriteFileSync = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', ((...args: Parameters<typeof fs.writeFileSync>) => {
    if (typeof args[0] === 'number') {
      originalWriteFileSync(lockPath, replacement, 'utf-8');
      throw failure;
    }
    return Reflect.apply(originalWriteFileSync, fs, args);
  }) as typeof fs.writeFileSync);

  await assert.rejects(
    withFileLock(lockPath, () => undefined),
    /Could not acquire file lock/,
  );

  assert.equal(readFileSync(lockPath, 'utf-8'), replacement);
});

test('releases a published recovery claim when claim processing throws', async (t) => {
  const lockPath = createFixture(t);
  const journalPath = `${lockPath}.recovery-journal`;
  writeFileSync(lockPath, JSON.stringify({ pid: DEAD_PID, createdAt: STALE_CREATED_AT }), 'utf-8');
  const injected = new Error('injected post-append failure');
  const originalWriteSync = fs.writeSync;
  let injectedOnce = false;
  t.mock.method(fs, 'writeSync', ((...args: Parameters<typeof fs.writeSync>) => {
    const payload = Buffer.isBuffer(args[1]) ? args[1].toString('utf-8') : String(args[1]);
    const written = Reflect.apply(originalWriteSync, fs, args);
    if (!injectedOnce && payload.includes('"type":"claim"')) {
      injectedOnce = true;
      throw injected;
    }
    return written;
  }) as typeof fs.writeSync);

  await assert.rejects(withFileLock(lockPath, () => undefined, 0), error => error === injected);

  const records = readJournalRecords(journalPath);
  const ownClaim = records.find(record => record.type === 'claim' && record.claimantPid === process.pid);
  assert.ok(ownClaim);
  assert.ok(records.some(record => record.type === 'release' && record.token === ownClaim.token));
});

test('releases a non-winner recovery claim on timeout', async (t) => {
  const lockPath = createFixture(t);
  const journalPath = `${lockPath}.recovery-journal`;
  writeFileSync(lockPath, JSON.stringify({ pid: DEAD_PID, createdAt: STALE_CREATED_AT }), 'utf-8');
  const lockStat = statSync(lockPath);
  writeFileSync(journalPath, `${JSON.stringify({
    type: 'claim',
    token: 'earlier-live-claim',
    claimantPid: process.pid,
    lock: { dev: lockStat.dev, ino: lockStat.ino, createdAt: STALE_CREATED_AT },
  })}\n`, 'utf-8');

  await assert.rejects(withFileLock(lockPath, () => undefined, 0), /Could not acquire file lock/);

  const records = readJournalRecords(journalPath);
  const ownClaim = records.find(record =>
    record.type === 'claim'
    && record.token !== 'earlier-live-claim'
    && record.claimantPid === process.pid);
  assert.ok(ownClaim);
  assert.ok(records.some(record => record.type === 'release' && record.token === ownClaim.token));
});

test('release failure prevents business work and removes the newly acquired main lock', async (t) => {
  const lockPath = createFixture(t);
  writeFileSync(lockPath, JSON.stringify({ pid: DEAD_PID, createdAt: STALE_CREATED_AT }), 'utf-8');
  const releaseFailure = new Error('injected release failure');
  const originalWriteSync = fs.writeSync;
  t.mock.method(fs, 'writeSync', ((...args: Parameters<typeof fs.writeSync>) => {
    const payload = Buffer.isBuffer(args[1]) ? args[1].toString('utf-8') : String(args[1]);
    if (payload.includes('"type":"release"')) throw releaseFailure;
    return Reflect.apply(originalWriteSync, fs, args);
  }) as typeof fs.writeSync);
  let called = false;

  await assert.rejects(withFileLock(lockPath, () => { called = true; }, 0));

  assert.equal(called, false);
  assert.equal(existsSync(lockPath), false);
});

test('close failure still attempts identity cleanup of the main lock', async (t) => {
  const lockPath = createFixture(t);
  const closeFailure = new Error('injected close failure');
  t.mock.method(fs, 'closeSync', () => { throw closeFailure; });

  await assert.rejects(withFileLock(lockPath, () => 'done'), error => {
    assert.ok(error instanceof AggregateError);
    assert.ok(error.errors.includes(closeFailure));
    return true;
  });

  assert.equal(existsSync(lockPath), false);
});

test('work error remains first when close cleanup also fails', async (t) => {
  const lockPath = createFixture(t);
  const workFailure = new Error('injected work failure');
  const closeFailure = new Error('injected close failure');
  t.mock.method(fs, 'closeSync', () => { throw closeFailure; });

  await assert.rejects(withFileLock(lockPath, () => { throw workFailure; }), error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[0], workFailure);
    assert.ok(error.errors.includes(closeFailure));
    return true;
  });

  assert.equal(existsSync(lockPath), false);
});

test('metadata write and close failures still attempt identity cleanup', async (t) => {
  const lockPath = createFixture(t);
  const metadataFailure = new Error('injected metadata write failure');
  const closeFailure = new Error('injected close failure');
  const originalWriteFileSync = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', ((...args: Parameters<typeof fs.writeFileSync>) => {
    if (typeof args[0] === 'number') throw metadataFailure;
    return Reflect.apply(originalWriteFileSync, fs, args);
  }) as typeof fs.writeFileSync);
  t.mock.method(fs, 'closeSync', () => { throw closeFailure; });

  await assert.rejects(withFileLock(lockPath, () => undefined), error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[0], metadataFailure);
    assert.ok(error.errors.includes(closeFailure));
    return true;
  });

  assert.equal(existsSync(lockPath), false);
});
