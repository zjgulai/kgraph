import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { NextRequest } from 'next/server';

const originalRoot = process.env.DOCCANVAS_ROOT;
const originalNodeEnv = process.env.NODE_ENV;
const originalWriteMode = process.env.DOCCANVAS_WRITE_MODE;
const fixtureRoot = mkdtempSync(join(tmpdir(), 'doccanvas-api-boundaries-'));
process.env.DOCCANVAS_ROOT = fixtureRoot;
Reflect.set(process.env, 'NODE_ENV', 'test');
delete process.env.DOCCANVAS_WRITE_MODE;

after(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
  restoreEnv('DOCCANVAS_ROOT', originalRoot);
  restoreEnv('NODE_ENV', originalNodeEnv);
  restoreEnv('DOCCANVAS_WRITE_MODE', originalWriteMode);
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function jsonRequest(pathname: string, method: 'PATCH' | 'POST', body: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  });
}

function objectRequest(body: unknown): NextRequest {
  return {
    headers: new Headers(),
    json: async () => body,
  } as unknown as NextRequest;
}

function rejectingRequest(error: Error): NextRequest {
  return {
    headers: new Headers(),
    json: async () => { throw error; },
  } as unknown as NextRequest;
}

function assertNoWrites() {
  assert.deepEqual(readdirSync(fixtureRoot), []);
}

function patchPayload(content: string) {
  return {
    documentId: 'unknown-doc',
    heading: 'Boundary fixture',
    content,
  };
}

function canvasState(overrides: Record<string, unknown> = {}) {
  return {
    documentId: 'unknown-doc',
    layoutVersion: 2,
    layoutMode: 'architecture-house',
    graphFingerprint: 'sha256:api-schema-fixture',
    view: { kind: 'overview' },
    viewport: { x: 0, y: 0, zoom: 1 },
    expandedNodes: [],
    nodePositions: {},
    ...overrides,
  };
}

test('canvas-state POST rejects the legacy v1 schema', async () => {
  const { POST } = (await routesPromise)[1];
  const response = await POST(objectRequest({
    documentId: 'unknown-doc',
    viewport: { x: 0, y: 0, zoom: 1 },
    expandedNodes: [],
    nodePositions: {},
  }));

  assert.equal(response.status, 400);
  assertNoWrites();
});

test('canvas-state GET keeps legacy persisted state readable for a client-side safe reset', async () => {
  const stateDir = join(fixtureRoot, 'data/canvas-states');
  const legacy = {
    documentId: 'vibe-track',
    viewport: { x: 10, y: 20, zoom: 0.5 },
    expandedNodes: ['legacy-node'],
    nodePositions: { 'legacy-node': { x: 30, y: 40 } },
    lastSaved: '2026-07-10T00:00:00.000Z',
  };
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, 'vibe-track.json'), JSON.stringify(legacy));

  try {
    const { GET } = (await routesPromise)[1];
    const response = await GET(new NextRequest(
      'http://localhost/api/canvas-state?documentId=vibe-track',
    ));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), legacy);
  } finally {
    rmSync(join(fixtureRoot, 'data'), { recursive: true, force: true });
  }
  assertNoWrites();
});

const routesPromise = Promise.all([
  import('../app/api/documents/route'),
  import('../app/api/canvas-state/route'),
  import('../app/api/canvases/route'),
]);

type ParseJsonBody = (request: { json(): Promise<unknown> }) => Promise<
  { ok: true; value: unknown } | { ok: false }
>;

async function loadParseJsonBody(): Promise<ParseJsonBody | undefined> {
  const moduleUrl = new URL('../lib/server/parse-json-body.ts', import.meta.url).href;
  try {
    const loaded = await import(moduleUrl) as { parseJsonBody?: ParseJsonBody };
    return loaded.parseJsonBody;
  } catch {
    return undefined;
  }
}

test('shared parseJsonBody returns values and classifies only SyntaxError as malformed', async () => {
  const parseJsonBody = await loadParseJsonBody();
  assert.equal(typeof parseJsonBody, 'function', 'expected shared parseJsonBody helper');
  assert.ok(parseJsonBody);

  const value = { documentId: 'fixture' };
  assert.deepEqual(await parseJsonBody({ json: async () => value }), { ok: true, value });
  assert.deepEqual(
    await parseJsonBody({ json: async () => { throw new SyntaxError('malformed'); } }),
    { ok: false },
  );

  const transportFailure = new Error('transport failed');
  await assert.rejects(
    parseJsonBody({ json: async () => { throw transportFailure; } }),
    error => error === transportFailure,
  );
});

