#!/usr/bin/env bash
# Verify a local linux/amd64 DocCanvas image with readonly fixture data.
set -Eeuo pipefail
umask 077

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ $# -eq 1 ]] || fail "usage: $0 <image-tag>"
IMAGE_TAG="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DOCCANVAS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
RUNTIME_CONTRACT="$SCRIPT_DIR/runtime-contract.sh"
[[ -r "$RUNTIME_CONTRACT" ]] || fail "runtime contract helper is missing"
# shellcheck source=scripts/tencent/runtime-contract.sh
source "$RUNTIME_CONTRACT"
FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/doccanvas-image-fixture.XXXXXX")"
CONTAINER_NAME="doccanvas-verify-$$"
cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  chmod -R u+w "$FIXTURE_ROOT" >/dev/null 2>&1 || true
  rm -rf "$FIXTURE_ROOT"
}
trap cleanup EXIT

mkdir -p "$FIXTURE_ROOT/documents/user" "$FIXTURE_ROOT/data/canvases" "$FIXTURE_ROOT/data/canvas-states" "$FIXTURE_ROOT/data/evolution-audit"
cp "$DOCCANVAS_ROOT/documents/VibeTrack.md" "$FIXTURE_ROOT/documents/VibeTrack.md"
cp "$DOCCANVAS_ROOT/documents/v2.7-Pro.md" "$FIXTURE_ROOT/documents/v2.7-Pro.md"
cp "$DOCCANVAS_ROOT/documents/Playbook-v2.md" "$FIXTURE_ROOT/documents/Playbook-v2.md"
chmod -R a-w "$FIXTURE_ROOT"

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
  --mount "type=bind,src=$FIXTURE_ROOT,dst=/data,readonly" \
  "$IMAGE_TAG" >/dev/null

[[ "$(doccanvas_docker_health_status "$CONTAINER_NAME")" == "none" ]] || fail "container has an active health monitor"
CONSECUTIVE_READY=0
for _ in $(seq 1 40); do
  [[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER_NAME")" == "true" ]] || fail "container stopped before readiness"
  [[ "$(docker inspect --format '{{.RestartCount}}' "$CONTAINER_NAME")" == "0" ]] || fail "container restarted before readiness"
  [[ "$(docker inspect --format '{{.State.OOMKilled}}' "$CONTAINER_NAME")" == "false" ]] || fail "container was OOM killed before readiness"
  if docker exec "$CONTAINER_NAME" /nodejs/bin/node -e \
    "fetch('http://127.0.0.1:3200/api/health').then(async r=>{const b=await r.json();if(!r.ok||b?.status!=='ok'||b?.writePolicy?.mode!=='readonly')process.exit(1)}).catch(()=>process.exit(1))" \
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

docker exec -i "$CONTAINER_NAME" /nodejs/bin/node - <<'NODE'
const checks = [
  ['GET', '/api/health', 200],
  ['GET', '/', 200],
  ['GET', '/favicon.svg', 200],
  ['GET', '/api/export/markdown?documentId=vibe-track', 200],
  ['POST', '/api/canvases', 403, '{}'],
  ['POST', '/api/canvas-state', 403, '{}'],
  ['PATCH', '/api/documents', 403, '{}'],
];
for (const [method, path, expected, body] of checks) {
  const response = await fetch(`http://127.0.0.1:3200${path}`, {
    method,
    headers: body ? {'content-type': 'application/json'} : undefined,
    body,
  });
  if (response.status !== expected) throw new Error(`${method} ${path}: ${response.status} != ${expected}`);
  if (path === '/api/health') {
    const json = await response.json();
    if (json?.status !== 'ok' || json?.writePolicy?.mode !== 'readonly' || 'nodeVersion' in json) throw new Error('invalid health payload');
  }
}
NODE

[[ "$(docker inspect --format '{{.RestartCount}}' "$CONTAINER_NAME")" == "0" ]] || fail "container restarted"
[[ "$(docker inspect --format '{{.State.OOMKilled}}' "$CONTAINER_NAME")" == "false" ]] || fail "container was OOM killed"
[[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER_NAME")" == "true" ]] || fail "container stopped"
CONTAINER_DIFF="$(docker diff "$CONTAINER_NAME")"
UNEXPECTED_DIFF="$(printf '%s\n' "$CONTAINER_DIFF" | grep -Ev '^(C /app|C /app/\.next|[ACD] /data)$|^[ACD] /(tmp|app/\.next/cache)(/|$)' || true)"
[[ -z "$UNEXPECTED_DIFF" ]] || {
  printf '%s\n' "$UNEXPECTED_DIFF" >&2
  fail "read-only container changed a path outside approved tmpfs"
}

echo "linux/amd64 readonly image smoke passed"
echo "evidence_grade=L2-fixture-or-dry-run"
echo "production unchanged"
