import assert from 'node:assert/strict';
import {
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createDocumentReadinessCache } from '../lib/server/document-readiness-cache';

test('document readiness reuses unchanged parse results and invalidates changed or missing files', () => {
  const root = mkdtempSync(join(tmpdir(), 'doccanvas-readiness-cache-'));
  const documentPath = join(root, 'document.md');
  let parseCalls = 0;
  const cache = createDocumentReadinessCache(markdown => {
    parseCalls += 1;
    return /^##\s/m.test(markdown);
  });

  try {
    writeFileSync(documentPath, '# Document\n\n## Ready\n');
    assert.deepEqual(cache.check(documentPath), { accessible: true, parseable: true });
    assert.deepEqual(cache.check(documentPath), { accessible: true, parseable: true });
    assert.equal(parseCalls, 1);

    writeFileSync(documentPath, 'plain text without headings\n');
    assert.deepEqual(cache.check(documentPath), { accessible: true, parseable: false });
    assert.deepEqual(cache.check(documentPath), { accessible: true, parseable: false });
    assert.equal(parseCalls, 2);

    unlinkSync(documentPath);
    assert.deepEqual(cache.check(documentPath), { accessible: false, parseable: false });
    assert.equal(parseCalls, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('document readiness invalidates an atomic replacement even when size and mtime match', () => {
  const root = mkdtempSync(join(tmpdir(), 'doccanvas-readiness-replace-'));
  const documentPath = join(root, 'document.md');
  const replacementPath = join(root, 'replacement.md');
  const valid = '# Doc\n## Ready\n';
  const invalid = 'x'.repeat(Buffer.byteLength(valid));
  const fixedTime = new Date('2026-01-01T00:00:00.000Z');
  let parseCalls = 0;
  const cache = createDocumentReadinessCache(markdown => {
    parseCalls += 1;
    return /^##\s/m.test(markdown);
  });

  try {
    writeFileSync(documentPath, valid);
    utimesSync(documentPath, fixedTime, fixedTime);
    assert.equal(cache.check(documentPath).parseable, true);
    const original = statSync(documentPath, { bigint: true });

    writeFileSync(replacementPath, invalid);
    utimesSync(replacementPath, fixedTime, fixedTime);
    const replacement = statSync(replacementPath, { bigint: true });
    assert.equal(replacement.size, original.size);
    assert.equal(replacement.mtimeNs, original.mtimeNs);
    renameSync(replacementPath, documentPath);

    const current = statSync(documentPath, { bigint: true });
    assert.equal(current.size, original.size);
    assert.equal(current.mtimeNs, original.mtimeNs);
    assert.equal(cache.check(documentPath).parseable, false);
    assert.equal(parseCalls, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('document readiness retries and fails closed when the path changes during parsing', () => {
  const root = mkdtempSync(join(tmpdir(), 'doccanvas-readiness-drift-'));
  const documentPath = join(root, 'document.md');
  const replacementPath = join(root, 'replacement.md');
  const valid = '# Doc\n## Ready\n';
  const invalid = 'x'.repeat(Buffer.byteLength(valid));
  const fixedTime = new Date('2026-01-01T00:00:00.000Z');
  let parseCalls = 0;
  const cache = createDocumentReadinessCache(markdown => {
    parseCalls += 1;
    if (parseCalls === 1) renameSync(replacementPath, documentPath);
    return /^##\s/m.test(markdown);
  });

  try {
    writeFileSync(documentPath, valid);
    writeFileSync(replacementPath, invalid);
    utimesSync(documentPath, fixedTime, fixedTime);
    utimesSync(replacementPath, fixedTime, fixedTime);

    const original = statSync(documentPath, { bigint: true });
    const replacement = statSync(replacementPath, { bigint: true });
    assert.equal(replacement.size, original.size);
    assert.equal(replacement.mtimeNs, original.mtimeNs);

    assert.deepEqual(cache.check(documentPath), { accessible: true, parseable: false });
    assert.deepEqual(cache.check(documentPath), { accessible: true, parseable: false });
    assert.equal(parseCalls, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('document readiness prunes removed registry paths instead of growing stale entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'doccanvas-readiness-prune-'));
  const retainedPath = join(root, 'retained.md');
  const removedPath = join(root, 'removed.md');
  let parseCalls = 0;
  const cache = createDocumentReadinessCache(markdown => {
    parseCalls += 1;
    return markdown.length > 0;
  });

  try {
    writeFileSync(retainedPath, '# Retained\n');
    writeFileSync(removedPath, '# Removed\n');
    cache.check(retainedPath);
    cache.check(removedPath);
    assert.equal(parseCalls, 2);

    cache.retain([retainedPath]);
    cache.check(retainedPath);
    cache.check(removedPath);
    assert.equal(parseCalls, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
