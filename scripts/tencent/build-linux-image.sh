#!/usr/bin/env bash
# Build an immutable linux/amd64 image from an external allowlist context.
set -Eeuo pipefail
umask 027

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ $# -eq 2 ]] || fail "usage: $0 <release-id> <output-dir>"

RELEASE_ID="$1"
OUTPUT_DIR="$2"
[[ "$RELEASE_ID" =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8,64}$ ]] || fail "invalid release id"
[[ "${NODE_IMAGE:-}" =~ ^node:22-bookworm-slim@sha256:[a-f0-9]{64}$ ]] || fail "NODE_IMAGE must be node:22-bookworm-slim@sha256:<64 hex>"
RUNTIME_IMAGE="${RUNTIME_IMAGE:-gcr.io/distroless/nodejs22-debian13@sha256:773a62fbe24a3f8c8b24b16fd59154627f8b406737bc906f83bf1732bc8907dd}"
[[ "$RUNTIME_IMAGE" =~ ^gcr\.io/distroless/nodejs22-debian13@sha256:[a-f0-9]{64}$ ]] || fail "RUNTIME_IMAGE must be a digest-pinned distroless Node 22 image"
[[ ! -e "$OUTPUT_DIR" ]] || fail "output directory already exists: $OUTPUT_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DOCCANVAS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
GIT_COMMIT_SHA="$(git -C "$DOCCANVAS_ROOT" rev-parse HEAD)"
RELEASE_COMMIT_PREFIX="${RELEASE_ID##*-}"
[[ "$GIT_COMMIT_SHA" == "$RELEASE_COMMIT_PREFIX"* ]] || fail "release id does not match HEAD"
git -C "$DOCCANVAS_ROOT" diff --quiet || fail "tracked worktree changes must be committed before build"
git -C "$DOCCANVAS_ROOT" diff --cached --quiet || fail "staged changes must be committed before build"
UNTRACKED_SOURCE="$(git -C "$DOCCANVAS_ROOT" ls-files --others --exclude-standard -- \
  Dockerfile .dockerignore package.json package-lock.json tsconfig.json next.config.ts \
  postcss.config.mjs playwright.config.ts ecosystem.config.cjs nginx.conf app components lib opendesign \
  public documents scripts tests deploy)"
[[ -z "$UNTRACKED_SOURCE" ]] || fail "untracked file found in release allowlist"
CONTEXT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/doccanvas-build-context.XXXXXX")"
OUTPUT_PARENT="$(dirname "$OUTPUT_DIR")"
mkdir -p "$OUTPUT_PARENT"
STAGING_OUTPUT="${OUTPUT_DIR}.staging.$$"
[[ ! -e "$STAGING_OUTPUT" ]] || fail "staging output already exists: $STAGING_OUTPUT"
mkdir "$STAGING_OUTPUT"
cleanup() { rm -rf "$CONTEXT_DIR" "$STAGING_OUTPUT"; }
trap cleanup EXIT

mkdir -p "$CONTEXT_DIR/doccanvas"
cp "$DOCCANVAS_ROOT/Dockerfile" "$CONTEXT_DIR/Dockerfile"
cp "$DOCCANVAS_ROOT/.dockerignore" "$CONTEXT_DIR/.dockerignore"
for file in package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs playwright.config.ts ecosystem.config.cjs nginx.conf Dockerfile .dockerignore; do
  cp "$DOCCANVAS_ROOT/$file" "$CONTEXT_DIR/doccanvas/$file"
done
for dir in app components lib opendesign public documents scripts tests deploy; do
  cp -R "$DOCCANVAS_ROOT/$dir" "$CONTEXT_DIR/doccanvas/$dir"
done

if find "$CONTEXT_DIR" -type f \( -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name '*.pfx' -o -name '.env' -o -name '.env.*' \) -print | grep -q .; then
  fail "sensitive filename found in allowlist context"
fi
if rg -Il 'BEGIN ([A-Z ]+ )?PRIVATE KEY' "$CONTEXT_DIR" | grep -q .; then
  fail "sensitive private-key marker found in allowlist context"
fi

SOURCE_SHA="$(find "$CONTEXT_DIR" -type f ! -name '.dockerignore' -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')"
BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
IMAGE_TAG="doccanvas-kgraph:${RELEASE_ID}"
find "$CONTEXT_DIR" -type f -print | sed "s#^$CONTEXT_DIR/##" | LC_ALL=C sort > "$STAGING_OUTPUT/context-manifest.txt"
docker buildx build \
  --platform linux/amd64 \
  --load \
  --metadata-file "$STAGING_OUTPUT/build-metadata.json" \
  --build-arg "NODE_IMAGE=$NODE_IMAGE" \
  --build-arg "RUNTIME_IMAGE=$RUNTIME_IMAGE" \
  --build-arg "SOURCE_SHA=$SOURCE_SHA" \
  --build-arg "RELEASE_ID=$RELEASE_ID" \
  --build-arg "BUILD_TIMESTAMP=$BUILD_TIMESTAMP" \
  --tag "$IMAGE_TAG" \
  --file "$CONTEXT_DIR/Dockerfile" \
  "$CONTEXT_DIR"

MANIFEST_DIGEST="$(node -e '
  const metadata = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const digest = metadata["containerimage.digest"];
  if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? "")) process.exit(1);
  process.stdout.write(digest);
' "$STAGING_OUTPUT/build-metadata.json")" || fail "build metadata is missing the manifest digest"
RUNTIME_CONFIG_DIGEST="$(node -e '
  const metadata = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const digest = metadata["containerimage.config.digest"];
  if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? "")) process.exit(1);
  process.stdout.write(digest);
' "$STAGING_OUTPUT/build-metadata.json")" || fail "build metadata is missing the runtime config digest"
IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$IMAGE_TAG")"
[[ "$IMAGE_ID" == "$RUNTIME_CONFIG_DIGEST" ]] || fail "loaded image ID does not match runtime config digest"
PLATFORM="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$IMAGE_TAG")"
[[ "$PLATFORM" == "linux/amd64" ]] || fail "unexpected image platform: $PLATFORM"
docker save "$IMAGE_TAG" | gzip -n > "$STAGING_OUTPUT/${RELEASE_ID}.tar.gz"
ARCHIVE_SHA="$(shasum -a 256 "$STAGING_OUTPUT/${RELEASE_ID}.tar.gz" | awk '{print $1}')"
{
  echo "release_id=$RELEASE_ID"
  echo "git_commit_sha=$GIT_COMMIT_SHA"
  echo "image_tag=$IMAGE_TAG"
  echo "image_id=$IMAGE_ID"
  echo "manifest_digest=$MANIFEST_DIGEST"
  echo "runtime_config_digest=$RUNTIME_CONFIG_DIGEST"
  echo "platform=$PLATFORM"
  echo "source_sha256=$SOURCE_SHA"
  echo "archive_sha256=$ARCHIVE_SHA"
  echo "node_image=$NODE_IMAGE"
  echo "runtime_image=$RUNTIME_IMAGE"
  echo "build_timestamp=$BUILD_TIMESTAMP"
  echo "evidence_grade=L2-fixture-or-dry-run"
  echo "production_status=unchanged"
} > "$STAGING_OUTPUT/image-manifest.env"

mv "$STAGING_OUTPUT" "$OUTPUT_DIR"
trap - EXIT
rm -rf "$CONTEXT_DIR"

echo "image_tag=$IMAGE_TAG"
echo "manifest=$OUTPUT_DIR/image-manifest.env"
echo "production unchanged"
