---
title: DocCanvas Governed Workbench UI Inventory and D0 Baseline
status: d5-evidence-registry-core-complete-global-performance-gate-open
updated: 2026-07-22
scope: current local source and local browser behavior
evidence_level: local-static-audit-plus-cross-browser-knowledge-product-evidence-verticals-and-visual-baseline
production: unchanged
---

# DocCanvas Governed Workbench UI Inventory and D0 Baseline

## 0. Purpose

本文档冻结 UI 重构前的页面、对象、动作、状态、权限和可用性基线。它只描述 2026-07-22 当前本地源码与本地浏览器行为，不是新设计验收，不更新历史 `audit/`，也不代表生产现状刷新。

后续 D1–D10 必须以本 inventory 判断：

- 哪些产品能力已经存在，应该迁移而不是重写；
- 哪些交互只是视觉假象或缺少完整状态；
- 哪些状态和数量没有可靠数据来源；
- 哪些验收需要从当前失败转为通过。

## 1. Current Shell

事实源：`components/workspace/KnowledgeWorkspace.tsx`。

| Item | Current behavior | Evidence | Target |
|---|---|---|---|
| View ownership | 单个 Client Component 用 `useState<WorkspaceView>` 管理 12 个视图 | source | 类型化 URL route contract |
| Navigation | 12 个平级 `<button>` | source + browser snapshot | 四域导航，navigation link |
| Deep link | view、filter、object、revision 不进入 URL | source | 可复制、刷新和前后退恢复 |
| Global search | `Cmd/Ctrl+K` 只在 Knowledge 视图聚焦局部输入框 | source | 全局 command palette |
| View transition | view 改变后 `window.scrollTo(0,0)` | source | 焦点、滚动和对象上下文恢复 |
| Counts | 多数来自 projection；Solutions=`04`、Blueprints=`05` 硬编码 | source + browser snapshot | 全部由 server projection 产生 |
| Default surface | 营销式 overview hero + metrics | browser baseline | Work Queue / next action |
| Inspector | Knowledge 独立右栏，其他模块各自布局 | source | 统一 Context Inspector |
| Mobile navigation | 12 项横向滚动顶栏 | browser baseline | 四域 bottom navigation |
| Mobile editing | 组件通常用 JS media query + write policy 隐藏 | source | 服务端策略与移动只读契约一致 |

## 2. Current Views

| View ID | Current label | Current responsibility | Primary data | Known gap |
|---|---|---|---|---|
| `knowledge` | Knowledge | 候选知识列表、筛选与详情 | Knowledge Library Pack | 非 URL state；raw enum；长列表直接渲染 |
| `capture` | Capture | URL+正文或文件快照并生成候选 | Capture API / local summaries | 缺重复检测、许可字段、离开保护 |
| `enrichment` | Enrichment | Runtime/Pilot/Gold/Provider candidate | enrichment projections | 多种治理状态挤在单页；执行边界不够任务化 |
| `review` | Review | 候选 revision 编辑与 CAS | review API / candidate store | 409 仅错误文本；无三方 diff |
| `canvas` | Canvas | Knowledge 对象关系投影 | Knowledge library projection | 与文档 Factory Canvas 语义并列但工具模式不统一 |
| `workflow` | Workflow | 产品运行步骤和阻断 | ProductOperationsProjection | next action / owner / evidence 不完整 |
| `evidence` | Evidence Registry | 来源、双时态、完整性、freshness 与 readiness claim | Evidence Registry v1 read projection | D5 核心完成；外部 release/eval/runtime 数据仍需受控 ingestion |
| `provider` | Provider Ops | policy/plan/receipt/scope/budget/gates 只读控制面 | Provider/Pilot 脱敏 projection | D5 只读核心完成；UI-029 分离 canary/batch/gold 工作队列仍待后续 |
| `timeline` | Timeline | 统一 valid/observed/governance 事件流 | Evidence Registry timeline projection | D5 已补 axis URL 与 Evidence 反向导航；对象类型复合筛选后续增强 |
| `solutions` | Solutions | 从 Product Task 与证据建立方案脚手架 | library + solution scaffold API + product chain projection | D4 已补 Task deep link、主备方案假设/风险/取舍与来源类型；独立 Task store 不建立 |
| `blueprints` | Blueprints | Blueprint 编辑、保存、批准、预览、编译 | Blueprint API + immutable revisions | D4 已补 revision diff / impact / CAS approval / exact compile preview |
| `artifacts` | Artifacts | 编译产物的多视图阅读与反向追溯 | operations artifacts | D4 新 Artifact 已补 source map / replay / input chain；历史 Artifact 明确 unavailable |
| `evolution` | Evolution | 演进检查和缺口 | Registry readiness projection | D5 已由 Registry 派生；真实 metrics/eval/canonical/release evidence 仍未接入 |
| `documents` | Documents | 三份内置文档工作台 | document registry | 与共享方法论关系没有统一状态页 |

