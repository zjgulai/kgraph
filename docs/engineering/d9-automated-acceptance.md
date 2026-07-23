---
title: DocCanvas D9 自动化验收与可用性证据
status: completed_local_automated_with_human_validation_limit
updated: 2026-07-23
production_status: unchanged
---

# D9 自动化验收与可用性证据

## 结论

D9 的本地自动化验收已通过。最终完整证据为：unit `356/356`、TypeScript、production build、Playwright `45 passed / 21 intentionally skipped / 0 failed`。Chromium、WebKit 与 390px Pixel 7 项目均通过适用的路由、键盘、状态、可访问性和视觉门；真实写事务只在隔离数据根的 Chromium Desktop 执行一次，避免跨项目并发改写同一 fixture。

本结论只支持 `local automated acceptance verified`。没有 commit、push、候选镜像、Provider call、canonical promotion 或生产访问；`production unchanged`。

## 覆盖矩阵

| TODO | 自动化证明 | 结论 |
|---|---|---|
| UI-090 | Chromium Desktop、WebKit Desktop、Chromium Mobile；全键盘 Command Palette → Knowledge Object | 通过 |
| UI-091 | `workbench.spec.ts` 覆盖深链、浏览器历史与 Command Palette；D9 覆盖权限过滤、焦点恢复和刷新后确定性路由 | 通过 |
| UI-092 | `knowledge-handoff.spec.ts` 覆盖 Capture 草稿/创建/交接；D9 覆盖真实 Review CAS 409 三方合并和 approved Blueprint preview/compile；`factory-canvas.spec.ts` 覆盖 Owner CRUD、stale CAS 与 revision restore | 通过 |
| UI-093 | loading、empty、error、stale、conflict、unauthorized、expired 七态及六种 mutation 状态，三项目视觉快照 | 通过 |
| UI-094 | 三内置文档 model/layout/scene/SVG/hit-path 计数一致；穿模、箭头、关系 Inspector、PNG、SVG 四类关系 presentation 与 1000/2000 规模夹具 | 通过 |
| UI-095 | 可访问名称、重复 ID、图片 alt、桌面焦点恢复、键盘导航、reflow、五组正文语义色 WCAG AA、reduced-motion、移动端 44px 触控目标 | 自动化门通过 |
| UI-096 | 五项核心任务记录时间、动作、console error 和求助点 | 自动化基线已建立 |

## 本轮修复

- 增加集中式人类化 label registry，Work Queue、Library、Review、Blueprint、Provider 与治理门不再把普通用户主要界面暴露为 raw enum。
- 增加 `draft / dirty / saving / saved / conflict / failed` 六态 mutation live region，并接入 Review 与 Blueprint 编辑器。
- 修复 Command Palette 关闭后的焦点恢复时序；恢复目标在 Dialog 打开时捕获，并在关闭事件完成后再次确认焦点。
- 修复验收脚本把包含“可生成编译预览”文案的候选卡片误识别为精确操作按钮的问题；真实 preview GET、create-only compile 均已通过。
- 将 Design System fixture 扩充为完整受治理状态画廊，并批准更新受影响的 Chromium 视觉基线。

## 五项任务自动化基线

测量时间：`2026-07-23 04:06:48 CST`。运行环境为本地 production standalone、Chromium Desktop、隔离 fixture 数据根。

| 任务 | 时间 | 动作 | 错误 | 求助点 |
|---|---:|---:|---:|---:|
| 诊断 readiness | 324ms | 1 | 0 | 0 |
| 找到 Context7 知识对象 | 182ms | 3 | 0 | 0 |
| 打开候选复核 | 857ms | 1 | 0 | 0 |
| 检查 Blueprint revision diff | 124ms | 2 | 0 | 0 |
| 理解并打开画布关系 | 463ms | 2 | 0 | 0 |

这些数值是机器执行的回归基线，用于发现路径变长、等待失控和控制台错误，不等同于真实用户完成时间。D0 没有同口径的历史任务计时，因此不能伪造“旧版 vs 新版”的定量提升百分比。

## 视觉证据

- `tests/e2e/__screenshots__/d9-acceptance.spec.ts/chromium-desktop/governed-state-gallery.png` — SHA-256 `d538d4d3c2a6473d46a473d285d86d0680447a042fce057fdf77075f1a1e6c6a`
- `tests/e2e/__screenshots__/d9-acceptance.spec.ts/webkit-desktop/governed-state-gallery.png` — SHA-256 `7c67f20534d57a2a1b7a9e2b5c888da400ed0b17b8e17dd319f1820e0a74c0ff`
- `tests/e2e/__screenshots__/d9-acceptance.spec.ts/chromium-mobile/governed-state-gallery.png` — SHA-256 `aee84d6d17879fcf5af64e3afb6529ac0a7ecdc8b093c44fd61a8dd12d476cf9`
- `output/playwright/d9-audit/05-work-queue-desktop-postfix.png`、`06-work-queue-mobile-postfix.png`、`07-blueprint-desktop-postfix.png` — 当前运行的内置浏览器人工视觉复核。

## 证据边界与下一门

自动化没有替代真实读屏软件、真实触屏设备或主持式用户测试。进入 D10 时必须在发布说明中保留这一限制；若将“真实用户新旧版量化对比”作为发布硬门，则需补做主持式测试或获得明确 waiver。下一任务是 UI-097 文档与使用手册封板；UI-098 候选和 UI-099 生产仍分别需要新范围与精确授权。
