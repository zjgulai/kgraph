# Image verification context patch commit scope

- Prepared: `2026-07-23T14:22:32+08:00`
- Branch: `codex/architecture-house-ui`
- Base HEAD: `aac3aa7878be228fccc924fba163399066eeb969`
- Proposed commit subject: `fix: include design evidence in image verification`
- Status: `PREPARED / NOT STAGED / NOT COMMITTED / NOT PUSHED`
- Production: `unchanged`

## Authorization boundary

This document defines a source-checkpoint-only commit and push. It does not
authorize Docker cache pruning, image deletion, candidate reconstruction,
production access, upload, backup, activation, rollback, or any production
change.

If separately authorized, staging must name only the four paths in this
document. `git add .`, `git add -A`, broad pathspecs, and any mutation outside
this allowlist are forbidden.

## Failure evidence and change intent

Candidate attempt `20260723T061211Z-aac3aa7878be` failed closed inside the
builder's `npm run verify:local` step:

- `357/359` builder-context tests passed.
- The two failures were missing `DESIGN.md` and
  `docs/product/doccanvas-product-review-and-role-manual.html`.
- No candidate image, output directory, staging directory, or temporary build
  context remained.
- Production remained unchanged.

The patch keeps the external build context allowlisted while adding
`README.md`, `DESIGN.md`, and `docs/**` to the builder verification context.
The runtime stage remains unchanged and does not copy these verification-only
documents into the production image.

## Integrity

- Authorized path count, including this scope document: `4`
- Payload path count, excluding this self-referential scope document: `3`
- Authorized path-set SHA-256: `45bd7e0398b54bae2b2d84008fc342536c92baa6892577855157b1d7cbd27d38`
- Payload content-manifest SHA-256: `443c2933a6776d0ac93a56c3f8121ea6aff552f23cc7888bdc9cfd0fc41db94f`
- Scope document SHA-256: computed externally after this document is frozen

The path-set digest is the SHA-256 of the lexicographically sorted,
newline-terminated four-path list below. The payload content-manifest digest is
the SHA-256 of the newline-terminated `shasum -a 256 <path>` output for the
sorted three payload paths. This scope document is excluded from that content
manifest to avoid a self-referential digest and is bound separately by its own
SHA-256.

## Verification

- Failed candidate residue: `0` image, target, staging, or temporary context.
- `bash -n scripts/tencent/build-linux-image.sh`: passed.
- Focused image-context and documentation contracts: `21/21` passed.
- Complete local unit suite: `366/366` passed.
- TypeScript: passed.
- Next.js production build: passed, `20` pages.
- `git diff --check`: passed.
- Current disk after verification: `7.491 GiB`; below the build gate, so no
  reconstruction is authorized or attempted by this scope.

## Explicit exclusions

- `output/**`
- `.kiro/**`
- `data/**`
- `secrets/**`
- Provider artifacts, receipts, ledgers, and live-call evidence
- Playwright/browser reports
- candidate images, image archives, release archives, metadata archives
- historical images, backups, and transaction journals
- Docker cache, images, containers, volumes, and networks
- all other paths not listed below

## Exact authorized path allowlist

```text
Dockerfile
IMAGE-VERIFICATION-CONTEXT-PATCH-COMMIT-SCOPE.md
scripts/tencent/build-linux-image.sh
tests/tencent-docker-contract.test.ts
```

## Required post-authorization procedure

1. Recompute scope, path-set, and payload content-manifest hashes.
2. Stage the four paths explicitly and nothing else.
3. Verify staged names, binary list, secret scan, diff, and all three hashes.
4. Commit with the exact approved subject.
5. Verify the commit object contains the same four paths and hashes.
6. Push only to `origin/codex/architecture-house-ui`.
7. Stop. Candidate reconstruction requires both sufficient disk and separate
   authorization.