## 3. Target Domain Mapping

此映射只改变导航与任务组织，D1 不删除现有 view ID。

| Domain | Existing views | Missing surface |
|---|---|---|
| Knowledge | `capture`, `knowledge`, `review`, `enrichment`, `canvas` | Knowledge Work Queue / migration queue |
| Product | `solutions`, `blueprints`, `artifacts` | Product Tasks / object chain |
| Operations | `work`, `workflow`, `evidence`, `provider`, `timeline`, `evolution` | D5 核心表面已建立；真实外部 evidence ingestion 与角色 RBAC 后续完成 |
| Sources | `documents` | Registries / generated inventory / exports |

## 4. Object Inventory

| Object | Stable identity | Revision/hash | Current UI | Required next UI |
|---|---|---|---|---|
| Document | document registry ID | document hash / revisions | Documents + Factory Canvas | role view、shared methodology、drift status |
| Capture | `captureId` | content/source hash | Capture history | preview、duplicate、license、withdrawal |
| Knowledge Object | `objectId` | object/revision hash | Library + Inspector | trust summary、next action、lineage |
| Enrichment | `enrichmentId` | input/result hash | Enrichment list/detail | provider evidence、scope、review handoff |
| Human Gold | annotation identity | revision/evidence | Enrichment form | independent queue、coverage、agreement |
| Review Candidate | object ID + revision | CAS base/current | Review editor | source/draft diff、three-way conflict |
| Product Task | `task` URL + product chain projection | Blueprint v1.1 `product_task` | Create/Task register/lineage | D4 已成为一等 UI 对象；真相源仍内嵌 Blueprint，避免双写 |
| Solution | in-memory scaffold | derived Blueprint content | Solution Studio | alternatives、assumptions、experiments、source kind |
| Blueprint | `blueprintId` | revision/hash | Blueprint editor | D4 已完成 section nav、revision diff、artifact impact 与事务拆分 |
| Genome / Artifact | artifact key / genome hash | manifest | Artifact Workspace | D4 新 manifest 已完成 source map、replay、input chain；legacy 明示缺失 |
| Workflow Event | projection key | event time | Workflow / Timeline | owner、SLA、next action、evidence |
| Evolution Check | metric/check key | status time | Evolution Cockpit | freshness、registry source、candidate action |
| Provider Authorization | policy/plan/receipt hashes | consumed/expiry state | Enrichment fragments | dedicated Operator evidence surface |
| Release Evidence | release/commit/image identity | checksums | timeline/archived output | Evidence Registry projection |
| Evidence Record | stable `evidenceId` | source/integrity hash + freshness check time | Evidence Registry + Timeline + readiness | D5 read projection 完成；不新增写入或自动 ingestion |
| Digital Employee | deterministic role mapping | no runtime heartbeat | Canvas presentation | permission、queue、output、failure、handoff |

## 5. Action Inventory

### 5.1 Read actions

