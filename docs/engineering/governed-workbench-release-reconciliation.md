---
title: Governed Workbench D0-D10 release reconciliation
status: d5_checkpoint_verified_awaiting_exact_scope_authorization
updated: 2026-07-22
---

# Governed Workbench release reconciliation

## Purpose and evidence boundary

This record reconciles the approved D0-D10 redesign plan with the existing Factory Scene v3 implementation before any source commit, candidate build, or production action.

Current supported conclusion:

`D0-D5 checkpoint locally verified / global Canvas performance gate open / D6-D10 release acceptance incomplete / production unchanged`

This record does not authorize staging, commit, push, Provider calls, canonical promotion, candidate construction, production access, backup, or activation.

## Status authority

The UI identifiers in `docs/superpowers/plans/2026-07-22-doccanvas-governed-workspace-ui-interaction-redesign-plan.md` are the current redesign identifiers. Earlier `.kiro/plan/task_plan.md` D1-D5 tables used several local batch identifiers for different meanings; those identifiers are historical batch labels and must not override the versioned redesign TODO.

Examples of the collision:

- redesign `UI-010` means the human-readable label registry;
- the local D2 table used `UI-010` for the primitive component batch;
- redesign `UI-060` means the final token-v2 release contract, while D2 already delivered a primitive token foundation.

Future completion claims must cite the redesign item text, not an identifier alone.

## D0-D5 checkpoint

| Slice | Current evidence | Remaining boundary |
|---|---|---|
| D0 baseline | inventory, design contract, three viewport baselines | production visual baseline must be refreshed at the release gate |
| D1 shell | typed URL state, four domains, command palette, real counts | complete under the local checkpoint |
| D2 primitives | shared controls, overlays, states, keyboard and reduced-motion tests | the global label and mutation-state registries remain open P0 work |
| D3 Knowledge | Capture handoff, draft recovery, conflict merge and candidate-only Review | complete Library URL state, virtualized list, three-pane Review and promotion decision history remain open |
| D4 Product | Task, Solution, Blueprint diff/CAS and Artifact provenance | complete under the local checkpoint |
| D5 Operations | Evidence Registry, registry-derived readiness, unified Timeline and read-only Provider Ops | separated canary/batch/gold queues and real external evidence ingestion remain open |

The D0-D5 checkpoint may be preserved as a non-release branch commit after an exact path allowlist is reviewed and explicitly authorized. It must not be described as a release candidate.

Fresh checkpoint verification on 2026-07-22:

- D0-D5 focused node tests: `59/59`.
- complete unit suite: `346/346`.
- TypeScript and production build: passed.
- D0-D5 Chromium/WebKit/mobile browser verticals: `18/18`.
- complete Playwright: `31 passed / 16 intentionally skipped / 1 failed`; the only failure was the 1000/2000 fixture at `54.545fps` against the unchanged `55fps` threshold.
- exact isolated performance rerun: `1/1` passed.

The isolated pass supports an order/load-sensitive diagnosis but does not override the failed complete-suite release gate.

## D6-D8 inherited capability audit

| Redesign items | Existing capability and evidence | Reconciliation status |
|---|---|---|
| UI-067 | `factory-scene.ts`, `orthogonal-router.ts`, model/route/SVG count checks, arrow and hit-path browser checks | `inherited_core_present / D6 integration reacceptance required` |
| UI-068 | live endpoints, bounded incremental reroute and exact reroute on drag completion | `inherited_core_present / performance reacceptance required` |
| UI-069 | upstream/downstream highlighting, cancelable one-shot tracer and reduced-motion path | `inherited_core_present / Map-Factory acceptance required` |
| UI-070 | read-only `FactoryRelationInspector` and Chinese relationship labels | `inherited_core_present / Workbench navigation acceptance required` |
| UI-071 | 72px restrained roof, semantic titles and 2.5D material rules | `Factory present / Map presentation and shell separation incomplete` |
| UI-073 | 4:5 preview, normalized portrait pipeline and deterministic fallback employees | `inherited_core present / complete upload-state design reacceptance required` |
| UI-081-082 | mobile read-only process rail, 44px controls and viewport containment tests | `inherited_core present / full three-breakpoint shell acceptance incomplete` |
| UI-086 | real 1000-node/2000-relation production fixture exists | `BLOCK: full-suite result 52.94-53.73fps below 55fps` |

Items not supplied by the inherited Canvas core include the Map-first presentation, Map/Factory switch, final module boundaries, density control, route splitting, global CSS decomposition, performance telemetry, and the complete D9 acceptance suite.

## Release-blocking work

### P0 product and Knowledge contracts

- `UI-010`, `UI-013`, `UI-014`: global labels, mutation states, and all-form draft/leave behavior.
- `UI-022` through `UI-025`: Library URL state/virtualization and Inspector/Review restructuring.
- `UI-027`: per-item legacy promotion decision and history; canonical write remains a separate authorization.
- `UI-029`: separated canary review, 19-call batch and 20-item gold queues.

### D6-D8 product and engineering acceptance

- Map/Factory presentation contract and Canvas integration.
- three responsive shell ranges, tablet drawer, mobile read-only details and safe-area behavior.
- dynamic loading, CSS ownership/budgets, list virtualization and performance telemetry.
- stable full-suite 1000/2000 performance evidence without lowering the 55fps threshold.

### D9-D10 release acceptance

- complete browser, CRUD/CAS/restore, state snapshot, accessibility and five-task usability evidence.
- final product design logic, Owner/Reviewer/Operator manual and module evolution map in HTML.
- exact clean commit, immutable image and metadata; L2 image smoke and fresh L3 production-readonly evidence.
- quiesced fresh backup and a new exact commit/image/backup/window activation authorization.

## D0-D5 checkpoint commit gate

Before staging:

1. Freeze an explicit path allowlist; never use `git add .`.
2. Exclude `output/**`, `.kiro/**`, `data/**`, secrets, Provider artifacts, browser reports, historical images and backups.
3. Review every tracked modification and untracked non-output file for D0-D5 ownership.
4. Run a filename and content secret scan that reports paths only.
5. Bind the path list and current diff to SHA-256 values.
6. Re-run focused contracts, full unit, typecheck, production build and D0-D5 browser paths.
7. Record the global performance failure honestly; a checkpoint commit can preserve work but cannot become a release source.
8. Stop for explicit authorization of the exact scope hash before staging, committing or pushing.

## Deployment gate after D6-D10

Only a later clean, pushed release commit can enter candidate construction. Candidate smoke, production L3, fresh backup, app-only activation, and production acceptance remain separate evidence layers and require their own exact identities and authorization.
