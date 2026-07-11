# AI产品全链路开发骨干路线图 — Vibe Track Edition

**（v1.0 | 2026-07-04 — 面向普通人的双轨SOP：🚀 Vibe Track 默认路径 + 🛠️ Pro Track 进阶参考）**

---

## 0. 文档架构总览

```
§0   本文档定位与三份文档关系
🚦   上车前准备（账号/成本/安全红线/产品选择器）
⚡   元原则 + 5个核心模式（必读）
§1-8 八大阶段闭环（每阶段三部分）
       🚀 Vibe Track → Codex 提示词直接复制
       🛠️ Pro Track → 工具推荐（进阶）
       🔗 衔接 → 下一阶段
全流程  工具速查 + 3条铁律 + 5原型对照表
```

**本文档定位**：
- **我该读吗**: 你不会写代码。你只会用 Codex 桌面端打字聊天。你想做一个 AI 产品。这就是给你的。
- **我不该读吗**: 你会写代码，需要完整的技术栈决策树 → 请读 [Pro Track 参考](AI产品全链路开发骨干路线图-v2.7.md)。你是 AI Agent 需要可执行的平台操作系统 → 请读 [Playbook-v2](AI产品工厂操作系统Playbook-v2.md)。
- **怎么读**: 每阶段先看 🚀 Vibe Track——复制 Codex 提示词 → 粘贴 → 得到产出。需要更多工具选项时看 🛠️ Pro Track。做完后看 🔗 衔接——把产出带到下一阶段。
- **三份文档关系**: VibeTrack(默认路径) → v2.7 Pro(Tool选型深度) → Playbook-v2(AI引擎/基因组系统)。由浅入深，互不重复。
- **遇到不懂的词**: 参见 [共享术语附录](shared/GLOSSARY.md)。按你的级别（🟢 L1 基础）查阅——不需要理解 🔴 L3 平台级术语。

> **默认路径**: 🚀 Vibe Track。Pro Track 是进阶选项。两条路最终通往同一个东西：一个上线的 AI 产品。

---

---

## 🚦 上车前准备（5 分钟，一次搞定）

在跟着任何一段 Codex 提示词操作之前，先确认你具备了这四样东西。缺任何一样，后面都会卡住。

### 你需要什么