| Action | Current location | Current feedback | Gap |
|---|---|---|---|
| Search Knowledge | command bar | immediate filter | 仅当前 view；无 URL |
| Filter Knowledge | Library | five selects | raw enums；无 saved view / URL |
| Select object | Library row | Inspector updates | 刷新丢失；对象不能分享 |
| Open source | Inspector | new external tab | 基础行为可保留 |
| View Capture history | Capture | list | 缺对象详情和 lineage |
| View Review queue | Review | queue/list | 缺批次与迁移进度 |
| View Blueprint | Blueprint | list/detail | 无 revision compare |
| View Artifact compiled modes | Artifact | local tabs | tabs 不进入 URL |
| View Canvas relation | Canvas | local selection | 关系解释模式尚未统一 |

### 5.2 Write and governed actions

| Action | API / owner | Existing control | Current boundary | Gap |
|---|---|---|---|---|
| Create Capture | `POST /api/knowledge/captures` | Capture form | desktop Owner/dev | duplicate/license/draft protection |
| Run Enrichment | `POST /api/knowledge/enrichments` | capture buttons | exact runtime/policy gates | 多硬门缺专用任务流 |
| Export Gold Pack | gold batch POST | button | local file artifact | 状态与进度分散 |
| Import Gold Pack | gold batch POST | form/file | strict validation | 错误恢复需要更清楚 |
| Save Human Gold | gold POST | form | attestation required | independent reviewer UX |
| Save Review revision | PATCH review object | form | base revision/hash CAS | conflict resolution missing |
| Create Solution scaffold | solution POST | form | deterministic candidate | assumptions/source attribution weak |
| Save Blueprint | Blueprint POST/PATCH | buttons | Owner/dev | dirty guard and diff missing |
| Compile Genome | Blueprint compile POST | button | validation/create-only | input impact preview missing |
| Document mutations | document mutation APIs | Canvas Owner controls | Owner/CAS/journal | remains separate from knowledge workbench |
| Restore revision | revision API | Canvas history | Owner/CAS/journal | cross-object history not unified |
| Canonical promotion | not in ordinary UI | absent | separate authorization | must remain separate |
| Production activation | deployment runbook | absent | exact external authorization | must remain outside product UI |

## 6. Status Inventory

### 6.1 Status families already present

- `promotionState`: candidate / human review related state.
- `legacy.status`: active / acquired / deprecated and related lifecycle values.
- evidence and maturity values in Knowledge Object.
- enrichment runtime: disabled / ready / reason.
- pilot readiness: state, checks, blockers.
- write policy: dev / readonly / owner.
- Owner authentication: unauthenticated / authenticated.
- mutation UI: dirty / busy / status text.
- Blueprint: draft / approved related state.
- Evolution checks: ready / not measured / blocked-like states.

### 6.2 Gaps

| Gap | Current symptom | Target owner |
|---|---|---|
| Raw enum leakage | `human_review_required`, `structured`, `active` 直接成为主标签 | label registry |
| State conflation | 绿色和勾号同时暗示选择、通过和成熟 | StatusBadge contract |
| No freshness | ready/passed 附近缺证据采集时间 | Evidence Registry |
| No stale state | 数据过期时通常仍显示旧结论 | AsyncState / projection |
| No conflict surface | 409 进入一般 status text | three-way conflict UI |
| No global dirty state | 多编辑表面各自管理，离开无统一拦截 | workbench draft manager |
| No global unauthorized state | 组件分别解释 readonly/Owner/mobile | authorization projection |

## 7. Permission Inventory

| Role / context | Read | Write | Provider | Canonical | Production |
|---|---|---|---|---|---|
| Anonymous / readonly | allowed | denied 403 | denied | denied | denied |
| Local dev | allowed | allowed by dev contract | only when explicit policy allows | denied by default | denied |
| Authenticated Owner desktop | allowed | allowed within mutation contracts | still needs exact receipt/scope | separate approval | separate authorization |
| Mobile | allowed | controls not rendered | denied | denied | denied |
| Reviewer | current product has no separate RBAC | candidate decisions only in future contract | independent human-gold path | not implicit | denied |
| Operator | current product has no separate RBAC | operational artifacts in future contract | policy/plan/receipt scope | not implicit | separate authorization |

Fact: current application has write policy and Owner session boundaries, but Reviewer/Operator are product roles, not yet complete server-side RBAC identities.

