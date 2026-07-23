# UI-098 Source Checkpoint Commit Scope

- Prepared: `2026-07-23 CST`
- Branch: `codex/architecture-house-ui`
- Base HEAD: `c9fc93dc4096a819232d50a1d78f3593db957273`
- Proposed commit subject: `feat: complete governed workbench acceptance and knowledge workflow`
- Status: `PREPARED / NOT STAGED / NOT COMMITTED / NOT PUSHED`
- Production: `unchanged`

## Authorization boundary

This document defines a source-checkpoint-only commit. It does not authorize candidate construction, Provider calls, canonical writes, L3 access, backup, activation, rollback, or any production change.

If authorized, staging must name only the 79 paths in this document. `git add .`, `git add -A`, pathspecs that include ignored/unlisted files, and any mutation outside this allowlist are forbidden.

## Integrity

- Authorized path count, including this scope document: `79`
- Payload path count, excluding this self-referential scope document: `78`
- Authorized path-set SHA-256: `0f1312997feeb21e91cc3467525ad115089ad54b0340709a2bcb353457d7a09e`
- Payload content-manifest SHA-256: `fdaa1372ad268cdf25c51764f4235818b3709a6026f3bd35a04c2f5fe55be3fb`
- Scope document SHA-256: computed externally after this document is frozen

The path-set digest is the SHA-256 of the lexicographically sorted, newline-terminated 79-path list below. The payload content-manifest digest is the SHA-256 of the newline-terminated `shasum -a 256 <path>` output for the sorted 78 payload paths. The scope document is excluded from that content manifest to avoid a self-referential digest and is bound separately by its own SHA-256.

## Pre-stage evidence

- Focused UI-022–025 tests: `15/15` passed.
- Complete Node test suite: `366/366` passed.
- TypeScript: passed.
- Next production build: passed, `20` pages.
- UI-022–025 Playwright focus: `3/3` passed.
- Complete Chromium/WebKit/mobile Playwright sequence: `50 passed / 22 intentionally skipped / 0 failed`.
- `git diff --check`: passed.
- Forbidden-path hits: `0`.
- Symlinks: `0`.
- Files larger than 5 MiB: `0`.
- High-confidence secret scan: `0` path hits.

These are local L2 source/browser facts. They do not prove an immutable image or current production state.

## Explicit exclusions

The commit must exclude:

- `output/**`
- `.kiro/**`
- `data/**`
- `secrets/**`
- Provider artifacts and live call evidence
- Playwright/browser reports outside the versioned visual baselines listed below
- local probe images, image archives, release archives and metadata archives
- historical images, backups and transaction journals
- all other paths not listed in the allowlist

## Exact authorized path allowlist

```text
DESIGN.md
README.md
UI098-SOURCE-CHECKPOINT-COMMIT-SCOPE.md
app/canvas.css
app/globals.css
app/knowledge-workspace.css
components/canvas/ArchitectureNodes.tsx
components/canvas/CanvasClientWrapper.tsx
components/canvas/CanvasPresentationSwitch.tsx
components/canvas/CanvasToolbar.tsx
components/canvas/CanvasViewer.tsx
components/canvas/DigitalEmployee.tsx
components/canvas/FactoryHeader.tsx
components/canvas/FactoryOwnerInspector.tsx
components/canvas/FactorySceneCanvas.tsx
components/canvas/MobileCanvasNavigation.tsx
components/canvas/NodeDetailSheet.tsx
components/canvas/OwnerSessionControl.tsx
components/ui/DesignSystemFixture.tsx
components/ui/Dialog.tsx
components/ui/MutationStatus.tsx
components/ui/primitives.css
components/workbench/CommandPalette.tsx
components/workbench/WorkQueue.tsx
components/workbench/WorkbenchShell.tsx
components/workbench/workbench.css
components/workspace/BlueprintWorkspace.tsx
components/workspace/CaptureWorkspace.tsx
components/workspace/EnrichmentWorkspace.tsx
components/workspace/EvidenceRegistryWorkspace.tsx
components/workspace/KnowledgeInspector.tsx
components/workspace/KnowledgeLibrary.tsx
components/workspace/KnowledgeReviewWorkspace.tsx
components/workspace/KnowledgeWorkspace.tsx
components/workspace/ProviderOperationsWorkspace.tsx
components/workspace/SolutionStudioWorkspace.tsx
docs/engineering/d9-automated-acceptance.md
docs/engineering/factory-scene-v3.md
docs/engineering/governed-workbench-release-reconciliation.md
docs/engineering/governed-workbench-ui-inventory.md
docs/engineering/ui098-knowledge-workflow-implementation.md
docs/engineering/ui098-preflight-reconciliation.md
docs/product/doccanvas-product-review-and-role-manual.html
docs/superpowers/plans/2026-07-22-doccanvas-governed-workspace-ui-interaction-redesign-plan.md
lib/client/performance-telemetry.ts
lib/knowledge/gold-workspace-draft.ts
lib/knowledge/library-types.ts
lib/knowledge/library-view.ts
lib/presentation/human-labels.ts
lib/workbench/draft-navigation.ts
lib/workbench/routes.ts
tests/action-feedback.test.ts
tests/architecture-surfaces.test.ts
tests/canvas-production-contract.test.ts
tests/d10-documentation-contract.test.ts
tests/d9-acceptance-contract.test.ts
tests/design-system-v2.test.ts
tests/e2e/__screenshots__/d9-acceptance.spec.ts/chromium-desktop/governed-state-gallery.png
tests/e2e/__screenshots__/d9-acceptance.spec.ts/chromium-mobile/governed-state-gallery.png
tests/e2e/__screenshots__/d9-acceptance.spec.ts/webkit-desktop/governed-state-gallery.png
tests/e2e/__screenshots__/design-system-v2.spec.ts/chromium-desktop/workbench-primitives.png
tests/e2e/__screenshots__/factory-canvas.spec.ts/chromium-desktop/playbook-overview-factory.png
tests/e2e/__screenshots__/factory-canvas.spec.ts/chromium-desktop/playbook-overview.png
tests/e2e/__screenshots__/factory-canvas.spec.ts/chromium-mobile/playbook-mobile-process-rail.png
tests/e2e/__screenshots__/factory-canvas.spec.ts/webkit-desktop/playbook-overview-factory.png
tests/e2e/__screenshots__/factory-canvas.spec.ts/webkit-desktop/playbook-overview.png
tests/e2e/d9-acceptance.spec.ts
tests/e2e/design-system-v2.spec.ts
tests/e2e/factory-canvas.spec.ts
tests/e2e/product-chain.spec.ts
tests/e2e/workbench.spec.ts
tests/editorial-ui-contract.test.ts
tests/governed-workbench-design-contract.test.ts
tests/knowledge-enrichment.test.ts
tests/knowledge-workspace.test.ts
tests/ui098-knowledge-blockers.test.ts
tests/ui098-preflight-blockers.test.ts
tests/workbench-route.test.ts
tests/workbench-shell.test.ts
```

## Required post-authorization procedure

1. Recompute the path-set, payload content-manifest and scope-document SHA-256 values; fail closed on any mismatch.
2. Stage each allowlisted path explicitly and nothing else.
3. Inspect `git diff --cached --name-status`, staged binary list, staged secret scan and staged diff summary.
4. Recompute the staged path-set and staged payload content manifest; fail closed on any mismatch.
5. Commit with the exact approved subject.
6. Confirm the commit contains exactly the 79 authorized paths, then push only to `origin/codex/architecture-house-ui`.
7. Stop. A pushed source checkpoint is not a candidate or deployment authorization.
