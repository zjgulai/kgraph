---
title: DocCanvas 证据优先工作台 UI 与交互重构计划
status: active-d8-complete-local-d9-pending
updated: 2026-07-23
scope: DocCanvas product shell, knowledge workflow, product workflow, operations, canvas, responsive UX
production: unchanged
---

# DocCanvas 证据优先工作台 UI 与交互重构计划

## 0. 结论

本轮不应做一次局部换肤，也不应继续把“产品工厂房屋”扩展成所有模块的主导航隐喻。当前产品已经从文档画布扩展为 Knowledge Object、Capture、Enrichment、Review、Solution、Blueprint、Artifact、Workflow、Evolution 和 Provider 治理的复合工作台；UI 必须从“展示架构”升级为“完成任务并留下证据”的操作系统。

目标产品体验定义为：

> 一个面向 Knowledge Owner、AI 产品负责人和工程运营者的证据优先工作台：把来源、知识、方案、Blueprint、产物、发布证据和反馈串成可搜索、可审计、可恢复的对象链；Canvas 是理解关系的投影视图，不是真相源，也不是唯一入口。

设计决策：

- 继续使用项目自有 Tailwind CSS v4、语义 token 和 Lucide，不在本轮引入完整第三方 UI 框架。
- 保留暖纸、森林绿、铜色治理、工业画册的品牌基因；将 2.5D 房屋限定在 Canvas 的 `Factory` 表现模式。
- 产品主界面改为紧凑但有呼吸感的三栏工作台：分组导航、任务表面、上下文 Inspector。
- 用真实对象、真实计数、真实证据和明确边界驱动界面；禁止硬编码业务数量、伪在线状态和无依据的成功色。
- 先完成路由、状态、任务闭环和可访问性，再做插图、3D 和数字员工形象。
- 本计划整合上一轮复盘中的 canonical migration、Provider quality gate、Evidence Registry、文档漂移治理、Blueprint diff 和增量项目同步，不把 UI 与产品闭环分开建设。

建议设计参数：

| 参数 | 值 | 含义 |
|---|---:|---|
| `DESIGN_VARIANCE` | 4/10 | 有清晰品牌特征，但不牺牲工作台一致性 |
| `MOTION_INTENSITY` | 3/10 | 只为状态变化、方向和空间关系服务 |
| `VISUAL_DENSITY` | 6/10 | 面向专业用户，默认紧凑，可切换舒适密度 |

执行状态（2026-07-22）：D0 设计契约与 inventory、D1 类型化 URL 与四域 Workbench、D2 Design System v2、D3 Knowledge 核心纵切，以及 D4 Product Task → Solution → Blueprint → Artifact 纵切均已完成本地实现与验证；生产环境未改变。

## 1. 证据边界

### 1.1 已核实事实

- 当前产品壳在 `KnowledgeWorkspace.tsx` 中用本地 `useState` 管理 12 个视图，导航是按钮而不是可深链路由。
- Solutions 和 Blueprints 导航数量分别硬编码为 `04`、`05`，不代表实时业务状态。
- `Cmd/Ctrl+K` 只在 Knowledge 视图聚焦局部搜索，不是跨对象命令面板。
- 切换视图仅执行 `window.scrollTo`，没有 URL 历史、焦点转移和返回位置恢复。
- Capture 的核心表单尚无完整 `name`、`autocomplete`、字段级错误关联和未保存离开保护。
- Knowledge Library 有五组本地筛选，筛选条件不能分享或通过浏览器前进/后退恢复；列表直接渲染全部对象。
- `CanvasViewer.tsx` 为 1,449 行，`app/globals.css` 为 3,866 行；当前 UI 已出现职责和样式作用域膨胀。
- 当前设计系统已有暖纸、森林绿、铜色、slate、2.5D、语义 token、Lucide、reduced-motion 等正式契约，不需要推倒品牌重来。
- 上一轮复盘确认生产纵切已可用，但 canonical migration、Provider human-gold、Evidence Registry、文档漂移、Blueprint diff 和已有项目增量同步仍未闭环。

### 1.2 设计推断

- 当前主要矛盾是信息架构和任务状态失配，不是配色本身。
- 12 个平级入口会让用户把系统理解为功能集合，而不是从来源到生产证据的连续工作流。
- 大量小号全大写 mono 标签、重复边框、重复状态条和多层卡片削弱了主次关系。
- “房屋”对解释模块空间有价值，但对 Capture、Review、Blueprint diff、冲突解决等高频 CRUD 会增加认知负担。
- 数字员工最先应该表现为“有权限、队列、输入、输出和失败状态的责任主体”，而不是装饰头像。

### 1.3 尚未核实项

- 尚未通过正式用户研究确认不同角色的日常任务频次与默认首页偏好。
- 尚未建立当前生产版本的全页面视觉基线和任务完成时间基线。
- 暗色模式、多人实时协作和模板市场尚无已批准需求，本计划不把它们纳入首轮交付。

## 2. 参考体系及取舍

### 2.1 `awesome-design-md` 的方法，而不是皮肤

[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) 的核心价值是用 `DESIGN.md` 补足 `AGENTS.md`：前者规定产品应该如何呈现与反馈，后者规定工程如何实施。其设计说明通常覆盖九类信息：视觉主题、颜色角色、字体层级、组件与状态、布局与间距、深度与层级、Do/Don't、响应式、面向 Agent 的实施提示。

DocCanvas 应新增自己的 `DESIGN.md`，并让 token、组件、Playwright 视觉用例和评审清单共同落实它；不能把参考站点的配色和营销页面结构直接复制进产品。

### 2.2 参考产品的可用部分

