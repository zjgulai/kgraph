---
title: DocCanvas Governed Workbench Design Contract
status: ui098-preflight-batch-1-candidate-blocked
version: 2.3-ui098-preflight
updated: 2026-07-23
applies_to: DocCanvas product shell, workspaces, canvas, exports, responsive UI
production: unchanged
---

# DocCanvas Design Contract

## 0. Design Read

DocCanvas 是面向 Knowledge Owner、AI 产品负责人、Reviewer 和工程运营者的高密度 B2B 工作台。产品语言是“证据优先、精确、克制”，不是营销落地页、自由白板或游戏化工厂。

设计参数：

| Dial | Value | Interpretation |
|---|---:|---|
| `DESIGN_VARIANCE` | 4/10 | 保留独特品牌，但不破坏任务一致性 |
| `MOTION_INTENSITY` | 3/10 | 动画只表达反馈、状态与方向 |
| `VISUAL_DENSITY` | 6/10 | 专业工作台默认紧凑，可切换舒适密度 |

产品承诺：

> 让用户从来源、知识、方案、Blueprint、产物、发布证据到反馈，始终知道当前对象是什么、为什么可信、下一步能做什么、哪里必须停下等待人工决策。

## 1. Visual Theme and Atmosphere

### 1.1 Core language

- 主界面是证据优先的编辑工作台，不是“建筑主题 Dashboard”。
- 暖纸、森林绿、铜色治理和工业画册是品牌基因，不是每个页面必须出现的装饰。
- Canvas 提供 `Map` 和 `Factory` 两种 presentation；`Map` 是默认工作模式，`Factory` 用于空间理解和演示。
- 高级感来自准确的层级、克制的材料、真实的数据状态和稳定的交互，不来自玻璃拟态、霓虹渐变或循环动画。
- 呼吸感来自减少重复容器、清晰的任务主线和合理留白，不等于降低信息密度。

### 1.2 Product shell

- 一级信息架构固定为 `Knowledge / Product / Operations / Sources` 四域。
- Desktop 采用 Navigation Rail + Task Surface + Context Inspector。
- 默认首页是 Work Queue，不使用营销式 hero 作为日常入口。
- 工作表面一次只突出一个主任务；说明、关系、历史和证据进入 Inspector。

### 1.3 Themes

- v2 首轮只提供完整 light theme。
- 不在同一页面随机切换深浅主题。
- 暗色模式只有在所有状态、图表、Canvas、导出和可访问性达到功能等价后才能加入。

## 2. Color Roles

颜色单一事实源仍为：

`opendesign/design-systems/doccanvas-product-factory/tokens/colors_and_type.css`

### 2.1 Semantic palette

| Role | Token | Usage |
|---|---|---|
| Canvas background | `--factory-canvas` | 页面底层、空间画布 |
| Task surface | `--factory-surface` | 工作表面、分组区域 |
| Raised surface | `--factory-surface-raised` | Inspector、popover、dialog |
| Primary ink | `--factory-ink` | 标题、正文、关键数据 |
| Muted ink | `--factory-muted` | 说明、次级元数据 |
| Flow / primary action | `--factory-green` | 主动作、选择、普通流程 |
| Governance | `--factory-copper` | 审批、授权、治理关系 |
| Dependency / system | `--factory-slate` | 技术依赖、系统元数据 |
| Danger | `--factory-danger` | 真实失败、不可逆危险 |

### 2.2 Rules

- 画布组件和 Canvas CSS 不允许裸十六进制颜色。
- 森林绿不能同时承担 success、primary、online、canonical 四种含义。
- 铜色只表示治理、审批和需要人工判断的边界，不作通用装饰色。
- `not_measured`、`unknown`、`stale` 不使用成功绿色。
- 状态必须同时使用文字、图标或形状、颜色；颜色不是唯一信号。
- 阴影使用带背景色倾向的 token；常规列表不靠阴影分层。

## 3. Typography Hierarchy

### 3.1 Font ownership

- 产品导航、工作台标题、表单、列表和数据使用 `--factory-font-body`。
- 文档正文、引用和阅读模式可使用 `--factory-font-display`。
- hash、ID、时间、revision、命令和 machine state 使用 `--factory-font-mono`。
- 不新增运行时字体请求；使用稳定本地字体栈。

### 3.2 Scale

| Level | Recommended size | Usage |
|---|---:|---|
| Page title | 24–28px | 当前任务或对象 |
| Section title | 18–20px | 主要工作区分组 |
| Card/row title | 14–16px | 对象名称 |
| Body | 14–15px | 说明、正文 |
| Persistent label | ≥12px | 字段、导航、状态 |
| Technical metadata | 11–12px | 非关键 hash/ID；不可承担主信息 |

### 3.3 Rules

