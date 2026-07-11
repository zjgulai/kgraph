#!/usr/bin/env bash
# Build and assemble an immutable DocCanvas release candidate.
# This script never starts PM2/Nginx, switches `current`, or overwrites existing data.

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"

resolve_target() {
  local input="${1%/}"
  local parent
  local name
  [[ -n "$input" && "$input" != "/" ]] || fail "target path must not be the filesystem root"
  name="$(basename "$input")"
  [[ "$name" != "." && "$name" != ".." ]] || fail "target path must not end in . or ..: $1"
  parent="$(dirname "$input")"
  [[ -d "$parent" ]] || fail "target parent does not exist: $parent"
  parent="$(cd "$parent" && pwd -P)"
  printf '%s/%s\n' "$parent" "$name"
}

paths_overlap() {
  local left="$1"
  local right="$2"
  [[ "$left" == "$right" || "$left" == "$right/"* || "$right" == "$left/"* ]]
}

validate_existing_real_directory() {
  local path="$1"
  if [[ -e "$path" || -L "$path" ]]; then
    [[ -d "$path" && ! -L "$path" ]] || fail "data directory component is unsafe: $path"
    [[ "$(cd "$path" && pwd -P)" == "$path" ]] || fail "data directory escapes canonical root: $path"
  fi
}

ensure_real_directory() {
  local path="$1"
  if [[ ! -e "$path" && ! -L "$path" ]]; then
    mkdir "$path"
  fi
  validate_existing_real_directory "$path"
}

RELEASE_DIR="$(resolve_target "$1")"
DATA_DIR="$(resolve_target "$2")"
SEED_ROOT_INPUT="${DOCCANVAS_SEED_ROOT:-$SOURCE_DIR/documents}"
[[ -d "$SEED_ROOT_INPUT" ]] || fail "seed root does not exist: $SEED_ROOT_INPUT"
SEED_ROOT="$(cd "$SEED_ROOT_INPUT" && pwd -P)"

[[ ! -e "$RELEASE_DIR" && ! -L "$RELEASE_DIR" ]] || fail "release already exists: $RELEASE_DIR"
if [[ -e "$DATA_DIR" || -L "$DATA_DIR" ]]; then
  [[ -d "$DATA_DIR" && ! -L "$DATA_DIR" ]] || fail "data path must be a real directory: $DATA_DIR"
fi

paths_overlap "$RELEASE_DIR" "$DATA_DIR" && fail "release and data paths must not overlap"
paths_overlap "$RELEASE_DIR" "$SOURCE_DIR" && fail "release and source paths must not overlap"
paths_overlap "$DATA_DIR" "$SOURCE_DIR" && fail "data and source paths must not overlap"

STAGING_DIR="${RELEASE_DIR}.staging.$$"
PUBLISH_LOCK="${RELEASE_DIR}.publish-lock"
[[ ! -e "$STAGING_DIR" && ! -L "$STAGING_DIR" ]] || fail "staging path already exists: $STAGING_DIR"
if ! mkdir "$PUBLISH_LOCK" 2>/dev/null; then
  fail "release publication is locked: $PUBLISH_LOCK"
fi
PUBLISH_LOCK_HELD=true

SEED_TEMPS=("")
cleanup() {
  rm -rf "$STAGING_DIR" || echo "WARNING: could not remove staging directory: $STAGING_DIR" >&2
  local temp
  for temp in "${SEED_TEMPS[@]}"; do
    if [[ -n "$temp" ]]; then
      rm -f "$temp" || echo "WARNING: could not remove seed temp: $temp" >&2
    fi
  done
  if [[ "$PUBLISH_LOCK_HELD" == true ]]; then
    rmdir "$PUBLISH_LOCK" 2>/dev/null || echo "WARNING: could not remove publish lock: $PUBLISH_LOCK" >&2
  fi
  return 0
}
trap cleanup EXIT

SEED_SOURCES=(
  "$SEED_ROOT/VibeTrack.md"
  "$SEED_ROOT/v2.7-Pro.md"
  "$SEED_ROOT/Playbook-v2.md"
)
SEED_TARGET_NAMES=("VibeTrack.md" "v2.7-Pro.md" "Playbook-v2.md")

