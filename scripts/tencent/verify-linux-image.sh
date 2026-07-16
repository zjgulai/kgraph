#!/usr/bin/env bash
# Verify a local linux/amd64 DocCanvas image with isolated Owner fixture data.
set -Eeuo pipefail
umask 077

fail() { echo "ERROR: $*" >&2; exit 1; }
file_mode() {
  if [[ "$(uname -s)" == Darwin ]]; then
    stat -f '%Lp' "$1"
  else
    stat -c '%a' "$1"
  fi
}
[[ $# -eq 1 ]] || fail "usage: $0 <image-tag>"
IMAGE_TAG="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DOCCANVAS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
RUNTIME_CONTRACT="$SCRIPT_DIR/runtime-contract.sh"
[[ -r "$RUNTIME_CONTRACT" ]] || fail "runtime contract helper is missing"
# shellcheck source=scripts/tencent/runtime-contract.sh
source "$RUNTIME_CONTRACT"
FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/doccanvas-image-fixture.XXXXXX")"
SECRET_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/doccanvas-image-secrets.XXXXXX")"
CONTAINER_NAME="doccanvas-verify-$$"
cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  chmod -R u+w "$FIXTURE_ROOT" >/dev/null 2>&1 || true
  rm -rf "$FIXTURE_ROOT" "$SECRET_ROOT"
}
trap cleanup EXIT

mkdir -p \
  "$FIXTURE_ROOT/documents/user" \
  "$FIXTURE_ROOT/data/canvases" \
  "$FIXTURE_ROOT/data/canvas-states" \
  "$FIXTURE_ROOT/data/evolution-audit" \
  "$FIXTURE_ROOT/data/presentation" \
  "$FIXTURE_ROOT/data/revisions" \
  "$FIXTURE_ROOT/data/transactions" \
  "$FIXTURE_ROOT/data/revision-audit" \
  "$FIXTURE_ROOT/data/assets/portraits"
cp "$DOCCANVAS_ROOT/documents/VibeTrack.md" "$FIXTURE_ROOT/documents/VibeTrack.md"
cp "$DOCCANVAS_ROOT/documents/v2.7-Pro.md" "$FIXTURE_ROOT/documents/v2.7-Pro.md"
cp "$DOCCANVAS_ROOT/documents/Playbook-v2.md" "$FIXTURE_ROOT/documents/Playbook-v2.md"
chmod -R a+rwX "$FIXTURE_ROOT"
openssl rand -hex 32 > "$SECRET_ROOT/owner-token"
openssl rand -hex 48 > "$SECRET_ROOT/session-secret"
chmod 0444 "$SECRET_ROOT/owner-token" "$SECRET_ROOT/session-secret"

PLATFORM="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$IMAGE_TAG")"
[[ "$PLATFORM" == "linux/amd64" ]] || fail "unexpected image platform: $PLATFORM"
IMAGE_HEALTHCHECK="$(doccanvas_docker_image_healthcheck_test "$IMAGE_TAG")"
[[ "$IMAGE_HEALTHCHECK" == "none" || "$IMAGE_HEALTHCHECK" == '["NONE"]' ]] || fail "image contains an active healthcheck"
docker run -d \
  --name "$CONTAINER_NAME" \
  --platform linux/amd64 \
  --read-only \
  --user 10001:10001 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --memory 768m \
  --cpus 1 \
  --pids-limit 128 \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,uid=10001,gid=10001,mode=1770 \
  --tmpfs /app/.next/cache:rw,noexec,nosuid,nodev,size=32m,uid=10001,gid=10001,mode=0770 \
  --env DOCCANVAS_WRITE_MODE=owner \
  --env DOCCANVAS_ADMIN_TOKEN_FILE=/run/secrets/doccanvas_owner_token \
  --env DOCCANVAS_SESSION_SECRET_FILE=/run/secrets/doccanvas_session_secret \
  --mount "type=bind,src=$FIXTURE_ROOT,dst=/data" \
  --mount "type=bind,src=$SECRET_ROOT/owner-token,dst=/run/secrets/doccanvas_owner_token,readonly" \
  --mount "type=bind,src=$SECRET_ROOT/session-secret,dst=/run/secrets/doccanvas_session_secret,readonly" \
  "$IMAGE_TAG" >/dev/null

[[ "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$CONTAINER_NAME")" == "true" ]] || fail "container root filesystem is not read-only"
OWNER_SECRET_MOUNT="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/run/secrets/doccanvas_owner_token"}}{{.Type}}:{{.RW}}{{end}}{{end}}' "$CONTAINER_NAME")"
SESSION_SECRET_MOUNT="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/run/secrets/doccanvas_session_secret"}}{{.Type}}:{{.RW}}{{end}}{{end}}' "$CONTAINER_NAME")"
DATA_MOUNT="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}:{{.RW}}{{end}}{{end}}' "$CONTAINER_NAME")"
[[ "$OWNER_SECRET_MOUNT" == "bind:false" ]] || fail "owner secret mount is not read-only"
[[ "$SESSION_SECRET_MOUNT" == "bind:false" ]] || fail "session secret mount is not read-only"
[[ "$DATA_MOUNT" == "bind:true" ]] || fail "data mount is not a writable bind mount"
[[ "$(doccanvas_docker_health_status "$CONTAINER_NAME")" == "none" ]] || fail "container has an active health monitor"
CONSECUTIVE_READY=0
for _ in $(seq 1 40); do
  [[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER_NAME")" == "true" ]] || fail "container stopped before readiness"
  [[ "$(docker inspect --format '{{.RestartCount}}' "$CONTAINER_NAME")" == "0" ]] || fail "container restarted before readiness"
  [[ "$(docker inspect --format '{{.State.OOMKilled}}' "$CONTAINER_NAME")" == "false" ]] || fail "container was OOM killed before readiness"
  if docker exec "$CONTAINER_NAME" /nodejs/bin/node -e \
    "fetch('http://127.0.0.1:3200/api/health').then(async r=>{const b=await r.json();if(!r.ok||b?.status!=='ok'||b?.writePolicy?.mode!=='owner'||b?.writePolicy?.configured!==true)process.exit(1)}).catch(()=>process.exit(1))" \
    >/dev/null 2>&1; then
    CONSECUTIVE_READY=$((CONSECUTIVE_READY + 1))
    [[ "$CONSECUTIVE_READY" -ge 2 ]] && break
  else
    CONSECUTIVE_READY=0
  fi
  sleep 1