- 操作工作台不使用宋体大标题制造“编辑感”。
- 删除无意义全大写 eyebrow、装饰编号和混合语言标题。
- 中文一级标题按语义换行，最多两行；不依靠 `<br>` 固定视觉断句。
- Raw enum 不能直接作为普通用户的主要标签；使用统一中文 label registry。
- 任何假精确数字、过期工具指标和未经验证的在线状态都不得作为视觉装饰。

## 4. Components and States

Implementation status (2026-07-23): D2–D5 provide primitives, the Knowledge and Product object chains, Evidence Registry, bitemporal Timeline and read-only Provider Ops. D6–D8 provide Map/Factory, responsive mobile readonly behavior, route splitting, CSS ownership, telemetry and a stable 1000/2000 Canvas performance pass without lowering the 55fps threshold. D9 completed local automated acceptance; moderated users and assistive-technology sessions remain an explicit evidence limit. D10/UI-097 documents the product logic and role manual. UI-014、UI-022–025、UI-072/073 are now complete or reaccepted in the local worktree: Library state is shareable and virtualized, Inspector is evidence-first, and Review is queue/source/diff with field locators. The fresh full Chromium/WebKit/mobile Playwright sequence passed `50/22/0`; source checkpoint preparation may proceed, while staging, commit, push, candidate and production remain unchanged.

### 4.1 Primitive set

首轮内部 primitives：

- `Button`
- `IconButton`
- `Field`
- `SelectField`
- `SearchField`
- `Dialog`
- `Drawer`
- `Menu`
- `Tabs`
- `StatusBadge`
- `AsyncState`
- `DataList` / `DataTable`
- `ContextInspector`

不新增完整运行时 UI 框架。若 Dialog、Menu 或 Combobox 的可访问性成本经验证不可接受，再独立评估 Radix primitives。

### 4.2 Shape contract

- control radius：8px。
- panel radius：12px。
- overlay radius：16px。
- Canvas room radius：6–8px。
- pill 只用于短状态或筛选 token，不用于所有按钮。

### 4.3 Required state cycle

每个数据表面必须实现适用的完整状态：

```text
loading → ready → empty / stale / error / unauthorized
editing → dirty → saving → saved / conflict / failed
```

- Skeleton 必须匹配最终布局形状。
- Empty state 说明如何产生第一条数据或为何当前为空。
- Error 就地说明原因和重试路径；toast 只用于短暂通知。
- 保存状态靠近保存动作，并通过 `aria-live` 告知结果。
- CAS `409` 必须进入冲突处理，不以一般错误文本吞掉。

### 4.4 Navigation and actions

- 导航使用 link，动作使用 button。
- 图标按钮必须有 `aria-label` 和可发现 tooltip。
- 未授权动作不渲染；不能用禁用按钮暗示凭据或权限存在。
- 危险或不可逆动作显示影响范围、确认对象和恢复路径。
- 主动作每个任务表面最多一个；其他动作按层级进入 secondary 或 More。

### 4.5 Object status

| Status family | Required display |
|---|---|
| Lifecycle | 中文状态、当前 revision、下一允许状态 |
| Quality | measured/not measured、evidence、freshness |
| Runtime | ready/blocked/disabled/expired 与原因 |
| Write | clean/dirty/saving/conflict/saved |
| Authorization | unauthorized/staged/consumed/expired 与 exact scope |

## 5. Layout and Spacing

### 5.1 Grid

- 4px micro grid，8px 基础节奏。
- 控件水平间距通常为 8–12px，分组为 16–24px，主区域为 24–32px。
- 默认数据行 40px，舒适密度 48px。
- 同类对象优先使用 row、group、divider；只有真实层级需要时才使用 card。

### 5.2 Desktop shell

```text
Navigation Rail 68/232px
Task Surface minmax(0, 1fr)
Context Inspector 320–380px, collapsible
```

- 顶栏提供全局搜索、创建、环境、Owner 状态与命令面板。
- Inspector 是全局模式，不允许每个模块发明不同宽度和关闭行为。
- 长表单使用 section navigation 或分组，不把所有字段塞入同一张巨型卡片。

### 5.3 Information priority

对象详情首屏回答：

1. 这是什么？
2. 为什么可信或为什么还不可信？
3. 当前阻断是什么？
4. 下一步允许做什么？

hash、raw JSON、完整日志和机器枚举进入次级技术区。

## 6. Depth and Elevation

- 常规层级由背景色、1px border 和留白表达。
- 阴影只用于 overlay、dragging item 和最高层 Inspector。
- 2.5D 深度限制在 8–12px，只服务 Canvas 空间关系。
- 不在壳层、表单、表格和所有卡片上重复立体边。
- `Factory` presentation 的屋顶不超过 72px，不占用主工作流空间。
- 连接线位于单一 SVG 关系层，结构壳、关系、节点内容使用明确 stacking contract。

## 7. Motion and Interaction

### 7.1 Timing

| Interaction | Duration |
|---|---:|
| Press / hover / focus feedback | 140ms |
| Drawer / Inspector transition | 180–230ms |
| Relation tracer | 220–280ms, once |

