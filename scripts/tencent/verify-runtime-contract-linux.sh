#!/usr/bin/env bash
# Run inside Linux to verify /proc and util-linux flock semantics used by rollback.
set -Eeuo pipefail
umask 077

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ "$(uname -s)" == Linux ]] || fail "Linux is required"
[[ -d /proc/self/fd ]] || fail "/proc/self/fd is unavailable"
command -v flock >/dev/null 2>&1 || fail "flock is unavailable"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
RUNTIME_CONTRACT="$SCRIPT_DIR/runtime-contract.sh"
[[ -r "$RUNTIME_CONTRACT" ]] || fail "runtime contract helper is missing"
# shellcheck source=scripts/tencent/runtime-contract.sh
source "$RUNTIME_CONTRACT"

FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/doccanvas-runtime-lock.XXXXXX")"
THIRD_PARTY_PID=
cleanup() {
  if [[ -n "${THIRD_PARTY_PID:-}" ]]; then
    kill "$THIRD_PARTY_PID" >/dev/null 2>&1 || true
    wait "$THIRD_PARTY_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$FIXTURE_ROOT"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$FIXTURE_ROOT/run/lock" "$FIXTURE_ROOT/var"
ln -s ../run/lock "$FIXTURE_ROOT/var/lock"
LOCK_FILE="$FIXTURE_ROOT/var/lock/doccanvas.lock"

exec 9>"$LOCK_FILE"
flock -n 9 || fail "could not create inherited-lock fixture"
doccanvas_verify_inherited_lock_fd 9 "$LOCK_FILE" \
  || fail "inherited lock alias was rejected"

UNLOCKED_FILE="$FIXTURE_ROOT/run/lock/unlocked.lock"
exec 8>"$UNLOCKED_FILE"
if doccanvas_verify_inherited_lock_fd 8 "$UNLOCKED_FILE"; then
  fail "unlocked FD was accepted"
fi

OTHER_FILE="$FIXTURE_ROOT/run/lock/other.lock"
exec 7>"$OTHER_FILE"
flock -n 7 || fail "could not create wrong-file fixture"
if doccanvas_verify_inherited_lock_fd 7 "$LOCK_FILE"; then
  fail "wrong-file FD was accepted"
fi

THIRD_PARTY_FILE="$FIXTURE_ROOT/run/lock/third-party.lock"
THIRD_PARTY_READY="$FIXTURE_ROOT/third-party.ready"
(
  exec 6>"$THIRD_PARTY_FILE"
  flock -n 6 || exit 1
  : > "$THIRD_PARTY_READY"
  sleep 30
) &
THIRD_PARTY_PID=$!
for _ in $(seq 1 50); do
  [[ -e "$THIRD_PARTY_READY" ]] && break
  kill -0 "$THIRD_PARTY_PID" >/dev/null 2>&1 \
    || fail "third-party lock fixture exited early"
  sleep 0.1
done
[[ -e "$THIRD_PARTY_READY" ]] || fail "third-party lock fixture did not become ready"
exec 5>"$THIRD_PARTY_FILE"
if doccanvas_verify_inherited_lock_fd 5 "$THIRD_PARTY_FILE"; then
  fail "unlocked FD was accepted because a third party held the file lock"
fi

printf 'inherited_lock_alias=pass\n'
printf 'unlocked_fd_rejected=pass\n'
printf 'wrong_file_rejected=pass\n'
printf 'third_party_lock_rejected=pass\n'
printf 'production_status=unchanged\n'