| # | 准备项 | 怎么做 | 要花钱吗 |
|---|--------|--------|---------|
| 1 | **Codex 桌面端** | 下载安装 [Codex Desktop](https://codex.openai.com/desktop) | **Pro($20/月) 或 Plus($20/月)**。推荐 Pro——GPT-5.5 模型生成质量显著更高。⚠️ 以下模板假设你使用 GPT-5.5 或更高模型。免费版(GPT-4o-mini)的生成质量可能达不到预期。 |
| 2 | **Vercel 账号** | [vercel.com](https://vercel.com) → Sign Up with GitHub | **免费**（Hobby 套餐：100GB 带宽/月，MVP 阶段完全够用） |
| 3 | **Supabase 账号** | [supabase.com](https://supabase.com) → Start Free | **免费**（500MB 数据库 + 2GB 带宽 + 50MB 存储，MVP 阶段够用） |
| 4 | **OpenAI API Key** | [platform.openai.com](https://platform.openai.com) → API Keys | **按量付费**（GPT-5.5: $2.50/1M 输入 + $10/1M 输出 tokens。MVP 阶段约 $5-20/月） |

### 你的 MVP 大概花多少钱

| 原型 | LLM 成本（月） | 基础设施（月） | 总计（月） | 够用条件 |
|------|-------------|-------------|----------|---------|
| **A 对话/Agent** | $5-20 | $0（Vercel+Supabase 免费层） | **$25-40** | DAU < 500 |
| **B 内容生成** | $10-50 | ⚠️ **GPU $50-200**（Modal H100 ~$2-4/时） | **$80-270** | 每日 < 100 生成请求 |
| **C 数据分析** | $5-20 | $0-25（Coolify自托管需 VPS $5-25/月） | **$5-45** | DAU < 200 |
| **D 行业Agent** | $20-100 | $25-200+（Neo4j AuraDB + Temporal + 安全审计） | **$70-500+** | 取决于合规要求 |
| **E 开发工具** | $10-50 | $10-50（Daytona沙箱） | **$40-120** | DAU < 200 |

> **好消息**：原型 A 和 C 的 MVP 阶段，大概率**不需要花钱在基础设施上**（Vercel/Supabase 免费层完全够用）。唯一的硬成本是 LLM API 和 Codex 订阅。

### 三个安全红线

| # | 红线 | 为什么 |
|---|------|--------|
| 1 | **绝不要把 API Key 直接粘贴到 Codex 对话中** | Codex 可能把 Key 写到代码文件、提交到 Git、记录到日志。**正确做法**: 让 Codex 帮你创建 `.env` 文件，或者使用 Infisical(20K⭐)。如果 Codex 让你提供 Key，打开 `.env` 文件自己填——不通过对话。 |
| 2 | **不要克隆受保护的品牌设计** | "我喜欢这个网站的设计"可以用来看配色/布局/间距——提取风格特征是合法的。但完整复刻一个知名品牌（如 Apple/Stripe 官网）的视觉设计可能侵犯版权。**正确做法**: 让 Codex 把风格描述为文字("简约、大量留白、无衬线字体")，基于描述生成，而非像素级复刻。 |
| 3 | **收集用户数据需要隐私政策** | 等候名单收集邮箱 → 需要说明"我们会用这个邮箱做什么"。PostHog 追踪 → 需要在隐私政策中声明。大多数 MVP 阶段不需要法律顾问——用免费的隐私政策生成器即可。但**不能不提示**。 |

### 你的产品属于哪种？（自动匹配原型）

不知道怎么选？看这 12 种描述，找到最接近你的：

| 你说的可能是... | 选这个原型 | 跟着哪个模板走 |
|--------------|----------|--------------|
| "做个像 ChatGPT 那样的聊天界面" | A 对话/Agent | [A] 启动模板 |
| "做个 AI 客服，能回答产品问题" | A 对话/Agent | [A] 启动模板 |
| "做个能搜公司内部文档的 AI" | A 对话/Agent | [A] 启动模板 |
| "做个像 Perplexity 那样的 AI 搜索" | A 对话/Agent | [A] 启动模板 |
| "做个 AI 写文案/文章/小说的" | B 内容生成 | [B] 启动模板 |
| "做个 AI 画图/做设计/生成视频的" | B 内容生成 | [B] 启动模板 |
| "做个 AI 帮我查数据库、做报表的" | C 数据分析 | [C] 启动模板 |
| "做个医疗 AI/法律 AI/审计 AI" | ⚠️ D 行业Agent | [D] 启动模板（⚠️先读法律警告） |
| "做个用在工厂/供应链的 AI" | ⚠️ D 行业Agent | [D] 启动模板（⚠️先读法律警告） |
| "做个 AI 编程助手/代码审查工具" | E 开发工具 | [E] 启动模板 |
| "做个让用户自己搭 Agent 的平台" | E 开发工具 | [E] 启动模板 |
| "以上都不是" / "说不清楚" | 从 A 开始 | [A] 启动模板 |

> **不确定的时候，默认选 A**。原型 A（对话/Agent）是 2026 年最成熟的产品类型，技术栈最稳定，成本最低。你的产品大概率可以先从对话型开始，后续演化。两条路最终通往同一个东西：一个上线的 AI 产品。

---

## ⚡ 一个元原则 + 五个核心模式（先在脑子里装这六句话）

**元原则**：你不是在学做产品，你在学让 AI 帮你做产品。你不需要懂技术——需要懂表述。表述 = 把你想的东西说清楚。如果 AI 做出来的不对，是表述不够精确，不是不够聪明。**你负责说清楚"要什么"，AI 负责"怎么做"。**

所有操作都是以下五个模式的变体。学会了，你就能举一反三。

| # | 模式 | 口诀 | 一句话 Codex 模板 |
|---|------|------|-----------------|
| 1 | **克隆替换** | "我要那个，换我的内容" | `打开 [参考网站]，提取它的设计风格。用相同的设计，但换成我的内容。做完后 Playwright 截图对比。` |
| 2 | **截图即代码** | "照这个做" | `这是我想做的页面 [粘贴截图]。用 shadcn/ui 实现它。做完 Playwright 打开截图对比，自己修正。` |
| 3 | **对话即部署** | "给我一个链接" | `把这个项目部署到 Vercel（免费 Hobby），给我 URL。部署后用 Playwright 确认一切正常。` |
| 4 | **询问即分析** | "数据告诉我什么" | `读取 PostHog 最近 7 天数据。总结：多少人用？卡在哪？我该先修什么？` |
| 5 | **观看即测试** | "跑一遍看看坏了没" | `Playwright 打开 [URL]。模拟完整用户流程。截图每一步。有错误直接修，最多修 3 次。` |

---

## 总览：八大阶段闭环

```
① 想法验证 → ② 产品设计 → ③ 技术选型 → ④ 开发实施
     ↑                                          ↓
⑧ 持续进化 ← ⑦ 运营增长 ← ⑥ 部署上线 ← ⑤ 测试修复
```

**这条路线图教你**：每一阶段对着 Codex 说什么话 → 拿到什么产出 → 把什么带到下一阶段。

---

## 阶段①：需求洞察与验证（1-2天）

### 🚀 Vibe Track

> **目标**: 确认你的想法有人需要，不是自嗨。

**Codex 第一句提示词（复制粘贴）**：
```text
我有一个产品想法：[一句话描述你的想法]。

你是资深产品经理。先向我提出 5 个尖锐问题（市场、用户、差异化）。
等我回答完，帮我生成一页纸 PRD，保存到 docs/prd.md，包含：
- 价值主张（一句话）
- 目标用户（具体到可以找到人聊）
- 核心功能（最多 3 个，写清为什么要做这 3 个）
- 不做什么（明确排除）
- 成功指标（怎么判断做对了）
```

**Codex 第二句（落地页验证）**：
```text
基于 docs/prd.md，用 Vercel（免费 Hobby 套餐）给我做一个落地页：
- Hero 区 + 3 个核心价值点
- 邮箱等候名单（至少能收集邮箱）
- 部署后给我 URL
不要花超过 20 分钟在这上面。够用就行。
```

**期望产出**：`docs/prd.md` + 一个可以分享给朋友的落地页 URL + 不少于 10 个等候名单注册。

### 🛠️ Pro Track

| 节点 | 方法 | 工具 |
|------|------|------|
| 灵感挖掘 | 痛点清单 + 竞品差距 | Claude Code 头脑风暴 + Perplexity 市场调研 |
| 竞品代码级调研 | 克隆竞品仓库分析 | **Codex CLI** + **Firecrawl MCP**(6.6K⭐) |
| 需求验证 | 落地页 Fake Door 测试 | **v0.dev** + AI Elements + PostHog 追踪 |
| PRD 生成 | 多模型交叉审查 + 魔鬼代言人 | **SpecWright**（唯一把UX设计分配给独立AI专家的管道工具）|
| MVP 边界 | 砍掉 80% 功能 | **claude-code-discover**（生成 Persona + IA树 + Mermaid 用户流 + PRD + 置信度表）|

**TOP 3 工具**：
| # | 工具 | ⭐ | 核心价值 |
|---|------|-----|---------|
| 1 | **SpecWright** | npm | 五阶段专家工作流。唯一把 UX 设计分配给独立 AI 专家的工具 |
| 2 | **claude-code-discover** | 3-5K | 产品发现插件。EARS格式验收标准 + 4-Risks置信度表 |
| 3 | **doit** | v0.1.11 | 从 Spec 一键生成全套项目地图（旅程图+架构+ER+Gantt） |

### 🔗 衔接 → 阶段②

**带走这些**：`docs/prd.md`（一页纸 PRD）。落地页 URL。从等候名单收集到的 5+ 条用户反馈。

**在下一阶段的 Codex 对话中**：告诉 Codex "读取 docs/prd.md，基于 PRD 帮我设计产品"。

> **如果出问题**：`docs/prd.md` 不存在？Codex 说"文件不存在"？→ 回到第一步，让 Codex "创建 docs/prd.md 文件并写入 PRD 内容"。

---

## 阶段②：产品设计（2-5天）

### 🚀 Vibe Track

> **核心心法**: 你不是设计师。但你知道喜欢什么。用"克隆替换"模式——找到喜欢的东西，让 Codex 照着做。

**路径一：克隆一个你喜欢的网站（模式 1）**
```text
我喜欢这个网站的设计：[URL]。

用 Dembrandt 提取它的设计 token（颜色/字体/间距/组件风格）。
然后用完全相同的设计风格，为我的产品 [产品名] 做一个页面，
内容是：[从 docs/prd.md 中复制价值主张和核心功能]。

做完后 Playwright 打开截图，和原网站对比。
调整到风格一致为止。最多迭代 3 轮。
```

**路径二：截图即代码（模式 2）**
```text
这是我想要的界面 [粘贴截图/用 Appshot]。
用 shadcn/ui + Tailwind + AI Elements 复刻它。

要求：
- 1:1 还原布局和交互
- 如果是对话界面，支持流式响应（打字机效果）
- 所有点击/输入/状态切换的交互都要实现

做完后用 Playwright 打开，走一遍完整交互流程，截图验证。
```

**路径三：用 OpenDesign 一键生成（模式 1 的升级版）**
```text
用 OpenDesign 为我的产品生成一套完整的设计方案：
- 我的产品是：[一句话描述]
- 参考风格：[选择一个品牌，如 Linear/Stripe/Vercel/Apple]
- 输出：颜色方案、字体选择、组件风格、页面布局

OpenDesign 会自动检测我的 Codex Agent 配置，
生成符合我项目技术栈的组件代码。
```

**期望产出**：一套你自己看着觉得"挺好看"的页面 + 一个会说话的 Agent 对话界面（如果是对话型产品）。

### 🛠️ Pro Track

| 节点 | 方法 | 工具 |
|------|------|------|
| 用户流程图 | User Journey Map | **Mermaid**（让 Codex 直接生成）+ Figma MCP |
| 原型设计 | 设计→代码 | **Open Design**(60K⭐ 2026 黑马) + **screenshot-to-code**(73K⭐) + **Onlook**(26K⭐) |
| UI 设计系统 | 直接采用成熟组件库 | **shadcn/ui** + **AI Elements**(30+ AI 组件) + **assistant-ui**(10.6K⭐) |
| Agent 行为规格书 | 一鱼三吃 | **GitHub Spec Kit**(110K⭐, Microsoft/GitHub 开源) 或 **AgentCanvas**(可视化节点图) |
| 文档沉淀 | PRD 细化、API 草案 | **Notion MCP** + Claude Projects |

**TOP 3 工具 — 设计→代码**：
| # | 工具 | ⭐ | 核心价值 |
|---|------|-----|---------|
| 1 | **Open Design** | 60K | 开源/本地优先。自动检测 21+ CLI Agent。150+ 品牌设计系统。155+ 可组合 Skill。Agent-native。 |
| 2 | **screenshot-to-code** | 73K | 截图/Figma→HTML/Tailwind/React/Vue。Gemini 3+Claude Opus。简单可靠。 |
| 3 | **Onlook** | 26K | "Cursor for Designers"。浏览器可视化编辑 React 代码。Figma 导入+双向同步。 |

**TOP 3 工具 — Agent 设计**：
| # | 工具 | ⭐ | 核心价值 |
|---|------|-----|---------|
| 1 | **GitHub Spec Kit** | 110K | Spec-Driven Development 标准。7 步工作流。30+ Agent 兼容。 |
| 2 | **AgentCanvas** | 社区 | ComfyUI 风格节点图。一 JSON = 一 Agent。可视化+执行引擎。 |
| 3 | **loom-spec** | npm | 可视化架构编辑器。AI 可读/git-diffable。MCP Server(19工具)。Drift Detection。 |

### 🔗 衔接 → 阶段③

**带走这些**：设计截图或 Codex 生成的页面代码 + Agent 行为规格书（如果你做了） + 对产品的"感觉"。

**在下一阶段**：告诉 Codex "基于这些设计，帮我初始化整个项目"。

> **如果出问题**：Codex 不知道"基于设计"是什么意思？→ 把阶段②生成的截图用 Appshot(Cmd+Shift+A) 直接拖进对话框。或者复制 Codex 生成的页面文件的路径告诉它。

---

## 阶段③：技术架构（1-2天）

### 🚀 Vibe Track

> **核心心法**: 你不需要选技术栈。Codex 帮你选。你只需要告诉它"我的产品是什么类型"，然后把对应的提示词丢给它。

**你的产品是哪种？选一个**：

| 产品类型 | 如果你要做的是... | 复制对应提示词 |
|---------|-----------------|-------------|
| **A 对话/Agent** | ChatGPT 类、AI 客服、AI 助手、知识问答 | 见下方 [A] |
| **B 内容生成** | AI 写作、AI 绘画、AI 配音、AI 做 PPT | 见下方 [B] |
| **C 数据分析** | AI 查数据库、AI 做报表、AI 分析 | 见下方 [C] |
| **D 行业 Agent** | 医疗 AI、法律 AI、审计 AI、工业 AI | 见下方 [D] |
| **E 开发工具** | AI 编程助手、AI 代码审查 | 见下方 [E] |

**选好了吗？复制对应的提示词给 Codex**：

**[A] 对话/Agent 型产品 — Codex 启动模板**：
```text
你现在要构建一个「对话/Agent型」AI产品：[产品名称]。

技术栈锁定（不要问我，直接用）：
- 前端：Next.js 15 + shadcn/ui + AI Elements
- Agent框架：Mastra（TypeScript）
- 数据库：Supabase（Postgres + pgvector + Auth + Storage 一体化）
- 嵌入模型：中文→Qwen3-Embedding-8B，多语言→BGE-M3
- 记忆：Zep Graphiti（$25/月，双时态KG）
- LLM网关：LiteLLM（自动故障切换+多模型路由）
- 部署：Vercel（前端）+ Railway（后端）

任务：
1. 初始化 Next.js + Mastra 项目骨架
2. 配置 Supabase + pgvector + LiteLLM 网关
3. 生成 docs/architecture/decisions/ 下的架构决策记录
4. 运行 scripts/cost-model.ts 输出成本预估
5. npm run dev 可启动，Playwright MCP 截图确认
工作边界：不选型过度。用 Context7 查最新 API。
```

**[B] 内容生成型产品 — Codex 启动模板**：
```text
⚠️ GPU 成本警告：内容生成型产品的 GPU 成本是主要开支。
Modal H100 GPU 按需约 $2-4/小时。一张图生成可能花费 $0.01-0.05。
MVP 阶段 GPU 月预算约 $50-200（取决于生成请求量）。
建议在 Modal 设置每日预算上限 $10，避免意外账单。

你现在要构建一个「内容生成型」AI产品：[生成类型]。

技术栈锁定：
- 前端：Next.js 15 + 内容预览/编辑组件
- 推理后端：FastAPI + Celery（GPU任务队列）
- GPU平台：Modal（按需容器）或 Replicate（托管）
- 文本：GPT-5.5（通过 LiteLLM）
- 图像/视频/音频：[按需选型]
- 存储：S3/MinIO + CDN
- 部署：Railway + Modal GPU

任务：
1. 初始化 Next.js + FastAPI + Celery 项目骨架
2. 配置 Modal GPU（spot实例降成本，空闲5min自动关机）
3. 生成 docs/architecture/decisions/
4. npm run dev 可启动
工作边界：GPU成本是关注点。用 Modal spot 实例。设置每日预算告警。
```

**[C] 数据分析型产品 — Codex 启动模板**：
```text
你现在要构建一个「数据分析型」AI产品。

技术栈锁定：
- 前端：Next.js 15 + 数据可视化组件(Chart.js/ECharts)
- Agent框架：LangGraph（Python，分析产品天然Python栈）
- 数据管道：dlt（批量ELT）+ Pathway（实时流RAG）
- Text-to-SQL：Vanna.ai（开源NL2SQL）+ GPT-5.5 + Claude Sonnet（双模型对照验证）
- 部署：Coolify自托管（数据不出企业）+ Bytebase（DB治理）
- 安全红线：Agent只读权限。绝不给写权限。

任务：
1. 初始化 LangGraph + dlt + Pathway 项目
2. 配置 Bytebase：只读权限 + 列级脱敏 + 查询审计
3. 安全硬限制：最大执行60s，最大返回10K行，禁止DROP/DELETE/UPDATE
4. npm run dev 可启动
工作边界：DB凭证只读。查询超时自动kill。结果集超限截断。
```

**[D] 行业Agent型产品 — Codex 启动模板**：
```text
⚠️ 法律警告：如果你要构建的产品涉及医疗诊断、法律建议、金融投资建议、
安全关键操作（航空/工业控制/自动驾驶），
本模板仅提供技术架构指导，不提供任何合规建议。
在这些领域运营 AI 产品需要独立的合规审查、监管批准和专业法律顾问。
错误的产品建议可能导致用户损失、开发者承担责任、甚至触犯法律。
如果你不确定你的产品是否属于"高风险"，先咨询相关领域的律师。

你现在要构建一个「行业Agent型」AI产品：[行业名称]。

技术栈锁定：
- Agent框架：LangGraph + Temporal（耐久执行）
- 图数据库：Neo4j（领域知识图谱）
- 向量库：Qdrant
- 记忆：Mem0 + Hindsight（SOTA 91.4%）
- 合规引擎：Regula（398规则，EU AI Act）+ 行业专用规则库
- 护栏：Guardrails AI + MS Presidio + MS Agent Governance
- 部署：Coolify自托管 + Daytona沙箱
- Agent监控：AgentOps（多Agent瀑布图 + 时间旅行回放）

任务：
1. 初始化 LangGraph + Temporal + Neo4j 项目
2. 领域知识建模：梳理行业术语→Neo4j Cypher Schema
3. 合规引擎前置：Regula + 行业规则库
4. 多Agent拓扑：Orchestrator-Worker（禁止Peer-to-Peer）
5. Coolify自托管 + Daytona沙箱
工作边界：行业Agent最高安全等级。不要在生产用社区MCP fork。不要跳过合规审查。
```

**[E] 开发工具型产品 — Codex 启动模板**：
```text
你现在要构建一个「AI开发工具型」产品。

技术栈锁定：
- 核心引擎：Rust（推理核心，延迟p95<200ms）或Go（API网关）
- IDE集成：TypeScript VS Code/Cursor 扩展
- 沙箱：Daytona（90ms冷启动，30+语言）
- 代码分析：agent-lsp（推测执行）+ LoopLens MCP（死循环检测）
- LLM：GPT-5.5（通过LiteLLM）+ Claude Opus（复杂推理）
- 部署：Vercel + Daytona沙箱集群 + MCP网关

任务：
1. 初始化 Rust/Go 核心引擎 + TypeScript IDE插件骨架
2. Daytona 沙箱集成 + LoopLens 死循环防护
3. 评估：SWE-bench Pro（标准化版，非Verified版）
4. npm run dev 可启动
工作边界：不用SWE-bench Verified（已被污染）。沙箱必须隔离。
```

**期望产出**：Codex 初始化了一个可以编译通过的完整项目。`npm run dev` 能看到页面。架构决策记录在 `docs/architecture/decisions/`。

### 🛠️ Pro Track

**技术栈速查**（与蓝图对应的完整方案）：

| 层 | 原型A 对话 | 原型B 内容 | 原型C 分析 | 原型D 行业 | 原型E 工具 |
|----|----------|----------|----------|----------|----------|
| **Agent框架** | Mastra(TS)/LangGraph(Py) | FastAPI+Celery | LangGraph(Py) | LangGraph+Temporal | Rust/Go+MCP |
| **数据库** | Supabase/pgvector | S3/MinIO | Qdrant+企业DB | Neo4j+Qdrant | Git/Sandbox |
| **向量库** | pgvector | — | Qdrant | Neo4j+Qdrant | — |
| **嵌入** | Qwen3-Emb / BGE-M3 | — | BGE-M3 | BGE-M3 | — |
| **记忆** | Zep Graphiti($25) | — | Zep Graphiti | Mem0+Hindsight | — |
| **评估重点** | LLM-as-Judge | 人类偏好+A/B | SQL准确率 | 合规+业务指标 | SWE-bench Pro |
| **安全等级** | 中 | 低 | 高(只读DB) | 最高(合规) | 中 |
| **部署** | Vercel+Coolify | Railway+GPU集群 | Coolify自托管 | Coolify自托管 | Vercel+Sandbox |

**TOP 3 架构层工具**：
| 类别 | #1 | #2 | #3 |
|------|----|----|-----|
| AI原生数据库 | **LanceDB**(10.6K⭐) 多模态向量Lakehouse | **turbopuffer**(商用) 无服务器向量+全文 | **Endee**(1.7K⭐) 10x基础设施减少 |
| 知识图谱 | **Zep Graphiti**(26.3K⭐) 双时态KG+LangMemEval 94.8% | **Youtu-GraphRAG**(1.2K⭐) ICLR 2026+腾讯部署 | **AWS GraphRAG**(400⭐) Lexical Graph |
| 数据摄取 | **RAGFlow**(83K⭐) 全球最高星标OSS RAG | **Knowhere**(1.8K⭐) 文档层次重构+Agentic RAG | **WeKnora**(17K⭐) 企业全栈(飞书/Notion) |

### 🔗 衔接 → 阶段④

**带走这些**：项目已初始化且可启动。技术栈已锁定。架构图在 `docs/architecture/`。成本预估报告。

**在下一阶段**：打开 Codex，说"基于当前项目，帮我实现核心功能"。

> **如果出问题**：`npm run dev` 报错？→ 把完整的错误信息复制给 Codex，加上："这个错误是什么原因？先解释为什么，再帮我修。最多修 3 次。第 4 次还不行就告诉我你最怀疑哪个环节有问题。"

---

## 阶段④：开发实施（1-4周）

### 🚀 Vibe Track

> **核心心法**: 从最简版本开始。能跑就行，不求完美。遇到问题用"观看即测试"模式让 Codex 自己修。

**第一步：做最简单的能跑的版本**
```text
基于当前项目，实现最简 MVP：
- [核心功能 1]：只要最基础的功能，能走通就行
- [核心功能 2]：同上
- [核心功能 3]：同上

先别管 UI 细节、错误处理、加载状态。先让核心流程能跑通。
每实现一个功能，用 Playwright 测试一次。有问题自己修，最多 3 次。
```

**第二步：加上加载/错误/空状态**
```text
现在给所有页面加上完整的状态处理：
- 加载中（Loading）：显示骨架屏或加载动画
- 错误（Error）：友好的错误提示 + 重试按钮
- 空状态（Empty）：引导用户第一步操作
- 边界：空输入/超长输入/特殊字符的处理

每加一个状态，Playwright 测试验证。
```

**第三步：让 Codex 自己看着修**
```text
用 Playwright 打开我的应用 [URL]。
模拟一个完整用户流程：[描述你的典型用户会怎么用]。

截图每一步。列出所有问题：
- 界面显示不对的
- 点击没反应的  
- 交互不流畅的
- 内容有错误的

然后逐一修复。修完一个再修下一个。不要一口气修完。
```

**开发中遇到问题怎么办**：
```text
# 报错了，不知道原因
"这个错误是什么原因？[粘贴错误信息]。先解释为什么，再给我修。"

# Codex 修了 3 次还没好
"你已经试了 3 次了。先停下来。列出现在已知的信息，告诉我你最怀疑哪个环节出了问题。"

# 想加新功能但怕破坏已有功能
"在不动已有功能的前提下，帮我加 [新功能]。加完后 Playwright 跑一遍已有流程，确认没被破坏。"
```

**期望产出**：一个能正常使用的 MVP。所有核心功能都能走通。有基本的加载/错误/空状态。Playwright 测试通过。

### 🛠️ Pro Track

详细的 Pro Track 蓝图（每份 7-8 步实现路径 + 常见陷阱）见原路线图 v2.7 阶段④。

**TOP 3 开发工具**：

| 类别 | #1 | #2 | #3 |
|------|----|----|-----|
| **SubAgent** | **VoltAgent**(5.2K⭐) 171+ TOML SubAgent | **jnopareboateng**(450⭐) Codex→Claude跨工具 | **michaellee8**(120⭐) Codex/Claude/Gemini互调 |
| **Skills** | **FridrichMethod**(3.8K⭐) 2,000+技能apt-get | **agent-skills-hub**(1.6K⭐) 62K项目搜索引擎 | **GarethManning**(2.1K⭐) 教育领域专家 |
| **多Agent编排** | **concilium**(2.4K⭐) 6Agent同行本地面板 | **octogent**(1.3K⭐) 触手模式+文件通信 | **glink-engine**(50⭐) 零依赖黑板模式 |
| **Codex MCP** | **w31r4/codex-mcp**(6.7K⭐) Go单二进制三层沙箱 | **tuannvm**(2.1K⭐) 最可靠桥接 | **xiaolai**(1.8K⭐) 唯一多Agent原生MCP |

**TOP 3 Claude Code 插件生态**（77+市场，1,275+插件）：
| 排名 | 插件 | 安装量 | 核心能力 |
|------|------|--------|---------|
| 1 | **feature-dev** | 89K+ | 7阶段开发生命周期 |
| 2 | **pr-review-toolkit** | — | 并行SubAgent审查大PR |
| 3 | **/code-review** | — | 5并行Sonnet Agent，0-100置信度评分 |
| 4 | **security-guidance** | — | 每次代码变更内联安全审查 |
| 5 | **frontend-design** | — | 4维度设计框架，防AI陈词 |
| 6 | **claude-mem** | 35.9K | 长期记忆(SQLite+Chroma向量) |

**TOP 3 安全钩子**：
| # | 工具 | 核心能力 |
|---|------|---------|
| 1 | **cc-safe-setup** | 30K+下载。8安全钩子。防rm -rf/密钥泄露/破坏性DDL |
| 2 | **karanb192/hooks** | 可配置安全级别(critical/high/strict)。Slack通知 |
| 3 | **Droidzold/hardened** | Bash防火墙。防pipe-to-shell/反向shell |

**TOP 3 Claude↔Codex 互操作**：
| # | 工具 | ⭐ | 核心能力 |
|---|------|-----|---------|
| 1 | **ultracontext** | 213 | 实时上下文同步。"开始于Claude，继续于Codex" |
| 2 | **OpenMOSS/handoff** | 新 | .handoff/目录异步交接。JSONL+原子租赁 |
| 3 | **pilc80/claudex** | 新 | 无API Key的ChatGPT/Codex OAuth Loopback代理 |

### 🔗 衔接 → 阶段⑤

**带走这些**：可运行的 MVP。你知道哪些功能能用了，哪些还有问题。

**在下一阶段**：告诉 Codex "帮我全面测试这个应用"。

> **如果出问题**：MVP 还不能跑？→ 回到阶段④的"出问题"指引。不要带着一个不能跑的 MVP 进入测试。

---

## 阶段⑤：测试与修复（贯穿开发，集中 2-3 天）

### 🚀 Vibe Track

> **核心心法**: 你不是测试工程师。但你会用产品。让 Codex 模拟用户去用，发现问题直接修。

**第一步：让 Codex 自己跑一遍**
```text
用 Playwright 帮我测试这个应用 [URL]。

完整流程：
1. 打开应用
2. 走一遍核心功能：[描述你的核心流程，如"注册→提问→收到回答"]
3. 截图每一步
4. 再走一遍异常流程：空输入、超长输入、特殊字符、网络中断模拟
5. 截图每一步

列出所有发现的问题（按严重程度排），然后逐一修复。
```

**第二步：让不懂你产品的人测试**
```text
现在假设你是一个第一次使用这个产品的新用户。
你不知道任何背景信息。

用 Playwright 打开应用。
尝试凭借直觉完成 [核心任务]。
记录下所有让你困惑的地方——按钮找不到、提示不清楚、操作不流畅。

然后把这些问题修掉。
```

**第三步：修完后复查**
```text
刚才你修了 [N] 个问题。
现在再跑一遍完整的测试流程。
确认所有问题都已修复，没有引入新问题。
截图对比修复前后。
```

**期望产出**：核心流程能正常走通。常见错误场景有友好处理。没有明显的 UI 或交互 bug。

### 🛠️ Pro Track

| 节点 | 方法 | 工具 |
|------|------|------|
| 单元测试 | AI 生成测试用例 | **Vitest**(前端) / **Pytest**(后端) |
| E2E 测试 | 关键路径覆盖 | **Playwright MCP**(34K⭐) + **Skiritai**(418⭐) 30x 加速回放 |
| LLM 评估 | 黄金测试集 + LLM-as-Judge | **Langfuse**(30K⭐) + **Promptfoo**(22.3K⭐) |
| Agent 轨迹测试 | 测试决策过程 | **Agent Eval Harness** + **Understudy**(对trace断言) |
| 对抗测试 | 越狱、注入 | **Promptfoo** + **garak**(NVIDIA) + **AgentSeal**(225+探针) |
| 可复现回放 | Agent→可重放脚本→CI | **es617/claude-replay**(600⭐) + **agent-lens** |

**TOP 3 测试与评估工具**：
| # | 工具 | ⭐ | 核心价值 |
|---|------|-----|---------|
| 1 | **Langfuse** | 30K | OSS 可观测标杆。50M月SDK。Tracing+Prompt+Eval+数据集 |
| 2 | **Promptfoo** | 22.3K | 安全红队+回归。OpenAI/Anthropic使用。2026.3 轨迹断言 |
| 3 | **Understudy** | 新品 | "对trace断言，不对prose断言。"测Agent决策过程 |

### 🔗 衔接 → 阶段⑥

**带走这些**：测试通过的 MVP。已知问题清单（如果有未修复的）。对产品稳定性的信心。

**在下一阶段**：告诉 Codex "帮我部署上线"。

> **如果出问题**：Playwright 测试发现大量错误？→ 把每个错误截图和描述逐个让 Codex 修复。不要一次性修 5 个。一次修 1 个，修完验证，再修下一个。

---

## 阶段⑥：部署上线（1-2天）

### 🚀 Vibe Track

> **核心心法**: 部署就是"给我一个链接"。Codex 帮你搞定剩下的一切。

**Codex 提示词（对话即部署 模式 3）**：
```text
帮我把这个项目部署上线。

前端用 Vercel（免费 Hobby 套餐）。
后端用 Railway（需要的话；纯前端项目不需要后端）。
所有服务都用免费套餐——别用 Pro，MVP 阶段不需要。

部署完成后给我 URL。
然后 Playwright 打开 URL，确认：
1. 页面能正常访问
2. 核心功能正常
3. 没有明显的错误

如果你部署过程中需要 API Key 或环境变量，
列出我需要提供什么以及在哪里获取（给我链接），
我来填。填完之后你继续。
```

**如果你的应用不需要后端（纯静态）**：
```text
帮我把这个项目部署到 Vercel（免费 Hobby 套餐）。
这是个纯前端项目，不需要数据库和后端。
给我 URL。
```

**上线前别忘了这些**（让 Codex 帮你检查）：
```text
在上线前帮我检查这些：
1. 没有硬编码的 API Key 或密码
2. 环境变量已正确配置在 Vercel/Railway 中
3. HTTPS 已启用（Vercel 自动）
4. 移动端也能正常显示

逐项检查，有问题先修。
```

**如果你需要数据库（Supabase）**：
```text
帮我配置 Supabase：
1. 用 Supabase Free 套餐（500MB 够 MVP 用）
2. 创建需要的数据库表
3. 配置 RLS（行级安全）策略——确保用户只能看自己的数据
4. 把 Supabase URL 和 Key 加到环境变量中
部署后 Playwright 确认数据库连接正常。
```

**期望产出**：一个公开可访问的 URL。你的朋友能打开并正常使用。

### 🛠️ Pro Track

| 节点 | 方法 | 工具 |
|------|------|------|
| CI/CD | Push 即部署 + AI 评估门禁 | **GitHub Actions** + Vercel / **Coolify**(57K⭐) 自托管 |
| LLM 可观测性 | 输入/输出/成本/延迟追踪 | **Langfuse**(30K⭐, ClickHouse 收购) + **Arize Phoenix**(10K⭐) |
| 传统监控 | 错误追踪+性能 | **Sentry MCP** + Grafana Cloud AI |
| 成本管控 | Token 用量告警、模型路由降级 | **LiteLLM**(52K⭐) + **OpenMeter**(2.1K⭐) |
| 安全 | API 限流、密钥、内容审核 | **Cloudflare** + **Infisical**(20K⭐, PAM+KMS) + MS Presidio |
| DB 分支 | 开发/测试环境隔离 | **Neon**(Databricks 收购) COW DB 分支 |
| 沙箱 | AI 代码安全执行 | **Daytona**(71K⭐, 90ms 冷启动) |

**⚠️ Helicone 已于 2026.3 被 Mintlify 收购进入维护模式——立即迁移到 Langfuse。**

**TOP 3 部署运维工具**：
| # | 工具 | ⭐ | 核心价值 |
|---|------|-----|---------|
| 1 | **Google MCP Toolbox** | 15.5K | 20+ DB MCP。Go 实现+安全拦截+OTel |
| 2 | **AI Gateway** | 新 | 零代码变更反向代理。4层缓存。40-70%成本削减 |
| 3 | **ContextCache** | 新 | 首个多轮对话语义缓存。+10.9%精度 vs GPTCache |

**五种原型的部署差异**：
| 原型 | 部署方案 | 关键关注点 |
|------|---------|-----------|
| A 对话 | Vercel + Supabase + Langfuse | 轻量，快速上线 |
| B 内容 | Railway + GPU集群(Modal) + S3 | GPU 成本控制 |
| C 分析 | Coolify 自托管 + Bytebase | 数据不出企业 |
| D 行业 | Coolify + AgentOps + AgentSeal | 最高安全等级 |
| E 工具 | Vercel + Sandbox集群(Daytona) | 沙箱隔离 |

**安全上线检查清单**: SAST扫描 → CSRF token → RLS验证 → 密钥扫描 → CSP/HSTS → 速率限制 → 渗透测试

### 🔗 衔接 → 阶段⑦

**带走这些**：线上URL。你的产品开始被人用了。

**在下一阶段**：告诉 Codex "帮我加上用户分析（PostHog）"。

> **如果出问题**：部署后 URL 打不开？→ 让 Codex 检查 Vercel/Railway 的部署日志，找到具体错误。90% 的部署失败是环境变量没配或构建命令错误。

---

## 阶段⑦：运营与增长（持续）

### 🚀 Vibe Track

> **核心心法**: 你不需要盯着数据看。让 Codex 帮你读数据，告诉你该关注什么。

**第一步：加上分析（模式 4 的基础）**
```text
帮我的应用加上 PostHog 分析。
追踪以下事件：
- 用户注册
- 首次使用核心功能
- 深度使用（用了超过 5 次）
- 用户流失（注册后 3 天没回来）

部署后验证 PostHog 能正常收到数据。
```

**第二步：让 Codex 帮你读数据（模式 4）**
```text
读取 PostHog 最近 7 天的数据。
告诉我：
1. 有多少人用了？
2. 他们卡在哪里？（哪个步骤流失最多）
3. 我应该优先优化什么？（只给 Top 2）
```

**第三步：做一个简单的落地页（模式 1）**
```text
我要为产品做一个正式的落地页。
参考我喜欢的这个产品：[URL]。

用相同的设计风格，但换成我的内容：
- Hero 区：一句话价值主张
- 3 个核心功能卡片
- 用户反馈区（如果有早期用户的好评）
- 行动按钮

用 Vercel（免费 Hobby 套餐）部署，给我 URL。
```

**期望产出**：你开始看到产品的使用数据了。你知道用户在哪些环节流失了。

### 🛠️ Pro Track

| 节点 | 方法 | 工具 |
|------|------|------|
| 用户行为分析 | 漏斗、留存 | **PostHog**(25K⭐) + Langfuse Analytics |
| A/B 测试 | Prompt 级别 A/B | **TensorZero**(11.7K⭐) 自适应A/B+Autopilot 或 **GrowthBook**(7.8K⭐) OSS 特性标记 |
| 用户反馈闭环 | 点赞/点踩+隐式信号 | **自建 Lane B** + Langfuse |
| 知识健康监控 | 陈旧/矛盾/盲区 | Lane C triggers + Truva(去重+矛盾检测) |

**TOP 3 运营增长工具**：
| # | 工具 | ⭐ | 核心价值 |
|---|------|-----|---------|
| 1 | **TensorZero** | 11.7K | Rust LLMOps。自适应A/B+Autopilot自动收敛胜出版本。+612%数据提取 |
| 2 | **GrowthBook** | 7.8K | OSS 特性标记+A/B。100B+标记/天。Warehouse-native |
| 3 | **Shipixen** | $249/年 | Next.js+63主题+300UI示例+37落地页组件。一键Vercel |

**⚠️ 市场缺口**: 零个 AI 站点生成器内建 A/B 测试或分析。实践：Shipixen 生成 → GrowthBook 做 A/B → Langfuse 做 LLM 成本。

### 🔗 衔接 → 阶段⑧

**带走这些**：用户数据 + 用户反馈 + 你知道产品哪里需要改进。

**在下一阶段**：告诉 Codex "基于用户反馈，帮我优化产品"。

> **如果出问题**：PostHog 没数据？→ 检查：(1) PostHog 代码是否正确集成？(2) 环境变量是否正确？让 Codex 逐一检查。通常问题是 PostHog snippet 没正确插入到 `<head>` 中。

---

## 阶段⑧：持续进化（AI产品的灵魂）

### 🚀 Vibe Track

> **核心心法**: 你不需要研究"自进化"理论。你只需要每周看一次反馈，告诉 Codex 修什么。

**每周例行操作**：
```text
帮我做本周的产品健康检查：

1. 读取最近一周的用户反馈（在 PostHog 或 docs/feedback/ 中）
2. 总结 Top 3 用户抱怨的问题
3. 对排名第一的问题，提出修改方案
4. 我确认方案 → 你修改代码 → Playwright 验证
5. 对其他问题，记录到 docs/backlog.md
```

**修复后的验证**：
```text
刚才你修了 [问题描述]。
现在 Playwright 测试修改后的功能。
确认：
1. 原问题已修复
2. 没有引入新问题
3. 之前正常的功能仍然正常
```

**期望产出**：你的产品每周都比上周好一点。用户的问题被持续修复。

### 🛠️ Pro Track

| 节点 | 方法 | 工具 |
|------|------|------|
| 数据回流 | 点踩→坏案例库 | Langfuse(自动采集) + GPTCache(8K⭐) |
| Prompt 自动优化 | 评估集自动迭代 | **DSPy(35K⭐)** + GEPA(ICLR 2026 Oral) |
| 知识自愈 | 陈旧/矛盾自动检测 | Zep Graphiti(26.3K⭐, MemStrata 97%) / LightRAG(36K⭐) |
| 飞轮刹车 | 安全指标倒退→ block | **Evolution Constitution** + **Lane C Triggers** |
| 多 Agent 进化 | 协作效能优化 | AgentOps(5.6K⭐) + Understudy |

**TOP 3 自进化工具**：
| # | 工具 | ⭐ | 核心价值 |
|---|------|-----|---------|
| 1 | **DSPy + GEPA** | 35K | ICLR 2026 Oral。Dropbox 45% NMSE 降低。比 RL 少 35x Rollout |
| 2 | **Zep Graphiti** | 26.3K | 双时态 KG。MemStrata 97% 陈旧检测。$25/月含图 |
| 3 | **LightRAG** | 36K | 增量更新。99.98% token 节省 vs MS GraphRAG。5 查询模式 |

**五种原型的自进化差异**：
| 原型 | 进化重点 | 进化周期 |
|------|---------|---------|
| A 对话 | Prompt 优化 + RAG 索引优化 + 知识自愈 | 月循环 |
| B 内容 | 模型 Fine-tuning/LoRA + 用户偏好回流 | 季度循环 |
| C 分析 | SQL 准确率提升 + Schema 自适应 | 持续监控 |
| D 行业 | 协作效能 + 违抗检测 + 合规数据回流 | 持续监控 |
| E 工具 | SWE-bench 持续评估 + MCP 生态兼容 | 模型升级时 |

---

## 五种技术原型的完整对照

| | 原型A 对话/Agent 🟢 | 原型B 内容生成 🟢 | 原型C 数据分析 🟡 | 原型D 行业Agent 🔴 | 原型E 开发工具 🟢 |
|---|---|---|---|---|---|
| **Agent框架** | Mastra(TS)/LangGraph(Py) | FastAPI+Celery | LangGraph(Py) | LangGraph+Temporal | Rust/Go+MCP |
| **核心引擎** | LLM+RAG+Tools | LLM+Diffusion+TTS | Text-to-SQL+Viz | 领域LLM+KG+合规 | Code LLM+MCP |
| **数据库** | Supabase/pgvector | S3/MinIO | Qdrant+企业DB | Neo4j+Qdrant | Git/Sandbox |
| **记忆** | Zep Graphiti($25) | — | Zep Graphiti | Mem0+Hindsight | — |
| **评估重点** | LLM-as-Judge | 人类偏好+A/B | SQL准确率 | 合规+业务指标 | SWE-bench Pro |
| **安全等级** | 中 | 低 | 高(只读DB) | 最高(合规) | 中 |
| **部署** | Vercel+Coolify | Railway+GPU集群 | Coolify自托管 | Coolify自托管 | Vercel+Sandbox |
| **流式** | 必需 | 可选 | 可选 | 必需 | 必需 |
| **成熟度** | 🟢 | 🟢 | 🟡 | 🔴 | 🟢 |
| **典型产品** | ChatGPT/Perplexity | Midjourney/Jasper | ThoughtSpot | Harvey/医渡云 | Copilot/Codex |

---

## 全流程工具速查（2026-07）

| 环节 | Vibe 首选 | Pro 首选 | 备选 |
|------|----------|---------|------|
| 研究 | Perplexity + Firecrawl MCP | SpecWright + claude-code-discover | doit |
| 原型 | Codex + Appshot + Dembrandt | Open Design(60K⭐) + screenshot-to-code(73K⭐) | Onlook(26K⭐) |
| 设计规范 | Design Token → Codex | GitHub Spec Kit(110K⭐) + AgentCanvas | loom-spec |
| 开发(A) | Codex + Mastra(TS) | Vercel AI SDK(25K⭐) | LangGraph(35K⭐) |
| 开发(B) | Codex + FastAPI + Modal | Replicate | — |
| 开发(C) | Codex + dlt + Vanna.ai | Pathway(63K⭐) | — |
| 开发(D) | Codex + LangGraph + Temporal | CrewAI(54K⭐) | — |
| 开发(E) | Codex + Rust/Go + MCP | Daytona(71K⭐) | — |
| 部署 | Vercel Hobby（免费） | Coolify(57K⭐)【Pro】 | Railway |
| 分析 | PostHog(25K⭐) + Codex 读报告 | Langfuse(30K⭐) + TensorZero(11.7K⭐) | GrowthBook(7.8K⭐) |
| 测试 | Playwright MCP + Codex 自己修 | Promptfoo(22.3K⭐) + Understudy | Agent Eval Harness |

---

## 三条铁律（无论 Vibe 还是 Pro）

1. **先跑通再打磨**：先做一个能用的 MVP。不要一上来就追求完美。MVP 出来了，后面全是 Codex 帮你改。

2. **每次都让 Codex 自己检查**：做完任何修改，加上一句"用 Playwright 打开看一眼"。这是 Vibe coder 的质量保障。

3. **反馈就是燃料**：你的用户说的每一句话——喜欢的、不喜欢的、困惑的——都是产品变好的燃料。每周花 10 分钟让 Codex 读反馈、排优先级、修排名第一的。

---

*本路线图每季度更新。Vibe Track 的核心设计原则：任何人只要能对着 Codex 打字，就能做出 AI 产品。*
*Pro Track 深度工具分析见 `audit/10-Playbook模块工具推荐目录-v2.6.md` 和 `audit/11-AI产品商业分类体系-完整调研.md`。*
*产品工厂操作系统见 `AI产品工厂操作系统Playbook-v2.md`。*