done
if [[ "$CONSECUTIVE_READY" -lt 2 ]]; then
  docker logs --tail 80 "$CONTAINER_NAME" >&2 || true
  fail "deep readiness timeout"
fi

docker exec -i "$CONTAINER_NAME" /nodejs/bin/node --input-type=module - <<'NODE'
import { readFileSync } from 'node:fs';
const base = 'http://127.0.0.1:3200';
const checks = [
  ['GET', '/api/health', 200],
  ['GET', '/', 200],
  ['GET', '/favicon.svg', 200],
  ['GET', '/api/export/markdown?documentId=vibe-track', 200],
  ['POST', '/api/canvases', 401, '{}'],
  ['POST', '/api/canvas-state', 401, '{}'],
  ['PATCH', '/api/documents', 401, '{}'],
];
for (const [method, path, expected, body] of checks) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body ? {'content-type': 'application/json'} : undefined,
    body,
  });
  if (response.status !== expected) throw new Error(`${method} ${path}: ${response.status} != ${expected}`);
  if (path === '/api/health') {
    const json = await response.json();
    if (json?.status !== 'ok' || json?.writePolicy?.mode !== 'owner' || json?.writePolicy?.configured !== true || 'nodeVersion' in json) throw new Error('invalid health payload');
  }
}

const token = readFileSync('/run/secrets/doccanvas_owner_token', 'utf8').trim();
const login = await fetch(`${base}/api/owner/session`, {
  method: 'POST',
  headers: {'content-type': 'application/json', origin: base},
  body: JSON.stringify({token}),
});
if (login.status !== 200) {
  const error = await login.json().catch(() => null);
  throw new Error(`owner login failed: ${login.status} ${error?.error ?? 'unknown error'}`);
}
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie?.startsWith('doccanvas_owner_session=')) throw new Error('owner session cookie missing');
const status = await fetch(`${base}/api/owner/status`, {headers: {cookie}}).then(response => response.json());
if (status?.authenticated !== true || status?.mode !== 'owner') throw new Error('owner status is not authenticated');

const crossOrigin = await fetch(`${base}/api/canvases`, {
  method: 'POST',
  headers: {'content-type': 'application/json', cookie, origin: 'https://invalid.example'},
  body: JSON.stringify({title: 'Cross origin fixture'}),
});
if (crossOrigin.status !== 403) throw new Error(`cross-origin write was not rejected: ${crossOrigin.status}`);

const created = await fetch(`${base}/api/canvases`, {
  method: 'POST',
  headers: {'content-type': 'application/json', cookie, origin: base},
  body: JSON.stringify({title: 'Owner image fixture', slug: 'owner-image-fixture'}),
});
if (created.status !== 201) throw new Error(`owner create failed: ${created.status}`);
const createdBody = await created.json();
if (createdBody?.canvas?.id !== 'owner-image-fixture') throw new Error('owner create returned the wrong canvas');

const logout = await fetch(`${base}/api/owner/session`, {method: 'DELETE', headers: {cookie, origin: base}});
if (logout.status !== 200) throw new Error(`owner logout failed: ${logout.status}`);
NODE

[[ -s "$FIXTURE_ROOT/documents/user/owner-image-fixture.md" ]] || fail "owner image smoke did not persist the user canvas"
[[ "$(file_mode "$FIXTURE_ROOT/documents/user/owner-image-fixture.md")" == 640 ]] \
  || fail "Owner-created Markdown mode is not 0640"
[[ -s "$FIXTURE_ROOT/data/canvases/manifest.json" ]] || fail "owner image smoke did not persist the canvas manifest"
[[ "$(file_mode "$FIXTURE_ROOT/data/canvases/manifest.json")" == 640 ]] \
  || fail "Owner-created canvas manifest mode is not 0640"

[[ "$(docker inspect --format '{{.RestartCount}}' "$CONTAINER_NAME")" == "0" ]] || fail "container restarted"
[[ "$(docker inspect --format '{{.State.OOMKilled}}' "$CONTAINER_NAME")" == "false" ]] || fail "container was OOM killed"
[[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER_NAME")" == "true" ]] || fail "container stopped"
CONTAINER_DIFF="$(docker diff "$CONTAINER_NAME")"
UNEXPECTED_DIFF="$(printf '%s\n' "$CONTAINER_DIFF" | grep -Ev '^(C /app|C /app/\.next|[ACD] /data|[ACD] /run|[ACD] /run/secrets|[ACD] /run/secrets/(doccanvas_owner_token|doccanvas_session_secret))$|^[ACD] /(tmp|app/\.next/cache)(/|$)' || true)"
[[ -z "$UNEXPECTED_DIFF" ]] || {
  printf '%s\n' "$UNEXPECTED_DIFF" >&2
  fail "read-only container changed a path outside approved tmpfs"
}

echo "linux/amd64 owner image smoke passed"
echo "evidence_grade=L2-fixture-or-dry-run"
echo "production unchanged"
