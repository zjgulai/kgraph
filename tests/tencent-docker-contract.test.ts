import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Tencent Docker package contains every local preflight artifact', () => {
  for (const path of [
    'Dockerfile',
    '.dockerignore',
    'deploy/tencent/compose.yaml',
    'deploy/tencent/edge.nginx.conf',
    'deploy/tencent/shared-nginx-kgraph.block.conf',
    'deploy/tencent/release.env.example',
    'deploy/tencent/README.md',
    'deploy/tencent/PRODUCTION-RUNBOOK.md',
    'scripts/tencent/build-linux-image.sh',
    'scripts/tencent/prepare-owner-data.sh',
    'scripts/tencent/backup-owner-data.sh',
    'scripts/tencent/render-runtime-script.sh',
    'scripts/tencent/runtime-contract.sh',
    'scripts/tencent/verify-linux-image.sh',
    'scripts/tencent/verify-runtime-contract-linux.sh',
  ]) {
    assert.equal(existsSync(resolve(root, path)), true, `missing ${path}`);
  }
});

test('Docker build is digest-pinned, allowlisted, multi-stage and non-root', () => {
  const dockerfile = read('Dockerfile');
  assert.match(dockerfile, /ARG NODE_IMAGE/);
  assert.match(dockerfile, /ARG RUNTIME_IMAGE=.*distroless\/nodejs22-debian13@sha256:/);
  assert.match(dockerfile, /FROM \$\{NODE_IMAGE\} AS builder/);
  assert.match(dockerfile, /FROM \$\{RUNTIME_IMAGE\} AS runtime/);
  assert.doesNotMatch(dockerfile, /COPY\s+\.\s+\./);
  assert.match(dockerfile, /npm ci --include=dev --no-audit --no-fund/);
  assert.match(dockerfile, /npm run verify:local/);
  assert.match(dockerfile, /COPY doccanvas\/tsconfig\.json[^\n]*doccanvas\/playwright\.config\.ts/);
  assert.match(dockerfile, /COPY doccanvas\/documents \.\/documents/);
  assert.match(dockerfile, /COPY doccanvas\/opendesign \.\/opendesign/);
  assert.match(dockerfile, /\.next\/standalone/);
  assert.match(dockerfile, /\.next\/static/);
  assert.match(dockerfile, /USER 10001:10001/);
  assert.match(dockerfile, /DOCCANVAS_WRITE_MODE=readonly/);
  assert.match(dockerfile, /HEALTHCHECK NONE/);
  assert.doesNotMatch(dockerfile, /HEALTHCHECK[^\n]*node|fetch\('http:\/\/127\.0\.0\.1:3200\/api\/health'/);
});

test('Docker context rejects secrets and generated state', () => {
  const ignore = read('.dockerignore');
  for (const pattern of [
    '**/ai_video.pem', '**/*.pem', '**/*.key', '**/*.p12', '**/*.pfx',
    '**/.env*', '.git/', '.kiro/', '.omc/', '.superpowers/', '.codegraph/',
    '.playwright-cli/', 'node_modules/', '.next/', 'tmp/', 'archive/',
  ]) assert.ok(ignore.includes(pattern), `missing ignore ${pattern}`);
});

test('Owner Compose isolates app and edge, mounts only data writable, and injects secret files', () => {
  const compose = read('deploy/tencent/compose.yaml');
  assert.doesNotMatch(compose, /^\s*ports:/m);
  assert.doesNotMatch(compose, /privileged:|network_mode:\s*host|docker\.sock|container_name:/);
  assert.match(compose, /read_only:\s*true/g);
  assert.match(compose, /DOCCANVAS_WRITE_MODE:\s*owner/);
  assert.match(compose, /DOCCANVAS_ADMIN_TOKEN_FILE:\s*\/run\/secrets\/doccanvas_owner_token/);
  assert.match(compose, /DOCCANVAS_SESSION_SECRET_FILE:\s*\/run\/secrets\/doccanvas_session_secret/);
  assert.match(compose, /target:\s*\/data\s*\n\s*read_only:\s*false/);
  assert.match(compose, /uid:\s*"10001"/);
  assert.match(compose, /mode:\s*0400/);
  assert.match(compose, /cap_drop:\s*\n\s*- ALL/g);
  assert.match(compose, /no-new-privileges:true/g);
  assert.match(compose, /mem_limit:\s*768m/);
  assert.match(compose, /mem_limit:\s*64m/);
  assert.match(compose, /pids_limit:\s*128/);
  assert.match(compose, /pids_limit:\s*32/);
  assert.match(compose, /internal:\s*true/);
  assert.match(compose, /external:\s*true/);
  assert.match(compose, /doccanvas-kgraph-edge/);
  assert.match(compose, /doccanvas-kgraph-app-internal/);
  assert.match(compose, /app:[\s\S]*?healthcheck:\s*\n\s*disable:\s*true[\s\S]*?edge:/);
  assert.match(compose, /depends_on:\s*\n\s*app:\s*\n\s*condition:\s*service_started/);
  assert.doesNotMatch(compose, /condition:\s*service_healthy|\/nodejs\/bin\/node/);
});

test('Owner image smoke waits explicitly for deep readiness without recurring app health', () => {
  const script = read('scripts/tencent/verify-linux-image.sh');
  assert.match(script, /docker exec[^\n]*\$CONTAINER_NAME[\s\S]*?\/api\/health/);
  assert.match(script, /CONSECUTIVE_READY/);
  assert.match(script, /CONSECUTIVE_READY[\s\S]*?-ge 2/);
  assert.match(script, /doccanvas_docker_image_healthcheck_test/);
  assert.match(script, /\.State\.Running/);
  assert.match(script, /doccanvas_docker_health_status/);
  assert.match(script, /docker logs --tail 80/);
  assert.doesNotMatch(script, /if \.State\.Health|\.State\.Health\.Status|if \.Config\.Healthcheck|== "healthy"/);
});

test('edge Nginx fails closed by Host and proxies deep app health through Docker DNS', () => {
  const edge = read('deploy/tencent/edge.nginx.conf');
  assert.match(edge, /resolver 127\.0\.0\.11 valid=10s/);
  assert.match(edge, /kgraph\.lute-tlz-dddd\.top/);
  assert.match(edge, /return 444/);
  assert.match(edge, /location = \/_edge_health/);
  assert.match(edge, /\/api\/health/);
  assert.match(edge, /http:\/\/doccanvas-kgraph-app-internal:3200/);
  assert.doesNotMatch(edge, /http:\/\/app:3200/);
  assert.match(edge, /proxy_pass \$app_upstream/);

  const compose = read('deploy/tencent/compose.yaml');
  assert.match(compose, /body="\$\$\(wget[^\n]*\/_edge_health\)" &&/);
  assert.match(compose, /\"status\":\"ok\"/);
  assert.match(compose, /\"mode\":\"owner\"/);
  assert.match(compose, /\"configured\":true/);
  assert.doesNotMatch(compose, /wget[^\n]*\/_edge_health\s*\|\s*grep/);
});

test('shared Nginx block uses current HTTP/2 syntax', () => {
  const shared = read('deploy/tencent/shared-nginx-kgraph.block.conf');
  assert.match(shared, /listen 443 ssl;/);
  assert.match(shared, /http2 on;/);
  assert.doesNotMatch(shared, /listen 443 ssl http2;/);
});

test('build script assembles an external allowlist context and requires a digest', () => {
  const script = read('scripts/tencent/build-linux-image.sh');
  assert.match(script, /NODE_IMAGE.*@sha256:/s);
  assert.match(script, /RUNTIME_IMAGE.*distroless.*@sha256:/s);
  assert.match(script, /mktemp -d/);
  assert.match(script, /--platform linux\/amd64/);
  assert.match(script, /release id does not match HEAD/);
  assert.match(script, /tracked worktree changes must be committed before build/);
  assert.match(script, /untracked file found in release allowlist/);
  assert.match(script, /--metadata-file/);
  assert.match(script, /containerimage\.digest/);
  assert.match(script, /containerimage\.config\.digest/);
  assert.match(script, /loaded image ID does not match runtime config digest/);
  assert.match(script, /git_commit_sha=/);
  assert.match(script, /manifest_digest=/);
  assert.match(script, /runtime_config_digest=/);
  assert.match(script, /sensitive/i);
  assert.match(script, /docker save/);
  assert.match(script, /app components lib opendesign public documents scripts tests deploy/);
  assert.match(script, /playwright\.config\.ts/);
  assert.doesNotMatch(script, /StrictHostKeyChecking=no|docker\s+(system\s+)?prune/);
});

test('Owner data preparation is missing-only, symlink-safe, and fixes UID 10001 permissions', () => {
  const script = read('scripts/tencent/prepare-owner-data.sh');
  assert.match(script, /EUID[\s\S]*-eq 0/);
  assert.match(script, /documents\/user/);
  assert.match(script, /data\/presentation/);
  assert.match(script, /data\/revisions/);
  assert.match(script, /data\/transactions/);
  assert.match(script, /data\/assets\/portraits/);
  assert.match(script, /if \[\[ -e "\$destination" \]\]/);
  assert.match(script, /chown -R --no-dereference 10001:10001/);
  assert.match(script, /find "\$DATA_ROOT" -type l/);
  assert.doesNotMatch(script, /cp\s+[^\n]*documents\/[^\n]*documents\/[^\n]*-f/);
});

test('Owner backup fails closed unless writes are quiesced and emits checksums', () => {
  const script = read('scripts/tencent/backup-owner-data.sh');
  assert.match(script, /DOCCANVAS_WRITES_QUIESCED/);
  assert.match(script, /backup directory already exists/);
  assert.match(script, /tar --numeric-owner --sort=name/);
  assert.match(script, /tar -tzf/);
  assert.match(script, /sha256sum/);
  assert.match(script, /writes_quiesced=true/);
});