## 8. Error and Recovery Inventory

| Failure | Current handling | Required D1–D5 behavior |
|---|---|---|
| API load failure | local status text | inline AsyncState + retry + stale data marker |
| Form validation | browser required / generic message | field error association + summary |
| CAS 409 | thrown as save failure | base/current/local diff and explicit resolution |
| Owner unauthenticated | readonly explanatory panel | shared authorization surface, no hidden late failure |
| Provider unavailable | readiness reason | exact missing gate and no transport action |
| Draft abandonment | local reset button | page leave guard + recoverable draft |
| Export defect | dedicated browser/SVG/PNG evidence exists | preserve independent structural and visual gates |
| Empty list | module-specific | common EmptyState with next allowed action |
| Stale projection | no common state | evidence time + refresh + degraded conclusion |

## 9. D0 Static Audit Findings

### P0

1. Twelve workspace destinations are buttons controlled by local state, so they cannot be deep-linked, opened in a new tab or restored by browser history.
2. Solutions count `04` and Blueprints count `05` are hard-coded business values.
3. Capture form lacks complete field names, autocomplete/inputmode metadata and unsaved-change protection.
4. Review CAS conflict has no three-way resolution surface.
5. Product readiness is not yet derived from a unified Evidence Registry.

### P1

1. Global search is actually a Knowledge-only input.
2. Mobile uses a horizontally scrolling twelve-item navigation instead of a task-oriented mobile structure.
3. Overview hero occupies the highest hierarchy despite the product being an operational workbench.
4. Persistent all-caps mono labels and raw enum values are too prominent.
5. `KnowledgeWorkspace.tsx` coordinates all views; `CanvasViewer.tsx` and global CSS remain oversized default extension points.
6. Library renders the full list and will not satisfy the planned 1000-object scale without windowing.

### Positive baseline to preserve

- Existing color semantics are centralized and Canvas components avoid naked hex values.
- Owner writes remain server-governed; mobile write controls are not rendered.
- Candidate and canonical boundaries are visible in the shell.
- Source links, dual-time fields and stable object IDs are present.
- Local browser baseline produced zero console errors and warnings.
- Existing Canvas has deterministic routing, relation Inspector, reduced-motion and export regression contracts that must not regress.

## 10. Browser Baseline

Captured with local Next development server and Playwright CLI on 2026-07-22. These files are evidence artifacts under ignored `output/`; they are not intended for source commit.

| Viewport | Artifact | SHA-256 | Observation |
|---|---|---|---|
| 1440×900 | `output/playwright/d0-ui-baseline-20260722/workspace-1440x900.png` | `f82d47890510f715bb25fb3336fdac6628ce1efab7a6640b8b096423466d914d` | 12-item rail, hero, library and persistent Inspector visible |
| 1024×768 | `output/playwright/d0-ui-baseline-20260722/workspace-1024x768.png` | `994dd02dd5168c7cfedbb01bc9d39ecf4b99193f7c13187794c161e9975a885e` | rail remains wide; hero dominates first viewport; lower task area compressed |
| 390×844 | `output/playwright/d0-ui-baseline-20260722/workspace-390x844.png` | `f8b2561ca12d59afbe4890e23f721906f36f21b80b1800ca6153e388db0337a3` | horizontal 12-item nav; search then hero; task rows begin below fold |

Browser console: `0 errors / 0 warnings` for the captured session.

## 11. Current Task Baseline

The following are structural baselines, not measured human completion times. Formal usability timing remains unverified until D9.