| 参考 | 借鉴 | 不借鉴 |
|---|---|---|
| [Notion DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/notion/DESIGN.md) | 知识对象组织、正文可读性、轻量嵌入式操作、克制圆角 | 过度弱化状态边界、彩色装饰块泛用 |
| [Linear DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/linear.app/DESIGN.md) | 精确导航、单主色、细边界、快捷键、产品 UI 本身作为视觉主体 | 深色科技感整套复制、过度英文缩写 |
| [Miro DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/miro/DESIGN.md) | 白色画布、对象色语义、空间工具、真实协作反馈 | 贴纸色泛滥、自由布局替代治理结构 |
| [Airtable DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/airtable/DESIGN.md) | 多视图、筛选、密度、字段化对象、少阴影大留白 | 把所有内容都表格化 |
| [Together AI DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/together.ai/DESIGN.md) | 技术元数据、证据面板、mono 用于 hash/ID/时间 | 营销式渐变和多重强调色 |

### 2.3 当前 Web 界面约束

本计划采用 [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) 的关键约束：导航用链接、状态进入 URL、图标按钮有可访问名称、表单字段有真实标签和语义、异步反馈可被读屏读取、危险操作可恢复、长列表虚拟化、动画尊重 reduced motion、加载/空/错误状态完整。

## 3. 目标产品模型

### 3.1 统一对象链

所有 UI 必须围绕同一条可追溯对象链，而不是围绕页面集合：

```text
Product Task
  → Source / Capture
  → Knowledge Candidate
  → Review / Promotion Decision
  → Solution
  → Product Blueprint
  → Genome / Artifact
  → Release Evidence
  → Runtime Feedback
  → Evolution Candidate
  → 新一轮 Review
```

每个对象至少暴露：

- 稳定 ID、标题、类型和当前 revision；
- promotion / lifecycle / readiness 状态；
- 来源、valid time、system time 和 lineage；
- Owner、最近动作、下一动作和阻断原因；
- 关联上游、下游和证据；
- 允许动作与禁止动作。

### 3.2 四域信息架构

保留现有 view ID 作为兼容层，但不再显示为 12 个平级入口。

| 一级域 | 二级工作区 | 核心任务 |
|---|---|---|
| Knowledge | Capture、Library、Review、Canvas、Enrichment | 把来源变成可审计知识，并处理证据和冲突 |
| Product | Product Tasks、Solutions、Blueprints、Artifacts | 从问题形成受证据约束的方案与可编译规格 |
| Operations | Work Queue、Workflow、Timeline、Evolution、Provider Ops | 处理阻断、授权、运行证据和反馈闭环 |
| Sources | Documents、Registries、Exports | 管理三份核心文档、来源、索引和导出 |

第一阶段用 query 参数兼容迁移：

```text
/?area=knowledge&view=library&object=ko-123&revision=7
/?area=product&view=blueprints&blueprint=bp-123&mode=diff
/?area=operations&view=workflow&status=blocked
```

稳定后再评估是否迁移为独立路由段；不得在同一批同时改业务 API 和所有路由路径。

### 3.3 默认首页：Work Queue

首页不再使用营销式 hero 作为主要工作区，而是回答四个问题：

1. 我现在最应该处理什么？
2. 哪些对象被证据、授权、冲突或质量门阻断？
3. 最近发生了什么，能否追溯？
4. 哪些任务可以安全继续，哪些必须人工决策？

首屏包含：下一动作、待复核数量、冲突、即将过期的授权、最近 Blueprint/Artifact、运行闭环缺口。所有数量来自 projection，不得硬编码。

## 4. 工作台壳层

### 4.1 Desktop

```text
┌──────────┬─────────────────────────────────────────┬──────────────────┐
│ 分组导航 │ 全局命令栏：搜索 / 创建 / 状态 / Owner │ Context Inspector│
│ 68/232px ├─────────────────────────────────────────┤ 320–380px        │
│          │ 当前任务表面                            │ 可折叠           │
│          │ 列表 / 编辑器 / 画布 / diff             │ 证据/关系/历史   │
└──────────┴─────────────────────────────────────────┴──────────────────┘
```

- 左栏支持紧凑与展开两种持久状态；一级域不超过四个，二级入口按域展示。
- 顶栏提供全局对象搜索、`Create`、命令面板、当前环境、Owner 状态和通知。
- 右栏统一承载 Inspector，不再由每个模块发明独立侧栏。
- 主工作区只有一个主任务；次要说明进入 Inspector、popover 或按需展开区。
- Desktop 编辑；移动端保持只读，除非后续单独批准移动编辑契约。

### 4.2 全局命令面板

`Cmd/Ctrl+K` 在任何工作区可用，包含：

- 搜索 Knowledge、Capture、Task、Solution、Blueprint、Artifact、Release；
- 跳转视图和最近对象；
- 创建允许的对象；
- 执行当前上下文允许的动作；
- 显示快捷键；
- 不显示越权动作，不以禁用按钮暗示未授权能力。

### 4.3 URL 与状态恢复

必须进入 URL 的状态：area、view、选中对象、revision、tab、筛选、排序、分页/游标、diff 模式、画布聚焦对象。临时 draft、敏感内容、Owner 凭据和未提交正文不得进入 URL。

返回页面时恢复：滚动位置、列表选择、Inspector 开合、画布 viewport；恢复失败应显式降级到安全默认值。

## 5. 视觉系统 v2

### 5.1 品牌与材料

- 暖纸色保留为全局背景，白/米白承担主要工作表面。
- 森林绿只用于主动作、有效选择和主要流程。
- 铜色只用于治理、审批、风险提醒，不作为装饰色。
- slate 用于依赖、技术元数据和次级结构。
- 红色只用于真实失败或不可逆危险，不用于一般提示。
- 2.5D 深度只用于 Canvas 的空间分层和极少数演示场景，壳层不做房屋造型。

