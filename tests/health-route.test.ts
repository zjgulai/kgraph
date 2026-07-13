import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { extractMarkdownSections } from '../lib/markdown/sections';
import { createDocumentReadinessCache } from '../lib/server/document-readiness-cache';

const originalRoot = process.env.DOCCANVAS_ROOT;
const originalMode = process.env.DOCUMENT_PATH_MODE;
const originalNodeEnv = process.env.NODE_ENV;
const originalWriteMode = process.env.DOCCANVAS_WRITE_MODE;

process.env.DOCUMENT_PATH_MODE = 'prod';
Reflect.set(process.env, 'NODE_ENV', 'production');
process.env.DOCCANVAS_WRITE_MODE = 'readonly';
const root = mkdtempSync(join(tmpdir(), 'doccanvas-health-'));
process.env.DOCCANVAS_ROOT = root;

const routePromise = import('../app/api/health/route');
const handlerPromise = import('../lib/server/health-handler');

after(() => {
  rmSync(root, { recursive: true, force: true });
  restoreEnv('DOCCANVAS_ROOT', originalRoot);
  restoreEnv('DOCUMENT_PATH_MODE', originalMode);
  restoreEnv('NODE_ENV', originalNodeEnv);
  restoreEnv('DOCCANVAS_WRITE_MODE', originalWriteMode);
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function fixtureRoot() {
  rmSync(root, { recursive: true, force: true });
  for (const path of [
    'documents/user',
    'data/canvases',
    'data/canvas-states',
    'data/evolution-audit',
  ]) {
    mkdirSync(join(root, path), { recursive: true });
  }
  writeFileSync(join(root, 'documents/VibeTrack.md'), '# Vibe\n\n## Stage\n\nReady.\n');
  writeFileSync(join(root, 'documents/v2.7-Pro.md'), '# Pro\n\n## Stage\n\nReady.\n');
  writeFileSync(join(root, 'documents/Playbook-v2.md'), '# Playbook\n\n## Stage\n\nReady.\n');
  return root;
}

async function getHealth() {
  const { GET } = await routePromise;
  return GET();
}

test('health performs deep readonly readiness checks without exposing runtime versions', async () => {
  fixtureRoot();

  const response = await getHealth();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(body.status, 'ok');
  assert.equal(body.writePolicy.mode, 'readonly');
  assert.equal(body.nodeVersion, undefined);
  assert.equal(body.checks.registry.ok, true);
  assert.equal(body.checks.directories.length, 5);
  assert.equal(body.checks.directories.every((check: { ok: boolean }) => check.ok), true);
  assert.equal(body.documents.length, 3);
  assert.equal(body.documents.every((doc: { accessible: boolean; parseable: boolean; path: string }) => (
    doc.accessible && doc.parseable && doc.path.startsWith('./documents/')
  )), true);
});

test('health route is dynamic and returns valid no-store request metadata', async () => {
  fixtureRoot();

  const { dynamic, runtime } = await routePromise;
  const response = await getHealth();
  const body = await response.json();

  assert.equal(runtime, 'nodejs');
  assert.equal(dynamic, 'force-dynamic');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(new Date(body.timestamp).toISOString(), body.timestamp);
  assert.equal(Number.isFinite(body.uptime), true);
});

test('health handler reuses document parsing across unchanged requests', async () => {
  fixtureRoot();
  let parseCalls = 0;
  const cache = createDocumentReadinessCache(markdown => {
    parseCalls += 1;
    return extractMarkdownSections(markdown).length > 0;
  });
  const { createHealthHandler } = await handlerPromise;
  const handler = createHealthHandler(cache);

  const first = await handler();
  const second = await handler();

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(parseCalls, 3);
});

test('health invalidates cached readiness after a same-size atomic document replacement', async () => {
  const root = fixtureRoot();
  const documentPath = join(root, 'documents/VibeTrack.md');
  const replacementPath = join(root, 'documents/VibeTrack.replacement.md');
  const fixedTime = new Date('2026-01-01T00:00:00.000Z');
  utimesSync(documentPath, fixedTime, fixedTime);
  const initial = await getHealth();
  const original = statSync(documentPath, { bigint: true });
  const invalid = 'x'.repeat(Number(original.size));

  writeFileSync(replacementPath, invalid);
  utimesSync(replacementPath, fixedTime, fixedTime);
  const replacement = statSync(replacementPath, { bigint: true });
  assert.equal(replacement.size, original.size);
  assert.equal(replacement.mtimeNs, original.mtimeNs);
  renameSync(replacementPath, documentPath);
  const current = statSync(documentPath, { bigint: true });
  assert.equal(current.size, original.size);
  assert.equal(current.mtimeNs, original.mtimeNs);

  const response = await getHealth();
  const body = await response.json();
  const vibe = body.documents.find((doc: { id: string }) => doc.id === 'vibe-track');

  assert.equal(initial.status, 200);
  assert.equal(response.status, 503);
  assert.equal(vibe.accessible, true);
  assert.equal(vibe.parseable, false);
});

test('health fails closed without leaking absolute paths when the manifest is invalid', async () => {
  const root = fixtureRoot();
  writeFileSync(join(root, 'data/canvases/manifest.json'), '{invalid');

  const response = await getHealth();
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 503);
  assert.equal(body.status, 'degraded');
  assert.equal(body.checks.registry.ok, false);
  assert.equal(body.documents.length, 0);
  assert.equal(serialized.includes(root), false);
  assert.equal(body.nodeVersion, undefined);
});

test('health rejects a readable builtin document that has no parseable sections', async () => {
  const root = fixtureRoot();
  writeFileSync(join(root, 'documents/VibeTrack.md'), 'plain text without a heading\n');

  const response = await getHealth();
  const body = await response.json();
  const vibe = body.documents.find((doc: { id: string }) => doc.id === 'vibe-track');

  assert.equal(response.status, 503);
  assert.equal(body.status, 'degraded');
  assert.equal(vibe.accessible, true);
  assert.equal(vibe.parseable, false);
});
