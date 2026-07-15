import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { NextRequest } from 'next/server';
import {
  checkWriteAccess,
  createOwnerSession,
  OWNER_SESSION_COOKIE,
  verifyOwnerSession,
} from '../lib/server/write-guard';
import { POST as login } from '../app/api/owner/session/route';

const original = {
  mode: process.env.DOCCANVAS_WRITE_MODE,
  nodeEnv: process.env.NODE_ENV,
  token: process.env.DOCCANVAS_ADMIN_TOKEN,
  secret: process.env.DOCCANVAS_SESSION_SECRET,
};
const mutableEnv = process.env as Record<string, string | undefined>;

function configureOwner() {
  process.env.DOCCANVAS_WRITE_MODE = 'owner';
  mutableEnv.NODE_ENV = 'production';
  process.env.DOCCANVAS_ADMIN_TOKEN = 'owner-test-token-with-sufficient-length';
  process.env.DOCCANVAS_SESSION_SECRET = 'session-test-secret-with-sufficient-length';
}

afterEach(() => {
  if (original.mode === undefined) delete process.env.DOCCANVAS_WRITE_MODE;
  else process.env.DOCCANVAS_WRITE_MODE = original.mode;
  if (original.nodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = original.nodeEnv;
  if (original.token === undefined) delete process.env.DOCCANVAS_ADMIN_TOKEN;
  else process.env.DOCCANVAS_ADMIN_TOKEN = original.token;
  if (original.secret === undefined) delete process.env.DOCCANVAS_SESSION_SECRET;
  else process.env.DOCCANVAS_SESSION_SECRET = original.secret;
});

test('owner session is signed, expires, and rejects tampering', () => {
  configureOwner();
  const now = 1_700_000_000_000;
  const value = createOwnerSession(now);
  assert.equal(verifyOwnerSession(value, now + 1_000), true);
  assert.equal(verifyOwnerSession(`${value}x`, now + 1_000), false);
  assert.equal(verifyOwnerSession(value, now + 8 * 60 * 60 * 1000 + 1), false);
});

test('owner writes require same-origin HttpOnly session instead of browser token headers', () => {
  configureOwner();
  const withoutCookie = new NextRequest('https://example.test/api/documents', {
    method: 'POST',
    headers: {
      origin: 'https://example.test',
      'x-doccanvas-token': process.env.DOCCANVAS_ADMIN_TOKEN!,
    },
  });
  assert.deepEqual(checkWriteAccess(withoutCookie), {
    ok: false,
    status: 401,
    message: 'Owner session required.',
  });

  const withCookie = new NextRequest('https://example.test/api/documents', {
    method: 'POST',
    headers: {
      origin: 'https://example.test',
      cookie: `${OWNER_SESSION_COOKIE}=${createOwnerSession()}`,
    },
  });
  assert.deepEqual(checkWriteAccess(withCookie), { ok: true });

  const crossOrigin = new NextRequest('https://example.test/api/documents', {
    method: 'POST',
    headers: {
      origin: 'https://attacker.test',
      cookie: `${OWNER_SESSION_COOKIE}=${createOwnerSession()}`,
    },
  });
  assert.equal(checkWriteAccess(crossOrigin).ok, false);
});

test('owner login returns a secure HttpOnly strict cookie', async () => {
  configureOwner();
  const response = await login(new NextRequest('https://example.test/api/owner/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://example.test' },
    body: JSON.stringify({ token: process.env.DOCCANVAS_ADMIN_TOKEN }),
  }));
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie') ?? '';
  assert.match(cookie, new RegExp(`${OWNER_SESSION_COOKIE}=`));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=strict/i);
});

test('owner origin checks reconstruct the public origin from Host and forwarded protocol', async () => {
  configureOwner();
  const headers = {
    'content-type': 'application/json',
    host: 'kgraph.lute-tlz-dddd.top',
    origin: 'https://kgraph.lute-tlz-dddd.top',
    'x-forwarded-proto': 'https',
  };
  const response = await login(new NextRequest('http://localhost:3000/api/owner/session', {
    method: 'POST',
    headers,
    body: JSON.stringify({ token: process.env.DOCCANVAS_ADMIN_TOKEN }),
  }));
  assert.equal(response.status, 200);

  const proxiedWrite = new NextRequest('http://localhost:3000/api/documents', {
    method: 'POST',
    headers: {
      ...headers,
      cookie: `${OWNER_SESSION_COOKIE}=${createOwnerSession()}`,
    },
  });
  assert.deepEqual(checkWriteAccess(proxiedWrite), { ok: true });
});

test('owner origin checks allow a direct same-host smoke request but reject invalid forwarding', async () => {
  configureOwner();
  const direct = await login(new NextRequest('http://localhost:3000/api/owner/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: '127.0.0.1:3200',
      origin: 'http://127.0.0.1:3200',
    },
    body: JSON.stringify({ token: process.env.DOCCANVAS_ADMIN_TOKEN }),
  }));
  assert.equal(direct.status, 200);

  const invalidForwarding = await login(new NextRequest('http://localhost:3000/api/owner/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'kgraph.lute-tlz-dddd.top',
      origin: 'https://kgraph.lute-tlz-dddd.top',
      'x-forwarded-proto': 'javascript',
    },
    body: JSON.stringify({ token: process.env.DOCCANVAS_ADMIN_TOKEN }),
  }));
  assert.equal(invalidForwarding.status, 403);
});