### 5.2 字体层级

- 工作台标题、导航、表单和数据：中文无衬线字体栈。
- 宋体只用于文档正文、引用或阅读模式，不再作为操作界面的主 display 字体。
- mono 仅用于 hash、ID、时间戳、版本、命令和 machine state。
- 持久 UI 正文不小于 12px；核心正文默认 14–15px；页面标题 24–28px。
- 删除非必要的全大写英文 eyebrow、`CONTROL SURFACE / 01` 等装饰性编号。

### 5.3 间距、形状、深度

- 4px micro grid，8px 基础节奏；默认表格行 40px，舒适模式 48px。
- 控件圆角 8px，panel 12px，overlay 16px；Canvas 房间可保留 6–8px 结构圆角。
- 常规内容层依靠背景色和 1px 边界分层；阴影只用于浮层、拖拽对象和最高层 Inspector。
- 不把每个内容单元都做成卡片；同一列表中的对象优先用 row、group 和 divider。

### 5.4 状态语言

状态必须同时使用文字、图标/形状和颜色：

| 状态族 | 示例 | 表达规则 |
|---|---|---|
| 生命周期 | draft / candidate / canonical / withdrawn | 明确中文名称与可到达的下一状态 |
| 质量 | not_measured / warning / passed / failed | 未测量不得使用绿色 |
| 运行 | disabled / ready / blocked / expired | 必须显示原因和证据时间 |
| 写入 | clean / draft / saving / conflict / saved | 状态靠近保存动作并进入 aria-live |
| 授权 | unauthorized / staged / consumed / expired | 不把 API key 存在等同于授权 |

### 5.5 Motion

- 交互反馈 140–230ms，路径 tracer 220–280ms。
- 只动画 `transform`、`opacity` 和必要的 SVG stroke；禁止 `transition: all`。
- 不使用循环漂浮、无限流光、数字员工呼吸动画。
- 拖动期间无 transform transition；拖动结束后只为受影响连接线执行一次 tracer。
- reduced-motion 下取消位移和路径运动，只保留即时颜色、描边和层级反馈。

### 5.6 插图与数字员工

- 插图用于首次引导、空状态、文档封面和 Evolution 总结，不进入每个密集操作页。
- 数字员工卡片必须显示角色、权限范围、任务队列、最近输出、失败和人工接管入口。
- 头像为可选身份辅助，不得替代状态；无可验证心跳时不得显示“在线”。
- 未来 3D 感通过材料、8–12px 深度、局部视差和空间投影实现，不使用游戏化房屋占据主要工作区。

## 6. 模块级交互方案

### 6.1 Capture

目标：在不丢失来源与许可信息的前提下完成可信快照。

- 三段布局：输入方式、来源预览、将生成的对象与边界。
- URL、粘贴文本、Markdown/TXT 文件为明确选项，不混在一个长表单。
- 增加 title、license/usage note、source owner、region、valid time、withdrawal policy。
- 提交前执行重复 source hash / URL / title 检查，显示“复用、创建新 revision、取消”选择。
- 提交后直接进入该 Capture 的详情与下一动作，不只显示一条状态文本。
- 增加未保存离开保护、字段级错误、重试和可恢复 draft。
- 服务器不主动打开 URL 的边界保持可见。

### 6.2 Knowledge Library

目标：快速找到可信对象，而不是浏览漂亮卡片。

- 默认为紧凑列表，提供 Table / Cards 两种视图和 Compact / Comfortable 密度。
- 筛选、排序、选中对象、保存视图进入 URL。
- 枚举值使用中文显示名，技术原值进入 tooltip 或 Inspector。
- 结果数超过 50 时启用虚拟化或窗口化；跨页选择有明确范围。
- 每行优先显示：标题、类型、promotion state、证据等级、valid time、最近 revision、阻断。
- Inspector 第一屏显示“为什么可信 / 为什么还不可信 / 下一动作”，hash 与 raw JSON 下沉。

### 6.3 Review

目标：以证据为中心完成可审计判断。

- 三栏：待办队列、来源/证据、候选字段与 diff。
- 字段级展示原值、候选值、人工值、来源 locator 和 warning。
- 固定底部动作：保存 draft、请求修改、批准到允许层级、放弃；canonical promotion 仍为独立硬门。
- CAS `409` 不只弹错误：进入冲突解决界面，显示 base/current/local 三方差异。
- 键盘支持下一条、上一条、保存、跳到 warning；所有快捷键可发现。
- 批量迁移 37 条 legacy 对象时提供进度、决策原因和不可跳级提示。

### 6.4 Enrichment / Provider Quality

目标：把模型调用表现为受治理的工作，而不是“AI 魔法按钮”。

- 清楚分离 Runtime、Pilot、Gold、Evaluation、Authorization 五种状态。
- Canary、19-call batch、20 条 human-gold 分成不同队列和不同硬门。
- 每次运行显示 provider、model、policy hash、plan hash、receipt、Capture scope、预算和 ledger 变化。
- 无有效授权时不显示可执行主按钮；显示准确的解锁条件。
- 模型结果默认 `human_review_required`，直接进入 Review diff。

### 6.5 Knowledge Canvas

目标：理解对象关系和影响范围，不承担结构真相源。

- 默认 `Map` 模式：中性无限画布、正交连接、清晰图例、语义缩放、关系 Inspector。
- `Factory` 模式作为可切换 Presentation，保留屋顶、房间、2.5D 和数字员工空间。
- 工具栏只保留选择、平移、缩放、fit、筛选、布局、导出、显示模式；低频动作进入 More。
- hover/focus/选中时高亮完整上下游，执行一次方向 tracer；静止时不循环流动。
- 拖动端点逐帧跟随，受影响边增量重路由，释放后精确重路由。
- 关系点击打开只读 Inspector，显示来源、目标、类型、生成依据和 revision。
- 移动端用纵向关系轨或对象列表，不把缩小的桌面画布当作移动体验。

