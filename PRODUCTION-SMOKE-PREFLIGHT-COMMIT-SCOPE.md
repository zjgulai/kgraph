# Production smoke preflight source checkpoint

- Prepared: `2026-07-23T13:52:25+08:00`
- Branch: `codex/architecture-house-ui`
- Base HEAD: `314ab342306e0e4a6bf48b26a6fe22b9246c3e24`
- Upstream HEAD: `314ab342306e0e4a6bf48b26a6fe22b9246c3e24`
- Proposed commit subject: `fix: close production smoke security and focus gates`
- Status: `PREPARED / NOT STAGED / NOT COMMITTED / NOT PUSHED`
- Production: `unchanged`

## Authorization boundary

This document defines a source-checkpoint-only commit and push. It does not
authorize candidate construction, Provider calls, canonical writes, production
access, backup, activation, rollback, or any production change.

If separately authorized, staging must name only the seven paths in this
document. `git add .`, `git add -A`, broad pathspecs, and any mutation outside
this allowlist are forbidden.

## Integrity

- Authorized path count, including this scope document: `7`
- Payload path count, excluding this self-referential scope document: `6`
- Authorized path-set SHA-256: `bbec890f6bf00dbac3630d2852a5644dda2c28c46197eef03c408b94e603ac37`
- Payload content-manifest SHA-256: `29b1c2d2f77ddd2f81caaa44e9cf0970c070f91cc5791a133ca47e1648b2907c`
- Scope document SHA-256: computed externally after this document is frozen

The path-set digest is the SHA-256 of the lexicographically sorted,
newline-terminated seven-path list below. The payload content-manifest digest is
the SHA-256 of the newline-terminated `shasum -a 256 <path>` output for the
sorted six payload paths. This scope document is excluded from that content
manifest to avoid a self-referential digest and is bound separately by its own
SHA-256.

## Change intent

- Pin Next.js to `15.5.21` and Sharp to `0.35.3`.
- Force Next.js to use the fixed root Sharp package instead of installing a
  vulnerable nested optional version.
- Restore Dialog focus to the latest mounted trigger rather than a detached DOM
  node captured before a parent rerender.
- Align dashboard and governance contract tests with the authenticated Owner
  session-loading boundary and the verified browser-acceptance state.

## Pre-stage evidence

- TypeScript: passed.
- Complete Node test suite: `366/366` passed.
- Next.js production build: passed, `20` pages.
- Complete Chromium/WebKit/mobile Playwright sequence:
  `50 passed / 22 intentionally skipped / 0 failed`.
- Chromium Dialog focus stress rerun: `3/3` passed.
- Production dependency audit: `0` vulnerabilities across `106` production
  dependencies.
- Compose static render: passed with ephemeral local secret files; no service
  was started.
- `git diff --check`: passed.
- High-confidence secret scan across all six payload paths: `0` hits.

These are local source and browser facts. They do not prove an immutable image
or current production state.

## Explicit exclusions

The commit must exclude:

- `output/**`
- `.kiro/**`
- `data/**`
- `secrets/**`
- Provider artifacts, receipts, ledgers, and live-call evidence
- Playwright/browser reports and generated screenshots
- local probe images, image archives, release archives, and metadata archives
- historical images, backups, and transaction journals
- all other paths not listed in the allowlist

## Exact authorized path allowlist

```text
PRODUCTION-SMOKE-PREFLIGHT-COMMIT-SCOPE.md
components/ui/Dialog.tsx
package-lock.json
package.json
tests/design-system-v2.test.ts
tests/governed-workbench-design-contract.test.ts
tests/workspace-dashboard.test.ts
```

## Required post-authorization procedure

1. Recompute the path-set, payload content-manifest, and scope-document SHA-256
   values; fail closed on any mismatch.
2. Stage each allowlisted path explicitly and nothing else.
3. Inspect `git diff --cached --name-status`, the staged binary list, staged
   secret scan, and staged diff summary.
4. Recompute the staged path-set and staged payload content manifest; fail
   closed on any mismatch.
5. Commit with the exact approved subject.
6. Confirm the commit contains exactly the seven authorized paths, then push
   only to `origin/codex/architecture-house-ui`.
7. Stop. A pushed source checkpoint is not a candidate or deployment
   authorization.
