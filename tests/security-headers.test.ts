import assert from 'node:assert/strict';
import test from 'node:test';
import nextConfig from '../next.config';

test('app runtime emits the production HSTS and CSP contract on every route', async () => {
  assert.equal(typeof nextConfig.headers, 'function');
  const rules = await nextConfig.headers?.();
  assert.ok(rules);

  const catchAll = rules.find(rule => rule.source === '/(.*)');
  assert.ok(catchAll, 'missing catch-all security header rule');
  const headers = new Map(catchAll.headers.map(header => [header.key.toLowerCase(), header.value]));

  assert.equal(headers.get('strict-transport-security'), 'max-age=31536000');
  const csp = headers.get('content-security-policy');
  assert.ok(csp, 'missing Content-Security-Policy');
  assert.match(csp, /default-src 'self'/u);
  assert.match(csp, /script-src 'self' 'unsafe-inline'/u);
  assert.doesNotMatch(csp, /'unsafe-eval'/u);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/u);
  assert.match(csp, /img-src 'self' blob: data:/u);
  assert.match(csp, /font-src 'self' data:/u);
  assert.match(csp, /connect-src 'self'/u);
  assert.match(csp, /worker-src 'self' blob:/u);
  assert.match(csp, /object-src 'none'/u);
  assert.match(csp, /base-uri 'self'/u);
  assert.match(csp, /form-action 'self'/u);
  assert.match(csp, /frame-ancestors 'none'/u);
  assert.doesNotMatch(csp, /upgrade-insecure-requests/u);
  assert.equal(nextConfig.poweredByHeader, false);
});