### 6.6 Product Tasks 与 Solution Studio

目标：从问题证据形成可比较方案。

- 新建入口首先要求问题、目标用户、期望结果、约束和成功指标，不从空白 Canvas 开始。
- 左侧是 Task/证据，中央是主方案/备选方案/实验，右侧是引用对象和假设。
- 每个关键建议显示来自 Knowledge、用户输入、规则编译还是 Provider 候选。
- 不使用“Generate”作为唯一动作；明确“建立结构化候选”“比较方案”“送审”。
- 方案必须展示适用边界、风险、验证实验和被排除方案。

### 6.7 Blueprint

目标：让结构化规格可理解、可比较、可编译。

- 左侧 section navigator；中央结构化编辑/阅读；右侧 validation、lineage、artifact impact。
- 增加 revision diff：字段变化、知识基线漂移、受影响 Artifact、需重新编译范围。
- 保存、批准、编译是三个不同动作和状态，不能用一个按钮混合。
- 校验错误定位到字段；编译前显示 exact input hash 和将创建的产物。
- 编译保持 create-only；已有项目增量同步进入后续独立工作流。

### 6.8 Artifacts / Documents

目标：阅读真实产物，并验证它来自什么。

- Artifact 支持 source map、manifest、输入 hash、编译器版本和可重放状态。
- Documents 提供 VibeTrack / Pro / Playbook 的角色化切换和共享方法论对应关系。
- 重要状态从生成清单读取，不手工写死“最新”“已同步”。
- 导出预览必须与实际导出分离验证；PNG/SVG 继续有独立视觉与结构验收。

### 6.9 Operations：Workflow、Timeline、Evolution、Provider Ops

目标：从模块仪表盘升级为证据驱动的控制面。

- Workflow 显示可执行的下一动作、Owner、SLA、阻断和 evidence link。
- Timeline 合并 revision、治理、Provider、编译、发布和反馈事件，支持对象过滤。
- Evolution 不用“绿色驾驶舱”假装闭环；`not_measured` 明确呈现缺什么数据。
- Provider Ops 只面向 Operator，展示 policy/plan/receipt/ledger，不向普通用户暴露敏感运行细节。
- Evidence Registry 成为所有 readiness 和状态徽标的唯一投影来源。

## 7. 与上一轮未完成任务的整合

| 未完成能力 | UI 承载 | 产品硬门 |
|---|---|---|
| 37 条 legacy canonical migration | Review migration queue、字段 diff、批次进度、promotion history | 人工逐条决策；canonical write 单独授权 |
| Provider quality gate | Enrichment quality workbench、canary review、gold queue、readiness report | 精确调用授权；独立 human-gold |
| Evidence Registry | Operations status、对象 Inspector、release/eval/lineage 联合证据 | registry schema、ingestion、freshness 先完成 |
| 文档漂移治理 | Sources 状态页、generated inventory、文档对应关系 | 机器生成状态；CI drift check |
| 任务优先 onboarding | Work Queue、Create Product Task、next action | 用户研究与任务成功标准 |
| 跨对象搜索 | 全局 command palette 与 object index | 权限过滤、索引 freshness |
| Blueprint diff | Blueprint revision compare 与 impact panel | 确定性 diff、source map |
| 已有项目增量同步 | Artifact / Project Sync workspace | dry-run、migration plan、rollback plan |
| 团队治理 | Owner/Reviewer/Operator 角色可见性 | RBAC、审计、租户边界，后续阶段 |
| 数字员工 | Work Queue 责任主体与人工接管 | 权限、审计、failure boundary，后续阶段 |

## 8. 工程架构方案

### 8.1 组件边界

建议目标结构：

```text
components/workbench/
  WorkbenchShell.tsx
  NavigationRail.tsx
  CommandPalette.tsx
  ContextInspector.tsx
  WorkQueue.tsx
components/ui/
  Button.tsx
  Field.tsx
  Dialog.tsx
  Drawer.tsx
  Menu.tsx
  Tabs.tsx
  DataTable.tsx
  StatusBadge.tsx
  EmptyState.tsx
  AsyncState.tsx
components/knowledge/
components/product/
components/operations/
components/canvas/
lib/workbench/
  routes.ts
  commands.ts
  projections.ts
  labels.ts
```

约束：

- UI primitive 只表达行为与可访问性，不包含业务规则。
- projection 层把原始业务枚举映射为人类可读状态；组件不各自翻译。
- `KnowledgeWorkspace.tsx` 只负责壳层组合，不再承载所有模块状态和 mutation 回调。
- Canvas camera、routing、selection、export、presentation 分拆，避免继续扩大单文件。
- CSS 按 token、primitive、shell、module、canvas 分层；新增代码不得继续堆入单一 globals 文件。

### 8.2 第三方组件策略

首轮不新增运行时 UI 框架，原因是现有 token 与品牌契约已成型，完整引入 Carbon/Fluent/shadcn 会扩大迁移面并形成两个并存系统。优先建设最小内部 primitives；若 Dialog/Menu/Combobox 的可访问性验证表明自研成本不可接受，再单独评估 Radix primitives，并通过依赖审批。

### 8.3 数据与状态

- Server projection 提供 counts、readiness、next action；禁止组件硬编码数量。
- URL 管理可分享状态，React local state 只管理瞬时交互和未保存 draft。
- 所有 mutation 维持 revision/hash/CAS；UI 只消费服务端返回的新 revision。
- 全局对象搜索必须按权限过滤，不能在前端下载全部数据后隐藏。
- 状态更新时间和证据 freshness 必须显示在关键结论旁。

