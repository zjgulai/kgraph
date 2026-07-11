#!/usr/bin/env bash
# Verify an assembled DocCanvas release using an isolated readonly local process.

set -Eeuo pipefail
umask 027

usage() {
  echo "Usage: $0 <release-dir> <data-dir>" >&2
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

if [[ $# -ne 2 ]]; then
  usage
  exit 64
fi

RELEASE_INPUT="${1%/}"
DATA_INPUT="${2%/}"
[[ -n "$RELEASE_INPUT" && -d "$RELEASE_INPUT" && ! -L "$RELEASE_INPUT" ]] || fail "release directory not found or unsafe: $1"
[[ -n "$DATA_INPUT" && -d "$DATA_INPUT" && ! -L "$DATA_INPUT" ]] || fail "data directory not found or unsafe: $2"
RELEASE_DIR="$(cd "$RELEASE_INPUT" && pwd -P)"
DATA_DIR="$(cd "$DATA_INPUT" && pwd -P)"
SERVER_ROOT="$RELEASE_DIR/.next/standalone"

require_real_directory_within() {
  local root="$1"
  local path="$2"
  local resolved
  [[ -d "$path" && ! -L "$path" ]] || fail "required directory missing or unsafe: $path"
  resolved="$(cd "$path" && pwd -P)"
  [[ "$resolved" == "$root" || "$resolved" == "$root/"* ]] || fail "directory escapes verified root: $path"
}

required_files=(
  "$SERVER_ROOT/server.js"
  "$SERVER_ROOT/.next/BUILD_ID"
  "$SERVER_ROOT/public/favicon.svg"
  "$SERVER_ROOT/public/__doccanvas_build_id.txt"
  "$DATA_DIR/documents/VibeTrack.md"
  "$DATA_DIR/documents/v2.7-Pro.md"
  "$DATA_DIR/documents/Playbook-v2.md"
)
required_dirs=(
  "$SERVER_ROOT/.next/static"
  "$DATA_DIR/documents/user"
  "$DATA_DIR/data/canvases"
  "$DATA_DIR/data/canvas-states"
  "$DATA_DIR/data/evolution-audit"
)

for path in "${required_files[@]}"; do
  [[ -f "$path" && ! -L "$path" ]] || fail "required file missing or unsafe: $path"
done
for path in "${required_dirs[@]}"; do
  case "$path" in
    "$SERVER_ROOT"/*) require_real_directory_within "$SERVER_ROOT" "$path" ;;
    "$DATA_DIR"/*) require_real_directory_within "$DATA_DIR" "$path" ;;
    *) fail "required directory is outside verified roots: $path" ;;
  esac
done

STATIC_FILE="$(find "$SERVER_ROOT/.next/static" -type f -print -quit)"
[[ -n "$STATIC_FILE" ]] || fail "standalone static directory is empty"
STATIC_PATH="${STATIC_FILE#"$SERVER_ROOT/.next/static/"}"

while IFS= read -r residue; do
  echo "WARNING: stale-candidate cleanup requires owner review: $residue" >&2
done < <(find "$DATA_DIR" -type f -name '*.lock.acquire.*' -print)

PORT="${DOCCANVAS_VERIFY_PORT:-3219}"
HOSTNAME="127.0.0.1"
[[ "$PORT" =~ ^[0-9]+$ && "$PORT" -ge 1024 && "$PORT" -le 65535 ]] || fail "invalid verification port: $PORT"
BASE_URL="http://$HOSTNAME:$PORT"
SERVER_PID=""
LOG_FILE=""
HEALTH_FILE=""
WRITE_FILE=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$SERVER_PID" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "$SERVER_PID" 2>/dev/null; then
      kill -KILL "$SERVER_PID" 2>/dev/null || true
    fi
  fi
  [[ -n "$SERVER_PID" ]] && wait "$SERVER_PID" 2>/dev/null || true
  [[ -z "$LOG_FILE" ]] || rm -f "$LOG_FILE"
  [[ -z "$HEALTH_FILE" ]] || rm -f "$HEALTH_FILE"
  [[ -z "$WRITE_FILE" ]] || rm -f "$WRITE_FILE"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

LOG_FILE="$(mktemp "${TMPDIR:-/tmp}/doccanvas-verify.XXXXXX.log")"
HEALTH_FILE="$(mktemp "${TMPDIR:-/tmp}/doccanvas-health.XXXXXX.json")"
WRITE_FILE="$(mktemp "${TMPDIR:-/tmp}/doccanvas-write.XXXXXX.json")"

node -e '
const net = require("net");
const host = process.argv[1];
const port = Number(process.argv[2]);
const server = net.createServer();
const timer = setTimeout(() => process.exit(2), 2000);
server.once("error", () => process.exit(1));
server.listen(port, host, () => server.close(() => {
  clearTimeout(timer);
  process.exit(0);
}));
' "$HOSTNAME" "$PORT" || fail "verification port is already in use: $HOSTNAME:$PORT"

CURL=(curl --noproxy '*' --connect-timeout 2 --max-time 5 --fail --silent --show-error)
READINESS_CURL=(curl --noproxy '*' --connect-timeout 1 --max-time 1 --fail --silent)

(
  cd "$SERVER_ROOT"
  NODE_ENV=production \
  DOCUMENT_PATH_MODE=prod \
  DOCCANVAS_ROOT="$DATA_DIR" \
  DOCCANVAS_WRITE_MODE=readonly \
  HOSTNAME="$HOSTNAME" \
  PORT="$PORT" \
  node server.js
) >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

ready=false
for _ in $(seq 1 40); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    sed -n '1,120p' "$LOG_FILE" >&2
    fail "standalone server exited before readiness"
  fi
  if "${READINESS_CURL[@]}" "$BASE_URL/api/health" -o "$HEALTH_FILE"; then
    ready=true
    break
  fi
  sleep 0.25
done
[[ "$ready" == true ]] || fail "health endpoint did not become ready"
kill -0 "$SERVER_PID" 2>/dev/null || fail "candidate process exited after readiness"

node -e '
const fs = require("fs");
const health = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (health.status !== "ok") throw new Error(`health status=${health.status}`);
if (health.writePolicy?.mode !== "readonly") throw new Error("write policy is not readonly");
if (health.checks?.registry?.ok !== true) throw new Error("document registry readiness failed");
if (!Array.isArray(health.checks?.directories) || health.checks.directories.length !== 5 || health.checks.directories.some((check) => !check.ok)) {
  throw new Error("runtime directory readiness failed");
}
if (Object.prototype.hasOwnProperty.call(health, "nodeVersion")) throw new Error("health response leaks nodeVersion");
const builtins = (health.documents || []).filter((doc) => doc.kind === "builtin");
if (builtins.length !== 3 || builtins.some((doc) => !doc.accessible || !doc.parseable || !doc.path.startsWith("./documents/"))) {
  throw new Error("builtin document readiness contract failed");
}
' "$HEALTH_FILE"

EXPECTED_BUILD_ID="$(tr -d '\r\n' < "$SERVER_ROOT/.next/BUILD_ID")"
REMOTE_BUILD_ID="$("${CURL[@]}" "$BASE_URL/__doccanvas_build_id.txt")"
[[ "$REMOTE_BUILD_ID" == "$EXPECTED_BUILD_ID" ]] || fail "responses did not come from the assembled candidate"

"${CURL[@]}" "$BASE_URL/" -o /dev/null
"${CURL[@]}" "$BASE_URL/favicon.svg" -o /dev/null
"${CURL[@]}" "$BASE_URL/_next/static/$STATIC_PATH" -o /dev/null
"${CURL[@]}" "$BASE_URL/api/export/markdown?documentId=vibe-track" -o /dev/null

assert_readonly() {
  local method="$1"
  local route="$2"
  local body="$3"
  local status
  status="$(curl --noproxy '*' --connect-timeout 2 --max-time 5 --silent --show-error -o "$WRITE_FILE" -w '%{http_code}' \
    -X "$method" "$BASE_URL$route" -H 'Content-Type: application/json' -d "$body")"
  [[ "$status" == "403" ]] || fail "$method $route returned $status instead of 403"
}

assert_readonly POST /api/canvases '{"title":"readonly-check"}'
assert_readonly POST /api/canvas-state '{"documentId":"vibe-track"}'
assert_readonly PATCH /api/documents '{"documentId":"vibe-track","heading":"x","content":"x"}'
kill -0 "$SERVER_PID" 2>/dev/null || fail "candidate process exited during verification"

echo "Release candidate verified (readonly fixture)"
echo "production unchanged; PM2, Nginx, current symlink, and cloud resources were not modified"
