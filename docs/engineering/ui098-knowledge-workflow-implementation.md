---
title: UI-098 Knowledge Workflow Implementation Evidence
status: local-implementation-and-full-browser-complete-source-checkpoint-preparation
updated: 2026-07-23
evidence_grade: L2-local
production: unchanged
---

# UI-022–025 Knowledge 工作流实现证据

## 1. 裁决

UI-022、UI-023、UI-024、UI-025 已在当前本地工作树完成实现，聚焦单元测试、完整单元测试、TypeScript、production build、真实 Chromium CLI 桌面/移动验收和完整 Chromium/WebKit/mobile Playwright 顺序均通过。

UI-098 source checkpoint 当前进入 `PREPARATION ONLY`，仍未形成可提交检查点。原因不是产品或浏览器门失败，而是：

- 当前工作树包含 D6–D10、UI-098 preflight 与本批改动，尚未冻结 allowlist、scope hash 或 clean pushed commit；
- candidate image、L2 image smoke、L3 只读盘点和生产证据均未开始。

本记录不授权 stage、commit、push、Provider call、canonical write、candidate build、L3 访问或 activation。

## 2. 完成内容

| TODO | 本地实现 | 验证 |
|---|---|---|
| UI-022 | Library 的筛选、对象、排序、密度和 list/grid 布局全部进入类型化 URL；非法值回退；刷新和深链保持同一对象 | route round-trip、稳定排序、真实刷新 |
| UI-023 | 超过 50 个对象启用有 overscan 的行/网格虚拟化；1000 对象只渲染有界 DOM window；ArrowUp/Down、Home/End 使用 roving focus 并同步 URL 与 Inspector | 1000-item unit fixture；真实 Chromium 键盘路径 |
| UI-024 | Inspector 第一屏固定为可信度、边界与阻断、下一允许动作；来源/时态与复核原因保留；稳定 ID、推荐语境、rank/version/stars/pricing 下沉到可折叠技术元数据 | 结构 contract；桌面/390px browser snapshot |
| UI-025 | Review 桌面顺序为 queue/source/diff；来源快照只读；候选区显示字段差异；每个可编辑字段绑定 evidence locator；revision ledger 保留在 diff 主区 | 结构 contract；1280px 三栏和 390px 单栏顺序；横向溢出为零 |

## 3. 对抗性浏览器发现

真实浏览器验收发现并修复两项单元测试未直接暴露的问题：

1. 对象 ID 含 `.` 时，错误地把 `CSS.escape()` 结果传给 `getElementById()`，导致选中对象变化但键盘焦点留在旧行。现在使用原始 DOM ID，焦点与选中、URL、Inspector 同步。
2. 1280px viewport 下，232px 工作台导航压缩主区后，原三栏最小宽度造成 `48px` 横向溢出。三栏改为 `230px / 230px / minmax(0,1fr)` 后，桌面 `scrollWidth=1280`；390px 移动端为单栏 `366px`，`scrollWidth=390`。

## 4. 当前验证

| 门 | 结果 | 证据边界 |
|---|---|---|
| UI-022–025 focused tests | PASS `15/15` | URL、排序、1000-item virtual window、组件 contract |
| Complete unit suite | PASS `366/366` | 当前工作树；不等于 browser suite |
| TypeScript | PASS | `tsc --noEmit` |
| Next production build | PASS | 20 pages；standalone assets prepared |
| Chromium CLI desktop | PASS | 1280px；URL refresh、keyboard focus、Inspector、Review 三栏、console 0 errors |
| Chromium CLI mobile | PASS | 390×844；Review 顺序与 Library grid 回退为单列；无横向溢出；console 0 errors |
| UI-022–025 Playwright focused | PASS `3/3` | Chromium desktop、WebKit desktop、Chromium mobile |
| Full Chromium/WebKit/mobile sequence | PASS `50/22/0` | 50 passed、22 intentionally skipped、0 failed；当前工作树新鲜顺序结果 |
| Candidate/L3/production | NOT STARTED | `production unchanged` |

## 5. 下一硬门

1. 重新执行 secret/path inventory，冻结精确 source allowlist、content manifest 和 scope hash。
2. 排除 `output/**`、`.kiro/**`、`data/**`、secrets、Provider artifacts、浏览器报告、历史镜像和备份。
3. 获得精确 commit/push 授权后才可形成 UI-098 source checkpoint；candidate 和生产仍需后续独立授权。
