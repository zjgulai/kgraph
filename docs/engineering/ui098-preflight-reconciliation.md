---
title: UI-098 Candidate Preflight Reconciliation
status: knowledge-workflow-and-full-browser-complete-source-checkpoint-preparation
updated: 2026-07-23
evidence_grade: L2-local
production: unchanged
---

# UI-098 候选前缺口对账

## 1. 裁决

UI-014、UI-022–025、UI-072、UI-073 已在当前本地工作树完成或重新确认，完整 Chromium/WebKit/mobile 顺序套件也已取得新鲜全绿。UI-098 当前进入 `PREPARATION ONLY`：当前工作树尚未冻结精确 source allowlist、content manifest 与 scope hash，也不是 clean pushed commit。UI-022–025 的实现与边界见 [Knowledge 工作流实现证据](./ui098-knowledge-workflow-implementation.md)。

本记录只证明本地源码、单元测试、production build 和独立浏览器行为。它不证明候选镜像、生产现状、备份新鲜度或生产验收，也不授权 stage、commit、push、Provider call、canonical write、candidate build、L3 访问或 activation。

## 2. 唯一缺口矩阵

| TODO | 当前证据 | 候选裁决 | 下一动作 |
|---|---|---|---|
| UI-014 | Capture、Review、Enrichment Human Gold、Solution、Blueprint 共用 dirty registry；跨工作区离开确认；版本化有界 draft；刷新恢复浏览器测试 | `completed_local` | 进入后续完整回归；Document Owner 继续沿用其既有局部 draft/离开契约，不重复建立第二套 workbench registry |
| UI-022 | 类型化 URL 覆盖 filter/object/sort/density/layout；非法值回退；真实刷新保持状态 | `completed_local_browser_verified` | 纳入精确 source checkpoint |
| UI-023 | `>50` 启用 virtual window；1000-item fixture 有界渲染；roving focus 同步 URL/Inspector | `completed_local_browser_verified` | 纳入精确 source checkpoint |
| UI-024 | Inspector 第一屏为可信度、边界/阻断、下一动作；技术元数据下沉 | `completed_local` | 保留真实读屏人工证据限制 |
| UI-025 | Review 已形成 queue/source/diff；字段绑定 evidence locator；1280/390 无横向溢出 | `completed_local_browser_verified` | 纳入精确 source checkpoint |
| UI-027 | 真实 migration queue projection 已存在；canonical promotion 决策/历史未获独立授权 | `deferred_authorization` | 从首个候选范围排除；不宣称 canonical promotion UI，不执行 canonical write |
| UI-029 | Provider 原子治理门存在；canary review、19-call batch、20-item Gold 仍未形成分离队列 | `activation_conditional_blocker` | Provider-enabled activation 前必须实现；若候选保持 Provider fail-closed，L3 需证明禁用并由精确发布范围显式接受延期 |
| UI-060–063 | D2/D7/D9 已有 token、响应式、状态和可访问性门；token v2 收敛、最小字号、容器减量、密度偏好仍有增量空间 | `post_release_design_improvement` | 不阻断首个 fail-closed 候选；每项保持可独立验收，不以主观“高级感”替代任务证据 |
| UI-066 | Canvas 已通过当前行为与 1000/2000 性能门，但 camera/routing/selection/relations/export/presentation 仍未完全模块化 | `post_release_maintainability` | 不与 UI-022–025 混改；用依赖边界和等价行为测试逐步拆分 |
| UI-072 | Operations projection 与 Cockpit 明示角色、状态、队列、能力、权限、最近输出、阻断、human gate，且 `canExecute=false` | `completed_local` | 未来 UI-113 才加入真实任务编排；当前不伪装在线员工 |
| UI-073 | 8 个稳定 WebP 角色、确定性路径、失败 fallback、4:5 上传预览、服务端校验与规范化测试均存在 | `completed_local` | 继续保持无随机头像、无伪在线状态 |
| D9 human-validation limit | 自动化五任务有机器基线，但没有主持式真实用户或辅助技术人工证据 | `documented_waiver_required` | 不阻断工程候选；任何“相对旧版提升百分比”声明必须等待真实研究 |

## 3. UI-014 事务边界

- dirty state 由当前编辑器主动上报，Shell 在跨工作区导航与浏览器 history 导航时统一拦截。
- Capture、Review、Solution、Blueprint 继续使用各自版本化 draft；Human Gold 新增绑定 `captureId + sourceHash + baseRevision + annotationHash` 的有界 draft。
- Human Gold 草稿不保存 attestation；恢复旧草稿不能隐式恢复一次人工声明。
- 不同来源或修订的陈旧 Gold draft 只显示告警，不自动套用。
- 用户明确放弃后可以跳过一次 guard；成功保存后删除对应 draft。

## 4. 当前门状态

| 门 | 状态 | 证据边界 |
|---|---|---|
| UI-014 focused unit | PASS | shared guard、Gold draft、静态接线 |
| Product chain browser | PASS | Chromium/WebKit desktop；mobile 编辑用例按只读策略跳过 |
| Capture reload browser | PASS after fix | 完整套件在 WebKit 暴露 debounce/reload 竞态；`beforeunload` 同步持久化后隔离复跑通过 |
| Next production build | PASS | 本地 20 pages；不等于 image smoke |
| Complete unit / typecheck / build | PASS | `366/366`、TypeScript、20-page production build |
| UI-022–025 Chromium CLI | PASS | 1280/390、URL/keyboard/Inspector/Review、console 0 errors；不替代 WebKit/full suite |
| Full Playwright sequence | PASS `50/22/0` | 50 passed、22 intentionally skipped、0 failed；Chromium、WebKit、mobile 新鲜顺序全绿 |
| UI-022–025 | COMPLETED LOCAL + BROWSER VERIFIED | 实现门和完整 browser 门关闭 |
| Source checkpoint | PREPARATION ONLY / NOT AUTHORIZED | 正在冻结 allowlist/content manifest/scope hash；未 stage/commit/push |
| Candidate/L3/production | NOT STARTED | 需要后续独立证据与精确授权 |

## 5. 下一硬门

执行 secret/path inventory，冻结精确 source allowlist、content manifest 与 scope hash；复验范围无禁入路径和敏感内容后，停在精确 commit/push 授权硬门。candidate、L3 与生产仍需后续独立证据和授权。
