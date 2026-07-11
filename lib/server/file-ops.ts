import fs from 'fs';
import { randomUUID } from 'crypto';
import { dirname } from 'path';

const STALE_LOCK_MS = 30_000;
let recoveryClaimSequence = 0;

interface LockMetadata {
  pid: number;
  createdAt: number;
}

interface FileIdentity {
  dev: number;
  ino: number;
}

interface LockSnapshot {
  identity: FileIdentity;
  metadata: LockMetadata;
}

interface RecoveryLockKey extends FileIdentity {
  createdAt: number;
}

interface RecoveryClaimEvent {
  type: 'claim';
  token: string;
  claimantPid: number;
  lock: RecoveryLockKey;
}

interface RecoveryReleaseEvent {
  type: 'release';
  token: string;
}

type RecoveryEvent = RecoveryClaimEvent | RecoveryReleaseEvent;

interface RecoveryJournal {
  events: RecoveryEvent[];
  trailingPartial: boolean;
}

interface RecoveryClaimOwnership {
  token: string;
  journalPath: string;
  releaseRequired: boolean;
}

class RecoveryJournalCorruptError extends Error {}

class FileLockOperationFailure extends Error {
  constructor(
    message: string,
    readonly original: unknown,
    readonly cleanupErrors: unknown[] = [],
  ) {
    super(message);
  }
}