### 7.2 Rules

- 动画只表达反馈、状态转换、空间层级或关系方向。
- 只动画 `transform`、`opacity` 和必要 SVG stroke 属性。
- 禁止 `transition: all`、循环漂浮、无限流光和装饰性呼吸动画。
- 直接拖动无 transform transition。
- hover、focus、选中、搜索命中、进入模块和拖动结束才触发一次 tracer。
- `prefers-reduced-motion` 下取消位移与路径运动，只保留即时颜色和层级反馈。
- 触屏不模拟 hover 动效。

### 7.3 Keyboard

- `Cmd/Ctrl+K` 在所有工作区打开全局命令面板。
- 焦点可到达导航、列表、Inspector、Canvas 节点和关系。
- Dialog/Drawer/Menu 支持 Escape、焦点陷阱和焦点恢复。
- 快捷键必须在界面中可发现，不能只存在于代码。

## 8. Do / Don't

### Do

- 用真实 projection 显示数量、readiness 和 next action。
- 让 URL 保存 area、view、object、revision、filter、sort、tab 和 Canvas focus。
- 明确区分 candidate、human review、canonical、runtime 和 production。
- 用 Work Queue 把未完成闭环转成下一动作。
- 让每个状态能打开来源、时间和证据。
- 在空状态和首次引导中使用克制插图。
- 让数字员工显示角色、权限、任务、输出、失败与人工接管。

### Don't

- 不硬编码业务数量或伪造在线、成功、canonical 状态。
- 不把房屋隐喻扩展到 Capture、Review、Blueprint diff 等 CRUD 表面。
- 不把所有信息装进卡片、badge 和顶部彩色边。
- 不显示大段 raw enum、hash 或英文工程术语作为主要内容。
- 不用随机头像、emoji、手绘图标或多个图标家族。
- 不自动执行 Provider、canonical promotion、生产发布或不可逆动作。
- 不用本地截图或 fixture 冒充生产验收。

## 9. Responsive Behavior

| Width | Navigation | Inspector | Editing |
|---|---|---|---|
| ≥1280px | expanded/compact rail | persistent, collapsible | desktop Owner only |
| 768–1279px | compact rail | drawer | desktop/tablet policy dependent |
| <768px | four-domain bottom navigation | detail sheet | always readonly |

Rules:

- 移动端不缩小桌面 Canvas，使用纵向关系轨和对象列表。
- 移动端不渲染写控件，不持久化隐藏的桌面 viewport。
- 触控目标至少 44px，处理 safe area、`touch-action` 和 overscroll。
- 表格在窄屏隐藏次级列或转为语义列表，不横向压缩主字段。
- 390×844 必须无页面级横向溢出；局部明确的横向列表需有可发现滚动提示。

## 10. Accessibility and Performance

- 正文和交互状态达到 WCAG AA 对比度。
- 表单字段有 label、name、autocomplete/inputmode、description 和 error association。
- 异步状态使用适当的 `aria-live`；错误不能只靠颜色。
- 大于 50 条的列表窗口化或虚拟化。
- 1000 nodes / 2000 relations Canvas 遵守 350 DOM / 700 SVG 可见预算。
- 首次任务表面交互目标 ≤2.5s；常规 pan/zoom/drag 目标 ≥55fps；增量重路由 p95 ≤50ms。
- 插图、头像和预览声明尺寸，避免 CLS；低频重工作区动态加载。

## 11. Agent Implementation Prompt

在修改 DocCanvas UI 前，Agent 必须：

1. 读取 `AGENTS.md`、本文件、`docs/engineering/governed-workbench-ui-inventory.md` 和相关模块代码。
2. 陈述本次改动解决的用户任务、适用角色和证据边界。
3. 复用现有 token、Lucide 和交互模式；不得新增第二套设计系统。
4. 先补失败复现或验收用例，再修改实现。
5. 实现 loading、empty、error、unauthorized、dirty、conflict 和 reduced-motion 中适用的状态。
6. 在 1440×900、1024×768、390×844 检查真实浏览器行为。
7. 区分 local、candidate、readonly production 和 live production 证据。
8. 无精确生产授权时保持 `production unchanged`。

## 12. Sources of Truth

- 产品与执行约束：`AGENTS.md`
- UI 与交互契约：`DESIGN.md`
- 现有 token：`opendesign/design-systems/doccanvas-product-factory/tokens/colors_and_type.css`
- 当前 UI inventory：`docs/engineering/governed-workbench-ui-inventory.md`
- 重构计划：`docs/superpowers/plans/2026-07-22-doccanvas-governed-workspace-ui-interaction-redesign-plan.md`
- Canvas 工程契约：`docs/engineering/factory-scene-v3.md`
- 产品复盘与角色手册：`docs/product/doccanvas-product-review-and-role-manual.html`

若实现与本文件冲突，必须先明确修订设计契约，不能静默形成第二套规则。