## 9. 响应式、可访问性和性能

### 9.1 响应式

| 断点 | 行为 |
|---|---|
| ≥1280 | 展开/紧凑 rail、主表面、常驻 Inspector |
| 768–1279 | 紧凑 rail，Inspector 为 drawer，表格隐藏次级列 |
| <768 | 四域底部导航、只读对象列表与 detail sheet；编辑动作不渲染 |

### 9.2 可访问性硬门

- 所有导航为 link；动作使用 button。
- icon-only 控件有 `aria-label` 和 tooltip。
- dialog/drawer/menu 有焦点陷阱、Escape 关闭和焦点恢复。
- 错误、保存、冲突、异步完成使用合适的 `aria-live`。
- 列表、表格、Canvas 对象和关系支持键盘到达与可见 focus。
- 颜色不作为唯一状态手段；文本对比达到 WCAG AA。
- 表单字段有 label、name、autocomplete/inputmode、描述和错误关联。
- 触控目标至少 44px，避免 hover-only 行为。

### 9.3 性能预算

- 首次任务表面交互 ≤2.5s（当前开发 Mac + Chromium 的目标夹具）。
- 常规导航和 Inspector 打开主线程阻塞 <100ms。
- 1000 Knowledge 对象列表只渲染可视窗口与 overscan。
- 1000 节点 / 2000 关系 Canvas 保持既定 55fps 目标，受影响线路重路由 p95 ≤50ms。
- 动态 import 分割 Canvas、Review diff、Provider Ops 等重工作区。
- 不为装饰加载大图；插图明确尺寸，防止 CLS。

## 10. 分阶段执行计划

### D0 — 基线与设计契约

交付：`DESIGN.md`、页面/状态 inventory、桌面/平板/移动视觉基线、核心任务基线、失败测试。

硬门：所有现有视图、写动作、状态、路由、快捷键和响应式行为都有 inventory；现状截图与测试不可被新截图覆盖。

### D1 — 壳层、路由与真实状态

交付：四域导航、URL state、全局 command palette、真实 projection counts、Work Queue、焦点与滚动恢复。

硬门：任一核心对象可以复制 URL 在新标签恢复；浏览器前进/后退正确；硬编码业务数量为零。

状态（2026-07-22）：`completed_local`。路由、对象筛选、工作队列、命令面板与四域响应式导航完成；完整 unit、typecheck/build、Chromium/WebKit/mobile 任务链及人工视觉检查通过。未 commit、push、构建候选或改变生产。

### D2 — Design System v2 与基础交互

交付：token v2、字体层级、Button/Field/Dialog/Drawer/Menu/Tabs/Status/Async primitives、加载/空/错误/冲突模式。

硬门：primitive 有键盘、读屏、reduced-motion 和视觉回归测试；旧页面可渐进兼容。

状态（2026-07-22）：`completed_local`。8 个 primitives、semantic token v2、统一 loading/empty/error/status 模式完成；CommandPalette、WorkQueue、Knowledge Library、Artifact Tabs 已迁移为真实样板。完整 unit `329 pass / 1 todo / 0 fail`、typecheck/build 通过，Chromium/WebKit/mobile 相关 Playwright `9/9` 通过，并建立 Chromium Desktop 视觉基线。未 commit、push、构建候选或改变生产。

### D3 — Knowledge 纵切

交付：Capture → Library → Review → Canvas 的完整任务流、URL filters、duplicate check、三方冲突、migration queue。

硬门：从来源到 human-review candidate 全链可追溯；刷新和冲突不丢 draft；canonical 不被越权写入。

状态（2026-07-22）：`completed_local_core`。Capture 草稿恢复/离开保护、来源预览、URL/checksum 重复提示、成功后对象与 Capture 双深链、Inspector lineage/下一动作、Review/Canvas 对象恢复、CAS base/current/local 逐字段合并和真实 migration queue 状态均已完成。完整 unit `333 pass / 0 todo / 0 fail`、typecheck/build 通过，新增 Chromium/WebKit/mobile 任务链 `3/3`，完整 Playwright `26 passed / 16 intentionally skipped / 0 failed`（42 cases）。逐条 legacy promotion 决策、promotion history 和完整 source field diff 仍是后续治理增强；未增加 canonical 写路径，未 commit、push、构建候选或改变生产。

### D4 — Product 纵切

交付：Product Task → Solution → Blueprint → Artifact、revision diff、impact、compile preview。

硬门：任一 Artifact 能回溯 Task、证据、Blueprint revision 和编译输入 hash；保存、批准、编译互不混淆。

状态（2026-07-22）：`completed_local`。Product Task 一等 UI 对象、Solution provenance、Blueprint revision diff/knowledge drift/impact、保存/批准/preview/compile 四事务，以及 Artifact input/compiler/source map/replay 反向追溯完成。完整 unit `341/341`、typecheck/build、Chromium/WebKit/mobile 与完整 Playwright 通过；旧 Artifact 保持兼容并明确缺失字段。未 commit、push、构建候选或改变生产。

### D5 — Operations 与 Evidence Registry

交付：Work Queue、统一 Timeline、readiness、Provider Ops、Evidence Registry projection、Evolution 缺口。

硬门：所有“ready/passed”都有来源和 freshness；`not_measured` 不得视觉伪装为通过。