test('all JSON routes reuse the shared parseJsonBody helper', () => {
  for (const routeUrl of [
    new URL('../app/api/documents/route.ts', import.meta.url),
    new URL('../app/api/canvas-state/route.ts', import.meta.url),
    new URL('../app/api/canvases/route.ts', import.meta.url),
  ]) {
    const source = readFileSync(routeUrl, 'utf-8');
    assert.match(source, /from '@\/lib\/server\/parse-json-body'/);
    assert.doesNotMatch(source, /function readJson/);
  }
});

const malformedCases = [
  { name: 'documents PATCH', route: async (req: NextRequest) => (await routesPromise)[0].PATCH(req), path: '/api/documents', method: 'PATCH' as const },
  { name: 'documents POST', route: async (req: NextRequest) => (await routesPromise)[0].POST(req), path: '/api/documents', method: 'POST' as const },
  { name: 'canvas-state POST', route: async (req: NextRequest) => (await routesPromise)[1].POST(req), path: '/api/canvas-state', method: 'POST' as const },
  { name: 'canvases POST', route: async (req: NextRequest) => (await routesPromise)[2].POST(req), path: '/api/canvases', method: 'POST' as const },
];

for (const testCase of malformedCases) {
  test(`${testCase.name} returns 400 for malformed JSON without writing`, async () => {
    const response = await testCase.route(jsonRequest(testCase.path, testCase.method, '{"broken":'));

    assert.equal(response.status, 400);
    assertNoWrites();
  });
}

test('documents PATCH rejects markdown content larger than 2 MiB', async () => {
  const { PATCH } = (await routesPromise)[0];
  const response = await PATCH(jsonRequest(
    '/api/documents',
    'PATCH',
    JSON.stringify(patchPayload('x'.repeat(2 * 1024 * 1024 + 1))),
  ));

  assert.equal(response.status, 400);
  assertNoWrites();
});

test('documents PATCH accepts markdown content exactly 2 MiB through schema validation', async () => {
  const { PATCH } = (await routesPromise)[0];
  const response = await PATCH(jsonRequest(
    '/api/documents',
    'PATCH',
    JSON.stringify(patchPayload('x'.repeat(2 * 1024 * 1024))),
  ));

  assert.equal(response.status, 404);
  assertNoWrites();
});

test('canvas-state POST rejects more than 5,000 node positions', async () => {
  const { POST } = (await routesPromise)[1];
  const nodePositions = Object.fromEntries(
    Array.from({ length: 5_001 }, (_, index) => [`node-${index}`, { x: index, y: index }]),
  );
  const response = await POST(objectRequest(canvasState({ nodePositions })));

  assert.equal(response.status, 400);
  assertNoWrites();
});

test('canvas-state POST accepts exactly 5,000 node positions through schema validation', async () => {
  const { POST } = (await routesPromise)[1];
  const nodePositions = Object.fromEntries(
    Array.from({ length: 5_000 }, (_, index) => [`node-${index}`, { x: index, y: index }]),
  );
  const response = await POST(objectRequest(canvasState({ nodePositions })));

  assert.equal(response.status, 404);
  assertNoWrites();
});

test('canvas-state POST rejects non-finite viewport coordinates', async () => {
  const { POST } = (await routesPromise)[1];
  const response = await POST(objectRequest(canvasState({
    viewport: { x: Number.POSITIVE_INFINITY, y: 0, zoom: 1 },
  })));

  assert.equal(response.status, 400);
  assertNoWrites();
});

test('canvas-state POST rejects non-finite node coordinates', async () => {
  const { POST } = (await routesPromise)[1];
  const response = await POST(objectRequest(canvasState({
    nodePositions: { node: { x: 0, y: Number.NEGATIVE_INFINITY } },
  })));

  assert.equal(response.status, 400);
  assertNoWrites();
});

for (const zoom of [0.049, 4.001]) {
  test(`canvas-state POST rejects zoom ${zoom} outside 0.05..4`, async () => {
    const { POST } = (await routesPromise)[1];
    const response = await POST(objectRequest(canvasState({
      viewport: { x: 0, y: 0, zoom },
    })));

    assert.equal(response.status, 400);
    assertNoWrites();
  });
}

for (const zoom of [0.05, 4]) {
  test(`canvas-state POST accepts inclusive zoom boundary ${zoom} through schema validation`, async () => {
    const { POST } = (await routesPromise)[1];
    const response = await POST(objectRequest(canvasState({
      viewport: { x: 0, y: 0, zoom },
    })));

    assert.equal(response.status, 404);
    assertNoWrites();
  });
}

for (const testCase of malformedCases) {
  test(`${testCase.name} does not swallow non-syntax JSON errors`, async () => {
    const failure = new Error('request body transport failed');

    await assert.rejects(testCase.route(rejectingRequest(failure)), error => error === failure);
    assertNoWrites();
  });
}