interface PreparedLockCandidate {
  path: string;
  fd: number;
  identity: FileIdentity;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isLockMetadata(value: unknown): value is LockMetadata {
  if (!value || typeof value !== 'object') return false;
  const metadata = value as Record<string, unknown>;
  return Number.isSafeInteger(metadata.pid)
    && (metadata.pid as number) > 0
    && Number.isSafeInteger(metadata.createdAt)
    && (metadata.createdAt as number) >= 0;
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function identityFromFd(fd: number): FileIdentity {
  const stat = fs.fstatSync(fd);
  return { dev: stat.dev, ino: stat.ino };
}

function identityAtPath(filePath: string): FileIdentity | undefined {
  try {
    const stat = fs.statSync(filePath);
    return { dev: stat.dev, ino: stat.ino };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function sameIdentity(left: FileIdentity | undefined, right: FileIdentity) {
  return left?.dev === right.dev && left.ino === right.ino;
}

function removePathIfOwned(filePath: string, identity: FileIdentity) {
  if (!sameIdentity(identityAtPath(filePath), identity)) return false;
  try {
    fs.rmSync(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function prepareLockCandidate(lockPath: string): PreparedLockCandidate {
  const candidatePath = `${lockPath}.acquire.${process.pid}.${randomUUID()}`;
  let fd: number | undefined;

  try {
    fd = fs.openSync(candidatePath, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify({
      pid: process.pid,
      createdAt: Date.now(),
    }), 'utf-8');
    const identity = identityFromFd(fd);
    return { path: candidatePath, fd, identity };
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    if (fd !== undefined) {
      attemptCleanup(cleanupErrors, () => fs.closeSync(fd as number));
      attemptCleanup(cleanupErrors, () => fs.rmSync(candidatePath, { force: true }));
    }
    throw new FileLockOperationFailure(
      `Could not acquire file lock: ${lockPath}`,
      error,
      cleanupErrors,
    );
  }
}

function cleanupPreparedCandidate(candidate: PreparedLockCandidate) {
  const errors: unknown[] = [];
  attemptCleanup(errors, () => fs.closeSync(candidate.fd));
  attemptCleanup(errors, () => removePathIfOwned(candidate.path, candidate.identity));
  return errors;
}

function readLockSnapshot(lockPath: string): LockSnapshot | undefined {
  let fd: number;
  try {
    fd = fs.openSync(lockPath, 'r');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }

  try {
    const identity = identityFromFd(fd);
    let metadata: unknown;
    try {
      metadata = JSON.parse(fs.readFileSync(fd, 'utf-8'));
    } catch {
      return undefined;
    }
    if (!isLockMetadata(metadata)) return undefined;
    return { identity, metadata };
  } finally {
    fs.closeSync(fd);
  }
}

function isRecoveryLockKey(value: unknown): value is RecoveryLockKey {
  if (!value || typeof value !== 'object') return false;
  const key = value as Record<string, unknown>;
  return Number.isSafeInteger(key.dev)
    && Number.isSafeInteger(key.ino)
    && Number.isSafeInteger(key.createdAt)
    && (key.createdAt as number) >= 0;
}

function isRecoveryEvent(value: unknown): value is RecoveryEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (event.type === 'release') return typeof event.token === 'string';
  return event.type === 'claim'
    && typeof event.token === 'string'
    && Number.isSafeInteger(event.claimantPid)
    && (event.claimantPid as number) > 0
    && isRecoveryLockKey(event.lock);
}

function readRecoveryEvents(journalPath: string): RecoveryJournal {
  let raw: string;
  try {
    raw = fs.readFileSync(journalPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { events: [], trailingPartial: false };
    }
    throw error;
  }

  const events: RecoveryEvent[] = [];
  const sealed = raw.endsWith('\n');
  const lines = raw.split('\n');
  const sealedLineCount = sealed ? lines.length : Math.max(0, lines.length - 1);
  for (let index = 0; index < sealedLineCount; index += 1) {
    const line = lines[index] as string;
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (!isRecoveryEvent(value)) {
        throw new RecoveryJournalCorruptError(`Invalid sealed recovery event at line ${index + 1}`);
      }
      events.push(value);
    } catch (error) {
      if (error instanceof RecoveryJournalCorruptError) throw error;
      throw new RecoveryJournalCorruptError(`Malformed sealed recovery event at line ${index + 1}`);
    }
  }

  const trailingPartial = !sealed && Boolean(lines.at(-1)?.trim());
  return { events, trailingPartial };
}

function appendRecoveryEvent(journalPath: string, event: RecoveryEvent) {
  const fd = fs.openSync(journalPath, 'a');
  let primaryFailure: unknown;
  try {
    const record = Buffer.from(`\n${JSON.stringify(event)}\n`, 'utf-8');
    const written = fs.writeSync(fd, record, 0, record.length);
    if (written !== record.length) {
      throw new Error(`Incomplete recovery journal append: ${written}/${record.length} bytes`);
    }
  } catch (error) {
    primaryFailure = error;
  }

  let closeFailure: unknown;
  try {
    fs.closeSync(fd);
  } catch (error) {
    closeFailure = error;
  }

  if (primaryFailure !== undefined && closeFailure !== undefined) {
    throw new AggregateError(
      [primaryFailure, closeFailure],
      'Recovery journal append and close both failed',
      { cause: primaryFailure },
    );
  }
  if (primaryFailure !== undefined) throw primaryFailure;
  if (closeFailure !== undefined) {
    throw new AggregateError([closeFailure], 'Recovery journal close failed');
  }
}

function sameRecoveryKey(left: RecoveryLockKey, right: RecoveryLockKey) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.createdAt === right.createdAt;
}

function activeRecoveryClaims(events: RecoveryEvent[], key: RecoveryLockKey) {
  const released = new Set(
    events.filter((event): event is RecoveryReleaseEvent => event.type === 'release')
      .map(event => event.token),
  );
  return events.filter((event): event is RecoveryClaimEvent =>
    event.type === 'claim'
    && sameRecoveryKey(event.lock, key)
    && !released.has(event.token)
    && isProcessAlive(event.claimantPid));
}

function createRecoveryToken() {
  recoveryClaimSequence += 1;
  return `${process.pid}:${Date.now()}:${recoveryClaimSequence}`;
}

function ensureRecoveryHardLink(lockPath: string, observed: FileIdentity) {
  const recoveryPath = `${lockPath}.recovery`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.linkSync(lockPath, recoveryPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return undefined;
      if (code !== 'EEXIST') throw error;
    }

    const recoveryIdentity = identityAtPath(recoveryPath);
    if (sameIdentity(recoveryIdentity, observed)) return recoveryIdentity;
    if (recoveryIdentity) removePathIfOwned(recoveryPath, recoveryIdentity);
  }
  return undefined;
}

function reclaimStaleLock(lockPath: string, ownership: RecoveryClaimOwnership) {
  const snapshot = readLockSnapshot(lockPath);
  if (!snapshot) return false;
  if (Date.now() - snapshot.metadata.createdAt <= STALE_LOCK_MS) {
    return false;
  }
  if (isProcessAlive(snapshot.metadata.pid)) return false;

  const key: RecoveryLockKey = {
    ...snapshot.identity,
    createdAt: snapshot.metadata.createdAt,
  };
  let journal = readRecoveryEvents(ownership.journalPath);
  if (journal.trailingPartial) return false;
  let claimed = journal.events.some(event =>
    event.type === 'claim'
    && event.token === ownership.token
    && sameRecoveryKey(event.lock, key));
  if (!claimed) {
    ownership.releaseRequired = true;
    appendRecoveryEvent(ownership.journalPath, {
      type: 'claim',
      token: ownership.token,
      claimantPid: process.pid,
      lock: key,
    });
    claimed = true;
    journal = readRecoveryEvents(ownership.journalPath);
  }
  if (journal.trailingPartial) return false;

  const winner = activeRecoveryClaims(journal.events, key)[0];
  if (winner?.token !== ownership.token) return false;

  const recoveryIdentity = ensureRecoveryHardLink(lockPath, snapshot.identity);
  if (!recoveryIdentity) {
    return !fs.existsSync(lockPath);
  }

  const recoverySnapshot = readLockSnapshot(`${lockPath}.recovery`);
  const recoveryStillMatches = recoverySnapshot
    && sameIdentity(recoverySnapshot.identity, snapshot.identity)
    && recoverySnapshot.metadata.pid === snapshot.metadata.pid
    && recoverySnapshot.metadata.createdAt === snapshot.metadata.createdAt
    && Date.now() - recoverySnapshot.metadata.createdAt > STALE_LOCK_MS
    && !isProcessAlive(recoverySnapshot.metadata.pid);
  if (!recoveryStillMatches) {
    removePathIfOwned(`${lockPath}.recovery`, recoveryIdentity);
    return false;
  }

  let primaryFailure: unknown;
  let reclaimed = false;
  try {
    reclaimed = removePathIfOwned(lockPath, snapshot.identity);
  } catch (error) {
    primaryFailure = error;
  }
  let recoveryCleanupFailure: unknown;
  try {
    removePathIfOwned(`${lockPath}.recovery`, recoveryIdentity);
  } catch (error) {
    recoveryCleanupFailure = error;
  }
  if (primaryFailure !== undefined && recoveryCleanupFailure !== undefined) {
    throw new AggregateError(
      [primaryFailure, recoveryCleanupFailure],
      'Stale lock removal and hard-link cleanup both failed',
      { cause: primaryFailure },
    );
  }
  if (primaryFailure !== undefined) throw primaryFailure;
  if (recoveryCleanupFailure !== undefined) throw recoveryCleanupFailure;
  return reclaimed || !fs.existsSync(lockPath);
}

function releaseRecoveryClaim(ownership: RecoveryClaimOwnership) {
  if (!ownership.releaseRequired) return;
  appendRecoveryEvent(ownership.journalPath, {
    type: 'release',
    token: ownership.token,
  });
  ownership.releaseRequired = false;
}

function attemptCleanup(errors: unknown[], cleanup: () => void) {
  try {
    cleanup();
  } catch (error) {
    errors.push(error);
  }
}

function throwOutcome(
  primary: { error: unknown; message?: string } | undefined,
  cleanupErrors: unknown[],
) {
  if (primary) {
    if (cleanupErrors.length > 0 || primary.message) {
      throw new AggregateError(
        [primary.error, ...cleanupErrors],
        primary.message || 'File lock operation failed and cleanup also failed',
        { cause: primary.error },
      );
    }
    throw primary.error;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'File lock cleanup failed');
  }
}

export async function withFileLock<T>(
  lockPath: string,
  work: () => T | Promise<T>,
  timeoutMs = 3000
): Promise<T> {
  fs.mkdirSync(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  const ownership: RecoveryClaimOwnership = {
    token: createRecoveryToken(),
    journalPath: `${lockPath}.recovery-journal`,
    releaseRequired: false,
  };
  let fd: number | undefined;
  let ownedIdentity: FileIdentity | undefined;
  let publishedCandidatePath: string | undefined;
  let result: T | undefined;
  let primary: { error: unknown; message?: string } | undefined;
  const priorCleanupErrors: unknown[] = [];

  try {
    while (fd === undefined) {
      const candidate = prepareLockCandidate(lockPath);
      try {
        fs.linkSync(candidate.path, lockPath);
      } catch (error) {
        const candidateCleanupErrors = cleanupPreparedCandidate(candidate);
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EEXIST') {
          if (candidateCleanupErrors.length > 0) {
            throw new FileLockOperationFailure(
              `Could not acquire file lock: ${lockPath}`,
              candidateCleanupErrors[0],
              candidateCleanupErrors.slice(1),
            );
          }
          if (reclaimStaleLock(lockPath, ownership)) continue;
        } else {
          throw new FileLockOperationFailure(
            `Could not acquire file lock: ${lockPath}`,
            error,
            candidateCleanupErrors,
          );
        }
        if (Date.now() >= deadline) {
          throw new Error(`Could not acquire file lock: ${lockPath}`);
        }
        await sleep(50);
        continue;
      }

      fd = candidate.fd;
      ownedIdentity = candidate.identity;
      publishedCandidatePath = candidate.path;
      removePathIfOwned(candidate.path, candidate.identity);
      publishedCandidatePath = undefined;
    }

    releaseRecoveryClaim(ownership);
    result = await work();
  } catch (error) {
    if (error instanceof FileLockOperationFailure) {
      primary = { error: error.original, message: error.message };
      priorCleanupErrors.push(...error.cleanupErrors);
    } else {
      primary = { error };
    }
  }

  const cleanupErrors: unknown[] = [...priorCleanupErrors];
  if (fd !== undefined) {
    attemptCleanup(cleanupErrors, () => fs.closeSync(fd as number));
  }
  if (ownedIdentity !== undefined) {
    attemptCleanup(cleanupErrors, () => {
      removePathIfOwned(lockPath, ownedIdentity as FileIdentity);
    });
  }
  if (publishedCandidatePath !== undefined && ownedIdentity !== undefined) {
    attemptCleanup(cleanupErrors, () => {
      removePathIfOwned(publishedCandidatePath as string, ownedIdentity as FileIdentity);
    });
  }
  if (ownership.releaseRequired) {
    attemptCleanup(cleanupErrors, () => releaseRecoveryClaim(ownership));
  }

  throwOutcome(primary, cleanupErrors);
  return result as T;
}

export function atomicWriteText(filePath: string, content: string) {
  fs.mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, 'utf-8');
  fs.renameSync(tempPath, filePath);
}

export function atomicWriteJson(filePath: string, value: unknown) {
  atomicWriteText(filePath, JSON.stringify(value, null, 2) + '\n');
}