状态（2026-07-22）：`completed_local_core_with_global_perf_gate_open`。Evidence Registry v1、Registry-derived Workflow/Evolution、统一 Timeline、Evidence 深链与只读 Provider Ops 完成；checkpoint focused `59/59`、unit `346/346`、typecheck/build 和 D0-D5 Chromium/WebKit/mobile `18/18` 通过。最新全套 Playwright 因既有 1000/2000 Canvas benchmark 为 `54.545fps`、低于 55fps 而为 `31 passed / 16 skipped / 1 failed`，精确隔离复跑 `1/1` 通过；阈值未修改，不能声明完整 Playwright 通过。未 commit、push、调用 Provider 或改变生产。

### D6 — Canvas 重构

交付：Map/Factory 双表现、精简 toolbar、关系 Inspector、路由/tracer、组件和样式拆分。

硬门：模型/路由/SVG 边数一致；连接线不穿节点；桌面/移动语义不丢失；导出独立验收。

继承能力对账：Factory Scene v3 已具备统一端口、正交路由、增量重路由、一次性 tracer、关系 Inspector、移动关系轨与 4:5 肖像核心，但尚未按 Map/Factory 与新 Workbench 契约完成整体复验。逐项状态和发布边界见 `docs/engineering/governed-workbench-release-reconciliation.md`。

状态（2026-07-22）：`completed_local_with_d8_perf_gate_open`。默认 Map、显式 Factory、关系图例、精简 toolbar、独立 `CanvasToolbar`/presentation switch、同一场景内核与两份桌面视觉基准完成；三个内置文档的 layout/scene/SVG 关系计数在 Chromium/WebKit 一致，Inspector、tracer、reduced-motion、移动只读关系轨与 PNG/SVG 真实导出通过。完整 unit `347/347`、typecheck、production build 通过。全套 1000/2000 性能门仍保留 D5 的顺序/负载敏感失败结论，未降阈值；D8 前不声明完整发布验收。未 commit、push、构建候选或改变生产。

### D7 — 响应式与移动只读

交付：tablet drawer、mobile bottom nav、read-only detail、纵向关系轨、safe-area。

硬门：390×844 无横向溢出；不渲染写控件；触控不触发 hover 动效。

状态（2026-07-23）：`completed_local_with_d8_perf_gate_open`。三档 shell、tablet drawer、390px 五项底部画布导航、移动纵向关系轨与全屏只读 detail sheet 完成；safe-area、44px 触控、touch-action、overscroll containment 和 Owner 控件隐藏均已建立契约。新鲜验证为 focused `40/40`、unit `350/350`、typecheck、production build；Playwright CLI 的 1440/1024/390 几何和视觉检查通过，390px `overflow=0`、五项目标均为 `75×48px`、detail sheet 无写控件且 console `0/0`；Pixel 7 关系轨视觉用例正常复跑 `1/1`。全套 Canvas 性能门仍留给 D8；未 commit、push、构建候选或改变生产。

### D8 — 性能与代码治理

交付：列表虚拟化、route splitting、CSS 分层、Canvas 职责拆分、性能证据。

硬门：性能预算达标；`globals.css` 与 `CanvasViewer.tsx` 不再作为新增功能的默认落点。

状态（2026-07-23）：`completed_local`。Review、Knowledge Canvas、Provider Ops 已动态加载；Knowledge/Canvas CSS 有明确 owner，`globals.css` 从 4097 行收敛到 1306 行；CSS budget 为裸色 0、`transition: all` 0，全部 6 个 `!important` 仅在有解释的 reduced-motion 无障碍覆盖中。Canvas 相机用 DOM 即时 transform 与 80ms 延迟虚拟化提交，性能从连续 `3/3` 的 `50.00–52.94fps` RED 转为隔离 `3/3` GREEN，并在最终完整 Playwright 顺序中通过。FCP/INP、surface switch、Inspector、pan/zoom/drag/reroute telemetry 与媒体尺寸/懒加载规则完成；原生 non-passive wheel 消除了 console error。最终 unit `353/353`、typecheck、production build、Playwright `34 passed / 17 intentionally skipped / 0 failed`。未 commit、push、构建候选或改变生产。

### D9 — 自动化验收与用户验证

交付：Playwright Chromium/WebKit/mobile、视觉快照、a11y、真实 CRUD/CAS/revision restore、5 个任务可用性测试。

硬门：P0/P1 零未关闭；关键任务成功率、完成时间和错误率有基线与新版本对比。

状态（2026-07-23）：`completed_local_automated_with_human_validation_limit`。完整 unit `356/356`、typecheck、production build、Playwright `45 passed / 21 intentionally skipped / 0 failed`。Chromium/WebKit/390px/键盘、真实隔离 CRUD/CAS/compile/restore、七态快照、Canvas 计数/导出/规模、WCAG AA/focus/name/reduced-motion/touch 自动化门通过；五项机器任务为 124–857ms、错误和求助点均为 0。D0 无同口径旧版计时，且本轮没有真实主持式用户或辅助技术人工测试，因此不伪造提升比例；完整记录见 `docs/engineering/d9-automated-acceptance.md`。未 commit、push、构建候选或改变生产。

### D10 — 文档、候选与发布

交付：设计手册、使用手册更新、模块迭代图、release evidence、候选镜像与 app-only 发布包。

硬门：单独执行 commit/image/backup/窗口授权；本计划不构成生产变更授权。

状态（2026-07-23）：`local_acceptance_complete_source_checkpoint_preparation`。UI-014、UI-022–025、UI-072、UI-073 已在当前本地工作树关闭或重验；Knowledge 实现证据见 `docs/engineering/ui098-knowledge-workflow-implementation.md`。完整 unit `366/366`、typecheck、build 通过；真实 Chromium CLI 在 1280/390 下验证 URL、键盘焦点、Inspector、Review 三栏和零横向溢出；最终完整 Playwright 顺序为 `50 passed / 22 intentionally skipped / 0 failed`。当前只进入 source allowlist、content manifest 与 scope hash 冻结准备；未 stage、commit、push、构建 candidate 或改变生产。

