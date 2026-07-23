---
title: Governed Workbench D0-D10 release reconciliation
status: local-acceptance-complete-source-checkpoint-preparation
updated: 2026-07-23
---

# Governed Workbench release reconciliation

## Purpose and evidence boundary

This record reconciles the approved D0-D10 redesign plan with the existing Factory Scene v3 implementation before any source commit, candidate build, or production action.

Current supported conclusion:

`D0-D5 checkpoint pushed / D6-D10 locally verified / UI-022–025 browser verified / source-checkpoint preparation only / production unchanged`

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
| D3 Knowledge | Capture handoff, shared leave guard/draft recovery, shareable/virtualized Library, evidence-first Inspector, queue/source/diff Review and conflict merge | current-version browser sequence passed; promotion history remains a separate canonical authorization scope |
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
| UI-067 | `factory-scene.ts`, `orthogonal-router.ts`, model/route/SVG count checks, arrow and hit-path browser checks | `D6 reaccepted / all builtins aligned in Chromium and WebKit` |
| UI-068 | live endpoints, bounded incremental reroute and exact reroute on drag completion | `inherited_core_present / performance reacceptance required` |
| UI-069 | upstream/downstream highlighting, cancelable one-shot tracer and reduced-motion path | `D6 reaccepted / same scene core across Map and Factory` |
| UI-070 | read-only `FactoryRelationInspector` and Chinese relationship labels | `D6 reaccepted / mouse and keyboard paths verified` |
| UI-071 | 72px restrained roof, semantic titles and 2.5D material rules | `D6 complete locally / 2.5D confined to Factory presentation` |
| UI-073 | 4:5 preview, normalized portrait pipeline and deterministic fallback employees | `completed_local / deterministic asset and upload-state contract reaccepted in UI-098 preflight batch 1` |
| UI-081-082 | mobile read-only process rail, 44px controls and viewport containment tests | `D7 complete locally / 390px readonly detail and safe-area reaccepted` |
| UI-086 | real 1000-node/2000-relation production fixture exists | `D8 complete locally / isolated 3-of-3 and final full-suite order passed` |

Items still not supplied by D6 include final camera/routing/selection/export module boundaries and density control. Route splitting, CSS decomposition, performance telemetry and the D9 automated acceptance suite were completed by D8-D9.

Fresh D6 evidence on 2026-07-22:

- complete unit/contract suite `347/347`, TypeScript and production build passed;
- Map is the desktop default and Factory is an explicit presentation switch over one `FactorySceneCanvas`;
- Chromium/WebKit Map and Factory baselines, all-builtin relation parity, relation Inspector and tracer paths passed;
- Chromium PNG/full-scene SVG downloads and the four-relation standalone SVG contract passed;
- Chromium mobile readonly process rail passed;
- no commit, push, candidate construction or production action was performed for D6.

Fresh D7 evidence on 2026-07-23:

- focused responsive contracts `40/40`, complete unit/contract suite `350/350`, TypeScript and production build passed;
- 1440/1024/390 browser acceptance confirmed the three shell ranges, and fixed a real inherited tablet grid-column defect before reacceptance;
- 1024px reader drawer is 420px wide with 12px right/bottom clearance; 390px has no horizontal overflow and presents five 75×48px bottom navigation targets;
- mobile module relations remain in the vertical process rail; node detail is a 390×844 readonly sheet with no visible Owner or write controls and console `0/0`; the Pixel 7 visual case passed `1/1` after the approved baseline update;
- the global 1000/2000 performance gate remains open for D8; D7 performed no commit, push, candidate or production action.

## Release-blocking work

### P0 product and Knowledge contracts

- `UI-010`, `UI-013` are complete; `UI-014` is complete locally through the shared dirty registry and versioned Human Gold draft.
- `UI-022` through `UI-025`: completed locally with `366/366` unit, typecheck/build, Chromium CLI desktop/mobile evidence and fresh full Playwright `50/22/0`; exact source scope is now the next hard gate.
- `UI-027`: per-item legacy promotion decision and history; canonical write remains a separate authorization.
- `UI-029`: separated canary review, 19-call batch and 20-item gold queues.

### D8 product and engineering acceptance

- `completed_local`: dynamic loading, CSS ownership/budgets, image loading rules and local performance telemetry are implemented.
- `completed_local`: stable full-suite 1000/2000 performance evidence passed without lowering the 55fps threshold.
- final evidence: unit `353/353`, typecheck/build passed, Playwright `34 passed / 17 intentionally skipped / 0 failed`; no release or production action followed.

### D9-D10 release acceptance

- D9 completed locally: browser, CRUD/CAS/restore, state snapshot, accessibility and five-task automated usability evidence passed; real moderated users and assistive-technology sessions remain an explicit evidence limit.
- D10/UI-097 completed locally: final product design logic, Owner/Reviewer/Operator manual and module evolution map are published as `docs/product/doccanvas-product-review-and-role-manual.html`.
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
