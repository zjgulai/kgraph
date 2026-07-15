#!/usr/bin/env bash
# Create a checksum-bound, create-only Owner data snapshot while writes are quiesced.
set -Eeuo pipefail
umask 027

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ $# -eq 2 ]] || fail "usage: $0 <data-root> <new-backup-directory>"
[[ "${DOCCANVAS_WRITES_QUIESCED:-0}" == 1 ]] || fail "set DOCCANVAS_WRITES_QUIESCED=1 only after Owner writes are stopped"

DATA_ROOT="$1"
BACKUP_DIR="$2"
[[ "$DATA_ROOT" == /* && "$BACKUP_DIR" == /* ]] || fail "data and backup paths must be absolute"
[[ -d "$DATA_ROOT" && ! -L "$DATA_ROOT" ]] || fail "data root must be a real directory"
[[ ! -e "$BACKUP_DIR" ]] || fail "backup directory already exists"
if find "$DATA_ROOT" -type l -print -quit | grep -q .; then
  fail "data root contains a symlink"
fi

data_real="$(realpath "$DATA_ROOT")"
backup_real="$(realpath -m "$BACKUP_DIR")"
[[ "$backup_real" != "$data_real"/* ]] || fail "backup directory must be outside the data root"

mkdir -m 0750 "$BACKUP_DIR"
cleanup() { rm -rf "$BACKUP_DIR"; }
trap cleanup EXIT

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$BACKUP_DIR/doccanvas-owner-data-$timestamp.tar.gz"
tar --numeric-owner --sort=name -C "$(dirname "$DATA_ROOT")" -czf "$archive" "$(basename "$DATA_ROOT")"
tar -tzf "$archive" >/dev/null
archive_sha="$(sha256sum "$archive" | awk '{print $1}')"
file_count="$(find "$DATA_ROOT" -type f | wc -l | tr -d ' ')"
byte_count="$(du -sb "$DATA_ROOT" | awk '{print $1}')"
{
  echo "schema_version=1"
  echo "created_at=$timestamp"
  echo "archive=$(basename "$archive")"
  echo "archive_sha256=$archive_sha"
  echo "file_count=$file_count"
  echo "source_bytes=$byte_count"
  echo "writes_quiesced=true"
} > "$BACKUP_DIR/manifest.env"
sha256sum "$BACKUP_DIR/manifest.env" > "$BACKUP_DIR/manifest.env.sha256"
chmod 0440 "$archive" "$BACKUP_DIR/manifest.env" "$BACKUP_DIR/manifest.env.sha256"

trap - EXIT
echo "backup_ready=true"
echo "archive_sha256=$archive_sha"
echo "manifest=$BACKUP_DIR/manifest.env"
