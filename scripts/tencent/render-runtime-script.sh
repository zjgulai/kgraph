#!/usr/bin/env bash
# Inline the reviewed runtime contract into a create-only production script.
set -Eeuo pipefail
umask 027

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ "$#" -eq 2 ]] || fail "usage: $0 <template-script> <output-script>"

TEMPLATE=$1
OUTPUT=$2
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
RUNTIME_CONTRACT="$SCRIPT_DIR/runtime-contract.sh"
MARKER='# @doccanvas-runtime-contract'

[[ -f "$TEMPLATE" && ! -L "$TEMPLATE" ]] || fail "template must be a regular non-symlink file"
[[ -f "$RUNTIME_CONTRACT" && ! -L "$RUNTIME_CONTRACT" ]] || fail "runtime contract must be a regular non-symlink file"
[[ ! -e "$OUTPUT" && ! -L "$OUTPUT" ]] || fail "output already exists"
[[ -d "$(dirname "$OUTPUT")" ]] || fail "output parent does not exist"

if command -v sha256sum >/dev/null 2>&1; then
  SHA256_TOOL=sha256sum
elif command -v shasum >/dev/null 2>&1; then
  SHA256_TOOL=shasum
else
  fail "no SHA-256 command is available"
fi

MARKER_COUNT="$(grep -Fxc -- "$MARKER" "$TEMPLATE" || true)"
[[ "$MARKER_COUNT" -eq 1 ]] || fail "template must contain exactly one runtime contract marker"
CONTRACT_FUNCTION_COUNT=0
while IFS= read -r contract_function; do
  [[ -n "$contract_function" ]] || continue
  CONTRACT_FUNCTION_COUNT=$((CONTRACT_FUNCTION_COUNT + 1))
  if grep -Eq "^[[:space:]]*${contract_function}[[:space:]]*\\(\\)" "$TEMPLATE" \
    || grep -Eq "^[[:space:]]*function[[:space:]]+${contract_function}([[:space:](]|$)" "$TEMPLATE"; then
    fail "template redefines runtime contract function: ${contract_function}"
  fi
done < <(sed -nE 's/^([A-Za-z_][A-Za-z0-9_]*)\(\)[[:space:]]*\{.*/\1/p' "$RUNTIME_CONTRACT")
[[ "$CONTRACT_FUNCTION_COUNT" -gt 0 ]] || fail "runtime contract contains no functions"
CONTRACT_VARIABLE_COUNT=0
while IFS= read -r contract_variable; do
  [[ -n "$contract_variable" ]] || continue
  CONTRACT_VARIABLE_COUNT=$((CONTRACT_VARIABLE_COUNT + 1))
  if grep -Fq "$contract_variable" "$TEMPLATE"; then
    fail "template references reserved runtime contract variable: ${contract_variable}"
  fi
done < <(sed -nE 's/^readonly[[:space:]]+(DOCCANVAS_[A-Z0-9_]+)=.*/\1/p' "$RUNTIME_CONTRACT")
[[ "$CONTRACT_VARIABLE_COUNT" -gt 0 ]] || fail "runtime contract contains no reserved variables"

STAGING="$(mktemp "${OUTPUT}.staging.XXXXXX")"
cleanup() { [[ -z "${STAGING:-}" ]] || rm -f "$STAGING"; }
trap cleanup EXIT

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" == "$MARKER" ]]; then
    sed '1{/^#!\/usr\/bin\/env bash$/d;}' "$RUNTIME_CONTRACT"
  else
    printf '%s\n' "$line"
  fi
done < "$TEMPLATE" > "$STAGING"

chmod 0750 "$STAGING"
if grep -Fq '.State.Health' "$STAGING" || grep -Fq '.Config.Healthcheck' "$STAGING"; then
  fail "rendered script contains unsafe direct Docker optional-field access"
fi
grep -Fq "$MARKER" "$STAGING" && fail "runtime contract marker survived rendering"
bash -n "$STAGING"
if [[ "$SHA256_TOOL" == sha256sum ]]; then
  OUTPUT_SHA256="$(sha256sum "$STAGING" | awk '{print $1}')"
else
  OUTPUT_SHA256="$(shasum -a 256 "$STAGING" | awk '{print $1}')"
fi
ln "$STAGING" "$OUTPUT" || fail "could not publish output create-only"
rm -f "$STAGING"
STAGING=
trap - EXIT

printf 'output_sha256=%s\n' "$OUTPUT_SHA256"
