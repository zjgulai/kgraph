#!/usr/bin/env bash
# Prepare the dedicated writable Owner data tree without overwriting existing documents.
set -Eeuo pipefail
umask 027

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ $# -eq 2 ]] || fail "usage: $0 <data-root> <seed-documents-root>"
[[ "${EUID}" -eq 0 ]] || fail "prepare-owner-data must run as root"

DATA_ROOT="$1"
SEED_ROOT="$2"
[[ "$DATA_ROOT" == /* && "$SEED_ROOT" == /* ]] || fail "data and seed roots must be absolute"
[[ "$DATA_ROOT" != / ]] || fail "refusing to use filesystem root as data root"
[[ -d "$SEED_ROOT" && ! -L "$SEED_ROOT" ]] || fail "seed root must be a real directory"
for name in VibeTrack.md v2.7-Pro.md Playbook-v2.md; do
  [[ -f "$SEED_ROOT/$name" && ! -L "$SEED_ROOT/$name" ]] || fail "missing seed document: $name"
done
[[ ! -L "$DATA_ROOT" ]] || fail "data root must not be a symlink"

install -d -o 10001 -g 10001 -m 0750 \
  "$DATA_ROOT" \
  "$DATA_ROOT/documents" \
  "$DATA_ROOT/documents/user" \
  "$DATA_ROOT/data/canvases" \
  "$DATA_ROOT/data/canvas-states" \
  "$DATA_ROOT/data/evolution-audit" \
  "$DATA_ROOT/data/presentation" \
  "$DATA_ROOT/data/knowledge-candidates" \
  "$DATA_ROOT/data/captures" \
  "$DATA_ROOT/data/revisions" \
  "$DATA_ROOT/data/transactions" \
  "$DATA_ROOT/data/revision-audit" \
  "$DATA_ROOT/data/assets/portraits"

if find "$DATA_ROOT" -type l -print -quit | grep -q .; then
  fail "data root contains a symlink"
fi

seeded=0
preserved=0
for name in VibeTrack.md v2.7-Pro.md Playbook-v2.md; do
  destination="$DATA_ROOT/documents/$name"
  if [[ -e "$destination" ]]; then
    [[ -f "$destination" && ! -L "$destination" ]] || fail "seed destination is not a regular file: $name"
    preserved=$((preserved + 1))
  else
    install -o 10001 -g 10001 -m 0640 "$SEED_ROOT/$name" "$destination"
    seeded=$((seeded + 1))
  fi
done

chown -R --no-dereference 10001:10001 "$DATA_ROOT"
find "$DATA_ROOT" -type d -exec chmod 0750 {} +
find "$DATA_ROOT" -type f -exec chmod 0640 {} +
if find "$DATA_ROOT" \( ! -user 10001 -o ! -group 10001 \) -print -quit | grep -q .; then
  fail "data ownership verification failed"
fi

echo "owner_data_ready=true"
echo "seeded_documents=$seeded"
echo "preserved_documents=$preserved"
echo "owner_uid=10001"