validate_existing_real_directory "$DATA_DIR"
validate_existing_real_directory "$DATA_DIR/documents"
validate_existing_real_directory "$DATA_DIR/documents/user"
validate_existing_real_directory "$DATA_DIR/data"
validate_existing_real_directory "$DATA_DIR/data/canvases"
validate_existing_real_directory "$DATA_DIR/data/canvas-states"
validate_existing_real_directory "$DATA_DIR/data/evolution-audit"

# Preflight every seed before any data directory or release is written.
for index in 0 1 2; do
  target="$DATA_DIR/documents/${SEED_TARGET_NAMES[$index]}"
  if [[ -e "$target" || -L "$target" ]]; then
    [[ -f "$target" && ! -L "$target" ]] || fail "existing seed target is not a regular file: $target"
  else
    source_file="${SEED_SOURCES[$index]}"
    [[ -f "$source_file" && ! -L "$source_file" ]] || fail "missing seed source: $source_file"
  fi
done

echo "Building release candidate from $SOURCE_DIR"
(
  cd "$SOURCE_DIR"
  npm ci --include=dev --no-audit --no-fund
  npm run verify:local
)

[[ -f "$SOURCE_DIR/.next/standalone/server.js" ]] || fail "missing standalone server.js"
[[ -f "$SOURCE_DIR/.next/standalone/.next/BUILD_ID" ]] || fail "missing standalone BUILD_ID"
[[ -d "$SOURCE_DIR/.next/static" ]] || fail "missing .next/static"
[[ -f "$SOURCE_DIR/public/favicon.svg" ]] || fail "missing public/favicon.svg"

mkdir -p "$STAGING_DIR/.next"
cp -R "$SOURCE_DIR/.next/standalone" "$STAGING_DIR/.next/standalone"
rm -rf "$STAGING_DIR/.next/standalone/public" "$STAGING_DIR/.next/standalone/.next/static"
mkdir -p "$STAGING_DIR/.next/standalone/.next"
cp -R "$SOURCE_DIR/public" "$STAGING_DIR/.next/standalone/public"
cp -R "$SOURCE_DIR/.next/static" "$STAGING_DIR/.next/standalone/.next/static"
cp "$SOURCE_DIR/.next/standalone/.next/BUILD_ID" "$STAGING_DIR/.next/standalone/public/__doccanvas_build_id.txt"
cp "$SOURCE_DIR/ecosystem.config.cjs" "$STAGING_DIR/ecosystem.config.cjs"
cp "$SOURCE_DIR/nginx.conf" "$STAGING_DIR/nginx.conf"
cp "$SOURCE_DIR/package.json" "$SOURCE_DIR/package-lock.json" "$STAGING_DIR/"
mkdir -p "$STAGING_DIR/scripts"
cp "$SOURCE_DIR/scripts/verify-release.sh" "$STAGING_DIR/scripts/verify-release.sh"
chmod 0755 "$STAGING_DIR/scripts/verify-release.sh"

ensure_real_directory "$DATA_DIR"
ensure_real_directory "$DATA_DIR/documents"
ensure_real_directory "$DATA_DIR/documents/user"
ensure_real_directory "$DATA_DIR/data"
ensure_real_directory "$DATA_DIR/data/canvases"
ensure_real_directory "$DATA_DIR/data/canvas-states"
ensure_real_directory "$DATA_DIR/data/evolution-audit"

# Publish each missing seed with a same-directory hard link; existing files are untouched.
for index in 0 1 2; do
  source_file="${SEED_SOURCES[$index]}"
  target="$DATA_DIR/documents/${SEED_TARGET_NAMES[$index]}"
  if [[ -e "$target" || -L "$target" ]]; then
    continue
  fi

  temp="${target}.seed.$$"
  SEED_TEMPS+=("$temp")
  cp "$source_file" "$temp"
  chmod 0640 "$temp"
  if ! ln "$temp" "$target" 2>/dev/null; then
    [[ -f "$target" && ! -L "$target" ]] || fail "could not publish seed: $target"
  fi
  rm -f "$temp"
done

[[ ! -e "$RELEASE_DIR" && ! -L "$RELEASE_DIR" ]] || fail "release appeared during assembly: $RELEASE_DIR"
mv "$STAGING_DIR" "$RELEASE_DIR"
rmdir "$PUBLISH_LOCK"
PUBLISH_LOCK_HELD=false
trap - EXIT
SEED_TEMPS=("")

echo "Release candidate prepared"
echo "release_dir=$RELEASE_DIR"
echo "data_dir=$DATA_DIR"
echo "production unchanged; current symlink and services were not modified"