## 11. 完整 TODO

### P0：先修产品契约

- [x] **UI-000** 固定当前本地页面基线，归档 1440px、1024px、390px 截图；生产视觉基线仍需在发布门前只读刷新。
- [x] **UI-001** 建立页面、对象、动作、状态、Owner 权限和错误状态 inventory。
- [x] **UI-002** 新建 DocCanvas `DESIGN.md`，覆盖九类设计契约并链接现有 design system。
- [x] **UI-003** 将四域、二级 view、对象 ID、revision、filter、tab 定义为类型化 route contract。
- [x] **UI-004** 为现有 12 个按钮视图补充深链失败 RED 测试。
- [x] **UI-005** 删除 Solutions/Blueprints 硬编码数量，改由 server projection 返回。
- [x] **UI-006** 新建 WorkbenchShell，分离 Navigation、CommandBar、Main、Inspector。
- [x] **UI-007** 将导航按钮改为可深链 link，完成 back/forward、Cmd-click、新标签测试。
- [x] **UI-008** 建立全局 Command Palette，覆盖对象搜索、视图跳转和允许动作。
- [x] **UI-009** 建立 Work Queue projection，显示 next action、blocker、owner、freshness。
- [x] **UI-010** 建立统一人类化 label registry，禁止直接向普通用户暴露 raw enum。
- [x] **UI-011** 建立 StatusBadge/StatusSummary，保证文字、图标、颜色三重语义。
- [x] **UI-012** 建立 AsyncState：loading、empty、error、retry、stale、offline。
- [x] **UI-013** 建立 mutation 状态：draft、dirty、saving、saved、conflict、failed。
- [x] **UI-014** 为 Workbench 全部编辑器建立统一 dirty registry、跨工作区离开保护和版本化 draft 恢复；Human Gold 草稿绑定来源/修订且不持久化 attestation。
- [x] **UI-015** 为 Dialog/Drawer/Menu 补焦点陷阱、Escape、恢复和 aria-live；Inspector 为非模态补语义标题与下一动作。

### P0：Knowledge 闭环

- [x] **UI-020** 重构 Capture 输入方式与来源预览，补充字段语义、草稿恢复和重复检测；字段级 server error 关联继续随表单 primitive 迁移完善。
- [x] **UI-021** Capture 提交后导航到新对象并展示下一动作及 lineage。
- [x] **UI-022** Library 的筛选、排序、密度、视图和选择进入 URL。
- [x] **UI-023** Library 超过 50 条启用虚拟化，并覆盖键盘选择与 Inspector 同步。
- [x] **UI-024** Inspector 第一屏重排为可信度、边界、下一动作；技术元数据下沉。
- [x] **UI-025** Review 改为 queue/source/diff 三栏，字段绑定 evidence locator。
- [x] **UI-026** 实现 CAS 409 的 base/current/local 三方冲突解决界面。
- [ ] **UI-027** 已建立真实 migration queue 总量/修订/未解决原因 projection；逐条人工 promotion 决策与历史仍待独立 canonical 授权设计。
- [x] **UI-028** 保持 canonical promotion 为独立动作与授权门，不在普通保存后自动升级。
- [ ] **UI-029** 建立 canary review、19-call batch、20 条 gold 的分离工作队列。
- [x] **UI-030** Provider Ops 只读显示 policy/plan/receipt/scope/ledger-derived budget/gates；凭据存在不等于 ready，且不提供执行控件。

### P0：Product 与证据闭环

- [x] **UI-040** 建立 Create Product Task，引导问题、用户、结果、约束、指标和初始证据。
- [x] **UI-041** Solution Studio 增加主备方案、假设、边界、风险、实验和 evidence tray。
- [x] **UI-042** 标记每条方案内容的来源类型：用户、Knowledge、规则、Provider candidate；当前无 Provider candidate 时明确不显示。
- [x] **UI-043** Blueprint 建立 section navigator、validation、lineage 和 artifact impact。
- [x] **UI-044** 实现 Blueprint revision diff、knowledge baseline drift 和 recompile scope。
- [x] **UI-045** 将保存、批准、compile preview、create-only compile 拆成独立动作、权限和状态。
- [x] **UI-046** Artifact 展示 manifest、source map、input hash、compiler version、replay 状态。
- [x] **UI-047** 建立跨 Task → Artifact 的对象链导航和反向追溯。
- [x] **UI-048** 建立 Evidence Registry schema、projection、稳定 Evidence ID、双时态、完整性与 freshness 规则。
- [x] **UI-049** Workflow/Evolution 的 passed/ready 改为从 Registry claim 计算，`not_measured` 保持独立状态。

### P1：视觉与 Canvas

- [ ] **UI-060** 发布 token v2：工作台 sans、文档 serif、状态色角色、密度和层级。
- [ ] **UI-061** 清理小于 12px 的持久 UI 文本和无意义全大写 mono eyebrow。
- [ ] **UI-062** 减少重复 card/border/top-accent，建立 row/group/divider 优先级。
- [ ] **UI-063** 建立 Compact/Comfortable 密度并持久化偏好。
- [x] **UI-064** 将房屋从全局壳层移到 Canvas `Factory` presentation。
- [x] **UI-065** 新建 Canvas `Map` 默认表现与 Map/Factory 切换。
- [ ] **UI-066** 分拆 camera、routing、selection、relations、export、presentation 模块。
- [x] **UI-067** 统一 port contract、正交 routing、专用通道、箭头和命中区。
- [x] **UI-068** 完成受影响边增量重路由与释放后的精确重路由。
- [x] **UI-069** 完成上下游高亮和一次性 tracer，覆盖 reduced-motion。
- [x] **UI-070** 建立关系 Inspector 和中文可访问名称。
- [x] **UI-071** 重做屋顶与一级标题，只在 Factory presentation 中保留克制 2.5D。
- [x] **UI-072** 数字员工卡片已展示角色、状态、权限、队列、能力、最近输出、阻断和 human gate，并固定 `canExecute=false`，不伪装真实在线员工。
- [x] **UI-073** 已使用稳定 WebP 角色、确定性 fallback 和 4:5 上传预览/规范化，不使用随机头像或伪在线状态。