| Task | Current path | Current discontinuity | D1–D5 target |
|---|---|---|---|
| Find a Knowledge Object | open `/` → search/filter → select row | state not shareable; raw labels | deep link to object/revision/filter |
| Capture a source | click Capture → unlock Owner → fill form → submit | no duplicate check/draft guard | preview, duplicate choice, next action |
| Review a candidate | click Review → select → edit → save | no source/draft field diff; 409 is generic | evidence-centered review and conflict UI |
| Build a solution | click Solutions → create Task → alternatives/assumptions/risks/experiment/evidence → scaffold | D4 core closed；尚未接 Provider candidate 或正式 Solution review queue | Task → alternatives → experiments → review |
| Save and compile Blueprint | click Blueprints → edit/save → approve → exact preview → create-only compile | D4 core closed；execution spec 仍需由完整 Blueprint 提供，不由 UI 猜测 | save/approve/preview/compile separated |
| Diagnose readiness | click Workflow/Evolution/Timeline separately | evidence and freshness fragmented | Work Queue + Evidence Registry |
| Understand relationships | click Canvas → select object | multiple canvas concepts, presentation ownership unclear | default Map + optional Factory + relation Inspector |

## 12. D0 Acceptance Gates

Completed:

- [x] Current worktree and evidence boundaries checked.
- [x] Root `DESIGN.md` created with visual, state, layout, motion, responsive and Agent rules.
- [x] Current views, objects, actions, statuses, permissions and errors inventoried.
- [x] 1440×900, 1024×768 and 390×844 browser baselines captured and visually inspected.
- [x] Current deep-link, hard-coded count, form semantics and mobile navigation gaps recorded.

Completed in D1:

- [x] Route contract tests changed from staged TODO to active RED/GREEN tests.
- [x] Server projection replaced hard-coded counts; Solutions renders no badge without a persisted object projection.
- [x] Four-domain Workbench shell, default Work Queue, global command palette and mobile domain navigation implemented.
- [x] Knowledge object, revision and filters restore through shareable URLs and browser history.
- [ ] Formal five-task human usability timing is performed in D9.

Completed in D2:

- [x] Semantic interaction, status, overlay and layer tokens added without a new runtime UI dependency.
- [x] Button, Field, Dialog, Drawer, Menu, Tabs, Status and Async primitives own shared interaction behavior.
- [x] Workbench command palette, queue, library filters and compiled-view tabs migrated as real samples.
- [x] Keyboard, focus restoration, reduced-motion, responsive overflow and Chromium visual regression verified in real browsers.

Completed in D3 core vertical:

- [x] Capture form semantics, source preview, versioned local draft, refresh/leave protection and URL/checksum duplicate warning implemented.
- [x] Capture submit navigates to an exact Library object with `capture` lineage and explicit Review/Canvas next actions.
- [x] Review and Canvas restore the selected object from the shared URL; returning to Library switches the actual destination.
- [x] Review preserves local drafts and turns CAS `409` into base/current/local field choices before a new save attempt.
- [x] Migration totals, initialized revisions and unresolved reasons come from the real Review queue projection.
- [x] Candidate saves remain separate from canonical promotion; no canonical write path was added.

Completed in D4 Product vertical:

- [x] Product Task → Solution → Blueprint → Artifact 具备稳定对象链、field provenance、revision diff、exact compile preview 与 replay lineage。
- [x] 保存、批准、预览和 create-only compile 保持独立 CAS 事务。

Completed in D5 Evidence core vertical:

- [x] Evidence Registry v1 为当前产品对象生成稳定 ID、来源、双时态、完整性、freshness 和缺失证据 next action。
- [x] Workflow、Work Queue 与 Evolution readiness 只消费 Registry claim；stale 自动降级，`not_measured` 不显示为通过。
- [x] Evidence 与 Provider Ops 加入 Operations 导航和 URL；Provider 页面固定只读、`canExecute=false`。
- [x] Timeline 合并 valid/observed/governance 事件并反向导航 Evidence。
- [ ] 全套 Playwright 的 1000/2000 Canvas benchmark 在套件负载下仍低于 55fps；隔离复跑通过，完整性能门保持开放。

## 13. Evidence Boundary

This baseline plus D1-D5 evidence supports `D5 Evidence Registry core complete locally with a global Canvas performance gate open`. It does not support:

- D6-D10 vertical slices or the full redesigned UI accepted;
- full source field diff, per-item legacy promotion decisions or promotion history;
- candidate image ready;
- production UI changed;
- canonical migration、Provider quality、真实 runtime/release evidence ingestion 或全套性能门通过。

Current boundary: `production unchanged`.