### P1：响应式、性能和工程治理

- [x] **UI-080** 完成 1280+、768–1279、<768 三档 shell 行为。
- [x] **UI-081** 移动端只读四域导航、detail sheet 与关系轨。
- [x] **UI-082** 覆盖 safe-area、44px 触控、touch-action 和 overscroll containment。
- [x] **UI-083** 动态加载 Canvas、Review diff、Provider Ops 等重工作区。
- [x] **UI-084** 将 globals CSS 拆为 token/primitive/shell/module/canvas 作用域。
- [x] **UI-085** 设立 CSS 预算：新增裸色为零、`transition: all` 为零、无解释 `!important` 为零。
- [x] **UI-086** 建立真实列表与 1000/2000 Canvas 性能夹具。
- [x] **UI-087** 采集 FCP/INP、任务表面切换、Inspector、pan/zoom/drag/re-route 指标。
- [x] **UI-088** 为插图、肖像和文档预览固定尺寸、格式、懒加载和元数据规则。

### P1：验证和发布准备

- [x] **UI-090** Playwright 覆盖 Chromium、WebKit、390px mobile 和 keyboard-only。
- [x] **UI-091** 覆盖 URL 深链、back/forward、刷新恢复、权限过滤和 command palette。
- [x] **UI-092** 覆盖 Capture、Review CAS、Blueprint diff、compile、revision restore 的真实 CRUD。
- [x] **UI-093** 建立 loading/empty/error/stale/conflict/unauthorized/expired 视觉快照。
- [x] **UI-094** 建立 Canvas 模型/路由/SVG 边数、穿模、箭头、导出结构断言。
- [x] **UI-095** 建立 WCAG AA、焦点、读屏名称、reduced-motion 和触屏验证。
- [x] **UI-096** 用五个核心任务做自动化可用性基线并记录完成时间、错误和求助点；主持式真实用户对照仍是显式证据限制。
- [x] **UI-097** 更新产品设计逻辑、Owner/Reviewer/Operator 使用手册和模块演进图；单文件 HTML、入口文档和状态对账完成。
- [ ] **UI-098** 生成候选 commit/image/metadata，并执行本地、candidate、L3 分层验证。
- [ ] **UI-099** 只有在 exact commit/image/backup/window 获得新授权后执行生产 app-only activation。

### P2：闭环稳定后再做

- [ ] **UI-110** 多人角色、审批队列和团队审计视图。
- [ ] **UI-111** 受控 connector ingestion 和增量 snapshot diff。
- [ ] **UI-112** 已有项目 dry-run 增量同步、codemod 和 rollback plan UI。
- [ ] **UI-113** 数字员工任务编排、失败升级和人工接管。
- [ ] **UI-114** 模板市场与可验证复用指标。
- [ ] **UI-115** 暗色模式可行性评估；只有全状态、全模块和导出一致时实施。

## 12. 验收场景

1. Reviewer 从带筛选的深链打开某条候选，核对 source locator，修改双时态字段，遇到并解决 CAS 冲突，保存新 revision；刷新后状态、选择和 URL 一致。
2. Product Owner 从 Product Task 引用 Knowledge，形成主备方案，编译 Blueprint；Artifact 可反向追溯所有输入和 revision。
3. Operator 查看 Provider canary，但无有效 receipt 时界面不渲染执行动作；获得精确授权后只显示该 scope 可执行动作。
4. 用户在 Canvas 选择一个对象，上下游关系高亮并执行一次 tracer；键盘和 reduced-motion 用户获得等价信息。
5. 移动端能查看 Work Queue、Knowledge、Product 和 Operations 详情，无写控件、无横向溢出、无关系语义丢失。
6. 任一“ready/passed/canonical”状态都能打开证据、时间和来源；证据过期时状态自动降级或标记 stale。

## 13. 不做什么

- 不在第一阶段更换业务 API、数据库或 mutation contract。
- 不把 Canvas 变成手动画线的任意白板；关系继续由结构规则生成。
- 不因视觉重构放宽 Owner、canonical、Provider 或生产授权门。
- 不复制任何参考品牌的完整配色、字体和营销版式。
- 不为“高级感”增加循环动画、玻璃拟态、全站 3D 或大量渐变。
- 不在首轮新增暗色模式、多人实时协作、模板市场或移动编辑。

## 14. Definition of Done

只有同时满足以下条件，才能称为本轮 UI/交互重构完成：

- 四域信息架构和对象链可理解、可深链、可恢复；
- Capture → Knowledge → Review → Solution → Blueprint → Artifact 的主链可完成；
- canonical、Provider、Owner 和生产边界在 UI 与服务端一致；
- 所有数量与 readiness 来自真实 projection / Evidence Registry；
- 核心表单、导航、Inspector、Dialog、Canvas 通过键盘与可访问性验收；
- 桌面、平板、移动只读均有完整状态；
- 性能、视觉回归、CRUD/CAS/restore、Canvas 关系和导出验证通过；
- 使用手册、设计契约、状态 inventory 与代码保持一致；
- 候选、本地验证、只读生产检查和生产变更证据继续分层；
- 无新授权时 `production unchanged`。
