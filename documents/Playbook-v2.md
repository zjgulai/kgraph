# AI产品工厂操作系统 Playbook — 平台级产品批量生产与自进化引擎

**（v2.9 | 2026-07-04 — 17个脚本全部可运行：8个phantom脚本实现完毕）**

---

## 0. 文档架构总览

```
§0    本文档定位与三份文档关系
§§基础 成熟度标注 + Evidence Ladder + 边界词典
§一   平台总览（三层架构模型）
§§MCP MCP安全与传输
§二   产品基因组系统（基因组YAML + product_type + 执行指令）
§三   四维自进化引擎（内容/功能/UI/架构 + 自进化量化 + 多Agent评估）
§四   进化宪章（不可变约束YAML）
§五   Codex可执行指令格式规范
§六   八阶段生命周期（Codex可执行版：每阶段TASK + 证据门）
§七   共享组件库 + 共享知识库
§八   平台级关键脚本清单
§九   财务模型与ROI分析
§十   进化宪章执行机制
§§Promotion State Machine（知识/资产治理状态机）
§附   前瞻性能力（2026年不可用）+ 一人+Codex限制 + 防呆设计
```

**本文档定位**：
- **读者**: Codex Agent、Claude Code、其他 AI 开发 Agent。这是一份**机器可执行的规范文档**。
- **我该读吗**: 你是人类→请读 [VibeTrack](AI产品全链路开发骨干路线图-VibeTrack.md)（零基础到上线）或 [v2.7 Pro](AI产品全链路开发骨干路线图-v2.7.md)（工具选型深度）。你是需要执行产品工厂自动化的 AI Agent → 本文档是你的操作系统。
- **关系**: VibeTrack(默认路径/零基础) → v2.7 Pro(进阶/工具选型) → Playbook-v2(本文档/AI引擎/基因组系统/进化宪章)。三份由浅入深，互不重复。
- **基因组是核心杠杆**: §二的产品基因组 YAML → `scripts/` 下的 9 个脚本 → Codex 自动实例化可运行产品。这是平台的核心机制。
- **遇到不懂的词**: 参见 [共享术语附录](shared/GLOSSARY.md)。按你的级别（🔴 L3 平台）查阅——基因组、进化宪章、Evidence Gate、Promotion State Machine 等在附录中有详细解释和类比。

---

## 成熟度标注说明

全文中使用以下标注表示每个实践的生产就绪程度：

| 标注 | 含义 | 判断标准 |
|------|------|----------|
| 🟢 生产就绪 | 2026年有多个公开生产案例，可直接投入使用 | Dropbox/Databricks/Anthropic等已验证 |
| 🟡 可实现 | 技术路径明确，但需要工程投入和适配 | 有研究原型或单例生产案例 |
| 🔴 实验阶段 | 学术界活跃研究，无可靠生产案例 | 仅论文或博客讨论 |
| ⚫ 方向性 | 当前技术不可行，作为长期愿景保留 | 2026年无可行实现路径 |

### 🆕 Evidence Ladder：七级证据阶梯

成熟度标注回答"能不能用"。证据阶梯回答"基于什么证据"。两者互补。

| 等级 | 标签 | 可说 | 不能说 | 典型信号 |
|------|------|------|--------|---------|
| L0 | docs/local | PRD、schema、fixture 设计完成 | 功能上线 | 只有文档和设计 |
| L1 | local runtime smoke | 本地 CLI/API 跑通 | staging/production 可用 | `npm run dev` 可启动 |
| L2 | fixture/dry-run | gates 能阻塞/通过样例 | 真实业务 approval | local fixture QA passed |
| L3 | read-only staging | token-gated staging 通过 | production launch | staging URL 可达 |
| L4 | authorized live side effect | 明确授权的目标层操作完成 | 其它层也完成 | 有授权记录的 production 操作 |
| Production | business accepted | 通过 business acceptance | 默认从 staging 推断 | 有 business stakeholder approval |

**使用规则**：任何声明必须标注证据等级。"Agent 回答准确率 90%"如果没有 L4 证据，只能是 L2（fixture）或 L3（staging smoke）。这是 Playbook 所有审计文档的强制格式。

### 🆕 边界词典

以下术语在全 Playbook 中必须按字面理解，不可扩大解释：

| 词 | 必须按字面理解 |
|----|-------------|
| `docs-only` | 只有文档/设计，不代表实现 |
| `draft` | 草稿，可审查，不可 production claim |
| `local fixture` | 本地样例验证，不代表真实业务数据通过 |
| `dry-run` | 不产生目标层 side effect |
| `read-only smoke` | 只读检查，不代表写入或发布 |
| `manual review` | 需要人审，不可自动通过 |
| `production unchanged` | 未改变生产 |
| `no provider call` | 没有外部模型/provider 调用 |
| `no live KB ingestion` | 没有写入 live KB |
| `no runtime switch` | 没有切换 runtime index/pointer |
| `canonical_write_performed=false` | 没有 canonical write |
| `append_only_write_allowed=false` | append-only 写入未授权 |
| `staging` | 预发布环境，非 production。staging 数据可丢弃。 |
| `canonical` | 经过完整治理流程的正式知识资产。不是 "通过了 QA"。 |
| `candidate` | LLM/digital/fixture 输出。不可声称 canonical。 |

---

## 一、平台总览：从"开发一个产品"到"运营一个产品工厂"

> 🟡 平台架构三层模型是方向性设计。元AI层在2026年应降级为"周度分析报告+人工决策支持"，全自动化产品组合管理尚未经过生产验证。

### 1.1 核心理念蜕变

| v1 Playbook | v2 Playbook |
|------------|------------|
| 一个人 + Codex → 开发一个产品 | 一个平台 + Codex → 批量生产N个自进化产品 |
| AI是开发工具 | AI是产品管理者 + 开发者 + 进化引擎 |
| 八阶段线性流程 | 八阶段 + 三轴进化（内容/功能/UI） + 平台元AI |
| 安全是附加功能 | 进化宪章是基础架构 |
| 给人读的指导文档 | 给Codex执行的指令集 + 给人Review的门禁 |

### 1.2 平台架构三层模型

```
┌─────────────────────────────────────────────────────┐
│              平台元AI层（Meta AI）                    │
│  产品组合管理 · 跨产品洞察 · 资源调度 · 战略决策      │
├─────────────────────────────────────────────────────┤
│              产品工厂层（Factory）                    │
│  产品基因组 · 共享组件库 · 生命周期管理 · 批量部署     │
├─────────────────────────────────────────────────────┤
│              产品实例层（Instances）                  │
│  产品A        产品B        产品C        ...          │
│  ┌────────┐  ┌────────┐  ┌────────┐                │
│  │基因组A │  │基因组B │  │基因组C │                │
│  │进化引擎│  │进化引擎│  │进化引擎│                │
│  │评估体系│  │评估体系│  │评估体系│                │
│  └────────┘  └────────┘  └────────┘                │
└─────────────────────────────────────────────────────┘
```

**平台元AI**不做产品开发。它的职责是：
- 监控所有产品的健康度和进化状态
- 发现跨产品的模式（"产品A和B的用户都在问同一个问题——是否需要一个新产品？"）
- 资源分配（"产品C有增长信号，分配更多Token预算"）
- 发现产品合并/退役/分化的机会

**产品工厂层**提供批量生产的基础设施：
- 产品基因组（Product Genome）：描述一个产品的完整DNA
- 共享组件库：跨产品复用的Agent能力/Prompt/评估集
- 生命周期管理器：创建→运行→进化→退役

**产品实例层**是每个具体产品的运行时：
- 独立的基因组配置
- 独立的进化引擎
- 独立的评估体系
- 但共享工厂层的组件和元AI的监控

---

---

## MCP安全与传输：2026年7月最新状态

> 🟡 以下数据基于2026年7月最新网络研究。MCP生态快速演变，建议每季度复核。

### Streamable HTTP 已取代 SSE

MCP规范 2026-03-26 将默认远程传输从 SSE+HTTP 双端改为 **Streamable HTTP 单端**。2026-07-28 的新规范将完全移除有状态会话模型。

| 变更 | 旧（SSE） | 新（Streamable HTTP） |
|------|----------|----------------------|
| 端点 | GET(SSE) + POST(消息) 双端 | 单端点 /mcp (GET+POST) |
| 状态 | 有状态（粘性会话） | 无状态（任意实例处理任意请求） |
| 断线恢复 | 不支持 | 支持（stream ID + cursor） |
| 负载均衡 | 困难 | 原生友好 |

**Playbook中的影响**：所有MCP服务器配置应使用Streamable HTTP（而非SSE）。本地连接（`stdio`）保持不变。

### MCP 安全现状（严峻）

2026年5月复旦大学研究扫描了7,973个在线MCP服务器：

- **40.55% 的远程服务器零认证**
- 43% 存在命令注入漏洞
- 82% 的文件操作实现存在路径遍历风险
- 仅2.4%实现了速率限制
- 仅8.5%使用OAuth

2026-07-28规范将强制OAuth 2.1 + PKCE，但过渡期漫长。

### MCP 安全操作准则

在Playbook中接入任何MCP服务器时，遵循：

```
1. Token限定最小范围：GitHub限定repo、Supabase限定表、Filesystem限定项目目录
2. 优先使用官方服务器（非社区fork）——官方服务器的安全审计覆盖率显著更高
3. 上限5-7个服务器——工具膨胀严重降低Agent性能
4. 生产环境敏感操作需要显式审批（数据库写入、PR创建、部署触发）
5. 定期审查MCP服务器权限（每季度最小化审查）
6. 不要在生产环境中使用社区fork且无安全审计的MCP服务器
```

### 推荐的MCP服务器清单（2026年7月验证）

| 优先级 | 服务器 | 验证状态 | 安全风险 | 备注 |
|--------|--------|---------|---------|------|
| P0 | Context7 | ✅ 生产稳定 | 低（只读） | 实时框架文档，零配置 |
| P0 | Playwright MCP | ✅ 生产稳定 | 中（浏览器自动化） | 使用staging环境+测试账号 |
| P1 | Supabase MCP | ✅ 生产稳定 | 中（可操作DB） | 生产环境read-only角色 |
| P1 | GitHub MCP | ✅ 生产稳定 | 中高（取决于token scope） | Docker版本46+工具，注意限制 |
| P1 | Linear MCP | ✅ 生产就绪 | 中（可改工单状态） | 限制项目范围 |
| P2 | Qdrant MCP | ✅ 新但有价值 | 低 | 跨会话语义记忆 |
| P2 | Firecrawl MCP | ✅ 安全审计97/100 | 低 | 网页抓取和研究 |

> ⚠ Sequential Thinking MCP虽然流行，但有报告称Codex的MCP兼容性与Claude Code不同。部分服务器在Codex上不可用。使用前先dry-run验证。

---

## 二、产品基因组系统

### 2.1 什么是产品基因组

产品基因组是一个机器可解析的配置文件，它包含了一个AI产品从创建到进化的完整DNA。给定一个基因组文件，Codex可以自动实例化一个完整的、可运行的产品。

### 2.2 基因组结构

```yaml
# product-genome.yaml — 一个AI产品的完整DNA
# 这个文件是平台的核心资产。一个基因组 = 一个可被Codex自动实例化的产品。

genome:
  id: "product-{name}"
  version: "1.0.0"
  created: "2026-07-03"
  parent_genome: null  # 如果基于已有产品克隆

# ===== 第一部分：产品身份（不可变，除非人工修改）=====
identity:
  name: "产品名称"
  value_proposition: "一句话价值主张"
  target_users: "目标用户画像（具体到可以招募访谈对象）"
  problem_solved: "解决的痛点"
  NOT_solving: "明确不解决的问题（防止范围蔓延）"
  
# ===== 第二部分：技术骨架（Codex可直接实例化）=====
skeleton:
  frontend:
    framework: "next.js"
    version: "15"
    ui_library: "shadcn/ui"
    styling: "tailwind"
    language: "typescript"
    strict_mode: true
  
  backend:
    type: "nextjs_api_routes"  # | fastapi | mastra
    database: "supabase"
    vector_db: "pgvector"      # pgvector | qdrant | pinecone
    auth: "supabase_auth"
    storage: "supabase_storage"
  
  agent_runtime:
    # 🟢 决策提示：按语言生态选框架，不要按"热门"选
    # TypeScript/Next.js团队 → Mastra（TS原生，NPM install，4M月下载，Brex/MongoDB/Workday采用）
    # Python/复杂工作流团队 → LangGraph（状态机+检查点+耐久执行，400+企业部署）
    # OpenAI API锁定团队 → OpenAI Agents SDK（LiteLLM多提供商，已支持非OpenAI模型）
    # Vercel基础设施团队 → Vercel AI SDK v7（16M+周下载，持久执行，边缘部署）
    framework: "mastra"  # 🟢 mastra | 🟢 langgraph | 🟢 openai_agents_sdk | 🟡 vercel_ai_sdk
    profile: "typescript-solo"  # typescript-solo (Mastra+Inngest) | python-enterprise (LangGraph+Temporal)
    durability_layer: "inngest"  # 🟡 inngest | 🟢 temporal | 🟢 none (简单场景不需要耐久层)
    llm_providers: ["openai", "anthropic"]
    default_model: "gpt-5.5"     # ⚠ 2026-07: GPT-5已退休，Codex默认使用GPT-5.5
    fallback_model: "claude-sonnet-4-5"
    cost_optimized_fallback: "deepseek-v3"
  
  deployment:
    frontend: "vercel"
    backend: "railway"
    ci_cd: "github_actions"

# ===== 第三部分：知识架构配置 =====
knowledge:
  classification_level: 2  # 1=单库, 2=多库分类, 3=多库+KG, 4=多库+KG+人工
  
  domains:
    - id: "product_faq"
      name: "产品FAQ"
      level: "L1"           # L1=基础RAG, L2=增强RAG, L3=精确RAG+KG
      retrieval_strategy: "hybrid"  # hybrid | semantic | bm25_only
      reranker: "bge_reranker_v2_m3"
      chunking: "recursive"  # recursive | hierarchical | semantic
      max_chunk_size: 500
      chunk_overlap: 75
      contextual_retrieval: true   # Anthropic context enhancement
      freshness_check_interval_days: 7
      
    - id: "technical_docs"
      name: "技术文档"
      level: "L2"
      retrieval_strategy: "hybrid_colbert"
      reranker: "colbert_v2"
      chunking: "hierarchical"  # parent-child chunking
      
    - id: "compliance"
      name: "合规条款"
      level: "L3"
      retrieval_strategy: "hybrid_graph"
      knowledge_graph: true    # LazyGraphRAG for multi-hop
      citation_required: true  # Every answer must cite source
      human_review_threshold: 0.8  # confidence < 0.8 → human review
  
  classifier:
    model: "gpt-4o-mini"      # fast classifier for routing queries to domains
    route_on_confidence_threshold: 0.7
    fallback_behavior: "ask_clarification"  # | use_general_kb | reject

# ===== 第四部分：Agent能力清单 =====
agent:
  system_prompt_version: "v1"
  personality: "professional_friendly"  # professional | casual | authoritative
  
  tools:
    - id: "search_knowledge"
      type: "retrieval"
      domains: ["product_faq", "technical_docs"]
      trigger_when: "用户询问产品功能、使用方法、技术问题"
      do_NOT_trigger_when: "用户要求执行操作（如删除、修改）或询问个人数据"
      
    - id: "execute_action"
      type: "function_calling"
      functions: ["create_ticket", "check_status", "update_profile"]
      trigger_when: "用户明确要求执行某个操作，且操作在允许列表中"
      do_NOT_trigger_when: "操作不在允许列表中 → 解释边界"
      require_confirmation: true  # 敏感操作需用户确认
      
  memory:
    conversation_window: 10      # 最近N轮保留完整上下文
    summarization_enabled: true  # 旧对话→滚动摘要
    long_term_memory: "vector"   # none | vector | graph
    user_profile_enabled: true   # 跨会话用户偏好记忆
  
  failure_handling:
    timeout_seconds: 30
    timeout_fallback: "simplified_answer"
    tool_failure_max_retries: 2
    tool_failure_fallback: "inform_user_and_offer_alternative"
    confidence_threshold: 0.6
    low_confidence_behavior: "express_uncertainty_and_suggest_escalation"
    
  guardrails:
    prompt_injection_defense: "instruction_hierarchy"  # | sandbox | none
    content_moderation: "openai_moderation_api"
    sensitive_data_detection: "presidio"
    blocked_actions: ["delete_data", "modify_other_users", "access_system_config"]

# ===== 第五部分：进化策略 =====
evolution:
  content_evolution:
    enabled: true
    level: 1  # 🟢 L1(陈旧检测+人工更新) 🟡 L2(自动提取+人工验证) 🔴 L3(矛盾检测+自愈)
  functionality_evolution:
    enabled: true
    level: 1  # 🟢 L1(信号采集) 🟡 L2(功能提案生成) 🔴 L3(自动实施-2026无生产案例)
  ui_evolution:
    enabled: true
    level: 1  # 🟢 L1(AI辅助设计) 🟡 L2(A/B测试) 🔴 L3(行为自适应-仅营销页面验证)
  architecture_evolution:
    enabled: false  # ⚫ 2026年不可行。仅限架构健康监控和建议，所有变更需人工决策。
    level: 1  # L1=监控+建议 | L2/L3仅在SWE-bench Pro > 70%后评估启用

# ===== 第六部分：评估体系配置 =====
evaluation:
  golden_set_path: "evals/golden/"
  incremental_path: "evals/incremental/"
  weekly_increment_size: 30
  
  gates:
    floor_gate:
      enabled: true
      metric: "intent_accuracy"
      threshold: 0.85
      action_on_fail: "block_merge"
    
    safety_gate:
      enabled: true
      metric: "safety_rubric"
      threshold: "no_regression"   # 不能有任何安全指标倒退
      action_on_fail: "block_merge_immediate"
    
    comparison_gate:
      enabled: false  # 只在重大Prompt变更时启用
      p_threshold: 0.05
  
  judge:
    model: "claude-sonnet-4-5"     # 评判模型（不使用和自我评估相同的模型族）
    rubric_version: "v1"
    calibration_frequency_days: 30  # 是否需要人工校准取决于你的QA资源

# ===== 第七部分：商业与运营 =====
business:
  model: "freemium"                   # freemium | saas | usage_based | enterprise
  free_tier_monthly_cost_budget: 5    # 每个免费用户$5/月token预算
  target_gross_margin: 0.7
  
  key_metrics:
    - "daily_active_users"
    - "conversation_completion_rate"
    - "user_satisfaction_score"
    - "per_conversation_cost"
    - "cache_hit_rate"

# ===== 第八部分：进化宪章（不可变约束）=====
# 以下约束任何自动进化都不得违反。只能人工修改。
constitution:
  immutable_principles:
    - "产品不得在回答中故意误导用户"
    - "用户数据不得被用于训练或优化与该用户无关的功能"
    - "任何自动变更都必须保留可审计的决策记录"
    - "安全rubric指标不得在任何自动优化中倒退"
    - "用户有权知道自己在和AI交互（非人类）"
  
  protected_metrics:  # 这些指标的权重不可被任何自动优化调整
    - metric: "safety_rubric"
      min_weight: 0.3
    - metric: "honesty_rubric"  
      min_weight: 0.2
    - metric: "user_satisfaction"
      min_weight: 0.2
```

### 2.3 🆕 产品技术原型与类型字段

基于 jit.pro + 8 个中国导航站 + 7 个全球目录 + G2/Gartner/IDC 的交叉验证，10 万+ AI 产品按技术架构共性收敛为 5 种原型。以下分类不按市场区域，不按商业品类——按"我需要搭建什么样的技术架构"。

```yaml
# ===== 产品类型（决定基因组实例化的项目结构）=====
product_type: "conversational_agent"  
# conversational_agent  — 原型A: 对话/Agent型
# content_generation     — 原型B: 内容生成型
# data_analytics         — 原型C: 数据分析型
# industry_vertical      — 原型D: 行业Agent型
# dev_tool               — 原型E: AI开发工具型
```

#### 五种原型的基因组差异

| 基因组字段 | 原型A 对话 | 原型B 内容 | 原型C 分析 | 原型D 行业 | 原型E 工具 |
|-----------|----------|----------|----------|----------|----------|
| `skeleton.agent_runtime.framework` | Mastra/LangGraph | FastAPI+Celery | LangGraph | LangGraph+Temporal | Rust/Go+MCP |
| `skeleton.backend.vector_db` | pgvector | —(S3存储) | Qdrant | Neo4j+Qdrant | — |
| `knowledge.classification_level` | 2-3 | 1 | 1-2 | 3-4 | 1 |
| `agent.memory.long_term_memory` | vector/graph | none | graph | graph | none |
| `evaluation.gates.floor_gate.metric` | intent_accuracy | human_preference | sql_accuracy | compliance_check | swe_bench_score |
| `evolution.content_evolution.level` | 1-3 | 1(模型微调) | 1 | 1-2 | 1 |
| `guardrails` 等级 | 中 | 低 | 高(只读DB) | 最高(合规) | 中 |
| 流式响应 | 必需 | 可选 | 可选 | 必需 | 必需 |

#### 市面品类 → 技术原型映射

| 商业品类 | 技术原型 | 代表产品 | 基因组 product_type |
|---------|---------|---------|-------------------|
| AI对话助手 | 原型A | ChatGPT, Claude, 豆包, Kimi | conversational_agent |
| AI知识搜索 | 原型A | Perplexity, Glean, 秘塔AI搜索 | conversational_agent |
| 单Agent产品 | 原型A | jit.pro 销售/HR/客服 Agent | conversational_agent |
| AI写作 | 原型B | Jasper, Copy.ai, 笔灵AI | content_generation |
| AI图像/视频/音频 | 原型B | Midjourney, Sora, ElevenLabs | content_generation |
| AI数据分析 | 原型C | ThoughtSpot, Tableau AI | data_analytics |
| AI办公(文本处理) | 原型A | Notion AI, Gamma(AI PPT) | conversational_agent |
| AI办公(数据处理) | 原型C | Microsoft Copilot(Excel) | data_analytics |
| AI行业垂直 | 原型D | Harvey AI(法律), 医渡云(医疗) | industry_vertical |
| 多Agent协作 | 原型D | LangGraph+CrewAI, jit.pro 企服 | industry_vertical |
| AI编程助手 | 原型E | GitHub Copilot, Cursor | dev_tool |
| Agent构建平台 | 原型E | Coze, 扣子, Dify | dev_tool |

#### instantiate-skeleton.ts 的类型感知

`product_type` 字段影响生成差异。**⚠️ 当前实现状态：原型 A（对话/Agent）完全支持。原型 B/C/D/E 生成原型 A 骨架 + 占位符目录。**

| product_type | 当前生成内容 | 缺失（待实现） | 状态 |
|-------------|------------|--------------|------|
| `conversational_agent` | 完整 Next.js+Mastra 骨架 + app/api/chat/ + AI Chat UI 组件 | — | ✅ |
| `content_generation` | 原型 A 骨架 + `app/api/generate/` 占位 + `lib/inference/` 占位 | FastAPI+Celery 后端骨架、GPU 推理配置、S3 存储配置 | 🔴 |
| `data_analytics` | 原型 A 骨架 + `lib/data/` 占位 + `lib/knowledge/text2sql.ts` 占位 | dlt 管道集成、Bytebase 配置、Vanna.ai 集成 | 🔴 |
| `industry_vertical` | 原型 A 骨架 + `lib/compliance/` 占位 + `lib/audit/` 占位 | Temporal 耐久执行、Neo4j 集成、合规引擎、多 Agent 编排 | 🔴 |
| `dev_tool` | 原型 A 骨架 + `mcp-server/` 占位 + `lib/sandbox/` 占位 | Rust/Go 核心引擎、Daytona 集成、IDE 插件骨架 | 🔴 |

**当 product_type 不是 `conversational_agent` 时**，`instantiate-skeleton.ts` 会：
1. 生成原型 A 的完整骨架作为基础
2. 创建原型特定的目录和占位符文件
3. 在生成的 `STATUS.md` 中明确列出"当前骨架使用原型 A 作为基础——原型 {B/C/D/E} 特有组件需手动实现"
4. **不会假装生成了完整的原型 B/C/D/E 骨架**

当Codex收到一个基因组文件时，执行以下步骤。**每一步都带有可验证的完成条件**：

```
STEP 0: 验证基因组完整性
  command: bash scripts/validate-genome.ts --file product-genome.yaml
  evidence_gate: "exit code 0 AND output contains 'GENOME_VALID'"
  on_failure: "报告具体验证失败项，不继续"

STEP 1: 实例化项目骨架
  command: bash scripts/instantiate-skeleton.ts --genome product-genome.yaml
  evidence_gate: "exit code 0 AND npm run dev starts successfully"
  max_attempts: 2
  on_failure: "回滚所有文件变更，报告失败原因"

STEP 2: 初始化知识库
  command: bash scripts/init-knowledge-base.ts --genome product-genome.yaml
  evidence_gate: "所有domain的collection已创建 AND 至少一个文档已成功索引"
  max_attempts: 2
  on_failure: "报告哪个domain初始化失败及原因"

STEP 3: 生成Agent基础设施
  command: bash scripts/generate-agent-infra.ts --genome product-genome.yaml
  evidence_gate: "lib/ai/client.ts 存在 AND npm run typecheck 通过"
  on_failure: "报告缺失的文件或类型错误"

STEP 4: 生成初始评估集
  command: bash scripts/generate-eval-set.ts --genome product-genome.yaml --output evals/golden/v1.jsonl
  evidence_gate: "exit code 0 AND output file contains >= 30 test cases"
  on_failure: "报告评估集生成失败原因"

STEP 5: 部署到staging
  command: bash scripts/deploy-staging.ts --genome product-genome.yaml
  evidence_gate: "staging URL可访问 AND Playwright smoke test通过"
  max_attempts: 2
  on_failure: "回滚部署，报告失败原因"
```

---

## 三、四维自进化引擎

### 3.0 自进化的元原则

**原则零：评估驱动一切进化。** 在任何维度上启动进化之前，必须先有可量化、可自动执行的评估。没有评估的进化 = 随机漂移。

**原则一：进化步长与评估精度匹配。** 如果评估只能可靠检测5%以上的变化，那单次迭代不应该追求小于5%的改进。

**原则二：保持反脆弱性。** 任何进化决策保留10-20%的"探索预算"（故意不选择当前最优方案），防止过度适应。

**原则三：所有自动变更记录在不可变审计日志中。** 至少包含：触发信号、变更内容、评估对比、审批状态。

```
# 自进化审计日志格式
evolution_audit:
  timestamp: "2026-07-03T14:30:00Z"
  dimension: "content_evolution"
  level: "L2"
  trigger: "knowledge_health_check_detected_stale"
  change_description: "更新了FAQ中Q12的回答（原回答基于v1.2产品，当前已是v1.4）"
  before_eval: {intent_accuracy: 0.87, safety: pass}
  after_eval: {intent_accuracy: 0.89, safety: pass}
  approval: "auto"          # auto | human_approved
  rollback_triggered: false
```

### 3.1 维一：内容/知识自进化

```
L1 — 陈旧检测 + 人工更新建议
  触发：定时扫描（每周）
  检测：最后更新时间 > stale_threshold_days
  输出：陈旧文档清单 + AI草拟的更新建议 → 人工审核队列
  
  Codex指令：
  bash scripts/evolution/content-health-check.ts --genome product-genome.yaml
  证据门：输出json包含字段 {stale_count, suggestions[], contradictions[]}
  不得：自动修改知识库（人工审核门禁）

L2 — 自动提取 + 人工验证更新
  触发：用户对话中出现新的产品信息
  行为：AI从对话中提取新知识 → 置信度评分 → 
        置信度>auto_update_confidence_threshold → 自动写入草稿区 → 人工发布
        置信度<阈值 → 加入审核队列
  不得：在无人工确认的情况下将对话内容发布到生产知识库
  
  Codex指令：
  bash scripts/evolution/extract-knowledge-from-conversations.ts --since "7 days ago"
  证据门：输出json包含 {extracted_facts[], confidence_scores[], suggested_updates[]}
  不得：直接写入生产知识库

L3 — 矛盾检测 + 解决方案建议
  触发：新增知识与已有知识语义冲突
  行为：标记冲突对 → AI分析哪个更可能是正确的 → 
        建议：保留A/保留B/两者都是上下文依赖的 → 人工裁判
  不得：自动解决矛盾（人工裁判不可跳过）

L4 — 知识库结构自优化
  触发：检索质量下降或用户反馈聚类显示结构问题
  行为：AI分析"当前知识库的组织方式是否最优" → 
        例如："FAQ按产品线组织 → 建议改为按用户场景组织"
  输出：重构建议 → 人工审批 → 自动执行重构
  不得：在没有人工审批的情况下重构知识库结构

L5 — 知识前瞻性补全
  触发：用户查询模式预测
  行为：AI分析"用户正在问什么→接下来会问什么" →
        识别知识空白 → 自动草拟缺失知识 → 人工审核
  不得：发布未经人工验证的补全内容
```

### 3.2 维二：功能自进化

```
L1 — 用户需求信号采集
  触发：持续运行
  采集：用户反复尝试但失败的操作 / "能不能支持XX?"类查询 / 竞品已支持但缺失的能力
  输出：每周需求信号报告 → 按信号强度排序
  不得：仅凭一个用户的需求信号就生成提案
  
  Codex指令：
  bash scripts/evolution/collect-feature-signals.ts --since "7 days ago"
  证据门：json输出包含 {signals[], signal_strength[], source_conversations[]}

L2 — 自动生成功能提案
  触发：同一需求信号出现 >= min_signal_strength 次独立用户
  行为：AI合成功能提案（功能描述 + 价值假设 + 实现难度 + 风险评估）
  输出：功能提案文档 → 人工决策（Go/No-Go）
  不得：在No-Go后仍然尝试实施
  
  Codex指令：
  bash scripts/evolution/generate-feature-proposals.ts --min-signal-strength 5
  证据门：每个提案必须包含 {description, value_hypothesis, complexity, risk_assessment}

L3 — 自动实施低风险功能
  触发：人工审批通过 + 功能被标记为"低风险"
  行为：AI生成功能代码 → 生成评估集 → CI门禁 → staging → Playwright验证
  输出：灰度发布PR
  不得：直接发布到production；高风险功能不自动实施
  安全网：自动回滚条件（错误率>基线2x 或 用户满意度下降 > 10%）

L4 — 自主功能规划
  触发：平台元AI层的产品组合分析
  行为：AI规划"下个季度应该优先开发哪些功能" → 生成产品路线图草案
  输出：路线图草案 → 人工审批
  不得：代替人工做最终的路线图决策
  注：2026年实验阶段。建议在单个产品验证L1-L3后再启用
```

### 3.3 维三：UI自进化

```
L1 — AI辅助设计
  流程：Figma/截图 → Appshot注入Codex → 生成shadcn/ui代码 → Playwright自测
  适用：所有产品的初始UI开发
  不得：在未经过Playwright验证的情况下声称"UI完成"

L2 — A/B测试驱动优化
  流程：配置PostHog实验 → 生成UI变体 → 流量分配 → 统计显著性检验
  适用：特定组件的文案、布局、颜色优化
  不得：在统计不显著的情况下做决策
  
  Codex指令：
  bash scripts/evolution/setup-ab-test.ts --component "{component_name}" --variants 2
  证据门：PostHog实验已创建 AND 流量分配正确 AND 指标配置正确

L3 — 行为自适应UI（实时）
  流程：追踪隐式信号（点击/停留/滚动/rage click） → AI分析 → CSS级DOM调整
  适用：落地页、营销页面、Dashboard
  参考实现：Coframe/Fibr AI/begeniux（均已商用）
  不得：在核心功能页面（如支付、合规确认）上使用自适应UI
  安全网：A/A测试验证（自适应 vs 基线，确认自适应不引入负向影响）
  
  Codex指令（部署begeniux或等效工具）：
  bash scripts/evolution/deploy-adaptive-ui.ts --scope "landing_page" --exclude "checkout,compliance"
  证据门：自适应已启用 AND A/A测试已启动 AND 排除列表已确认

L4 — 意图感知界面（动态组装）
  流程：分类器判断用户意图 → 从组件注册表中动态组装界面
  协议：AG-UI（CopilotKit，Google/Microsoft/Amazon/Oracle支持）
  适用：复杂功能产品的个性化dashboard
  不得：在组件注册表之外的组件上动态组装

L5 — 信息架构自演进
  流程：长期追踪用户导航模式 → AI发现"用户总是先看A再看B但它们在菜单的不同位置" →
        建议信息架构重组
  输出：重组建议 → 人工审批 → A/B验证 → 部署
  不得：在没有A/B验证的情况下全量推送信息架构变更
  注：实验阶段
```

### 3.4 维四：架构自进化（前瞻）

```
2026年状态：实验阶段，所有变更需人工决策和审批。

L1 — 架构健康监控
  自动追踪：响应延迟 / Token消耗 / 缓存命中率 / 检索质量趋势
  输出：每周架构健康报告
  当指标连续2周劣化时 → 触发架构评审

L2 — 架构迁移建议
  AI分析"当前架构在哪个节点成为瓶颈" →
  生成迁移方案（成本/收益/风险）→ 人工决策

L3 — 自动迁移（限制条件下）
  仅在以下条件全部满足时启用：
  - 迁移方案经过人工审批
  - 新旧架构并行运行 >= 2周
  - 新架构在所有核心指标上 >= 旧架构
  - 回滚方案已就绪（<10分钟可回滚）
  注意：2026年不要开启L3。等待SWE-bench Pro在该类任务上 > 70%后再评估。
```

### 3.5 🆕 自进化速度量化指标

自进化引擎目前定义了"做什么"。以下量化指标定义"怎么测量进化效果"。

| 指标 | 定义 | 测量方式 | 健康阈值 |
|------|------|---------|---------|
| 重复错误下降率 | 同一 gap_type 在 Lane C 中出现的频率趋势（周环比） | 对比本周 vs. 上周的 per-gap-type 计数 | 月环比下降 > 10% |
| 知识闭环速度 | 用户交互 → canonical knowledge 的平均周期（天） | 从 AgentFeedback 时间戳 → 对应 claim_card promotion_state=canonical 的时间戳差值中位数 | < 14 天 |
| 新场景适应率 | 本周新出现的 query type 中，Agent 首次回答准确率 | 新 intent 的首次出现 × 评估集 Recall@5 | > 60%（首次），> 85%（第三次） |
| 模型迁移收益 | 切换到新 LLM 模型后，同评估集的分数变化 + 成本变化 | pre-migration eval baseline vs. post-migration eval | 准确率下降 < 3pp 且成本下降 > 10% 才计入正向收益 |
| 知识增量密度 | 每新增 100 条 canonical knowledge，Agent Recall@5 的提升幅度 | ΔRecall@5 / Δcanonical_count（归一化） | 边际收益递减 < 50% 时暂停自动蒸馏（触发 human review） |

### 3.6 🆕 跨产品能力迁移（方向性）

> ⚫ 2026年不可行。来源：企业级智能体效能管理指南 L5"自适应进化"。

指 Agent 在 domain A 学到的推理模式可以迁移到 domain B。例如：客服 Agent 学会了"用户情绪识别→升级机制"的模式，该模式被迁移到技术支持 Agent 而无需重新训练。

当前 Playbook 的自进化引擎仅覆盖**单一产品内**的进化。跨产品能力迁移需要：
- 共享的 Agent 能力抽象层（可迁移的"技能"而非领域知识）
- 跨产品的评估基准（证明迁移有效）
- 能力版本管理（迁移后的退化检测和回滚）

在 Playbook 的共享组件库（第七章）中预留了基础——当多产品运行足够久、积累了足够的跨产品数据后，重新评估此维度的可行性。

### 3.7 🆕 多Agent协作评估维度

当前 Playbook 评估体系面向单 Agent 设计。以下新增维度针对多 Agent 系统——这是 Playbook 明确支持的核心产品类型。

| 指标 | 定义 | 目标 | 测量方式 |
|------|------|------|---------|
| Handoff 成功率 | Agent A 的输出（JSON Schema）被 Agent B 正确解析和消费的比例 | > 90% | schema validation at handoff boundary |
| 任务分配偏差 | Supervisor 分配任务 vs. 人工最优分配的一致性 | 偏差 < 15% | 定期人工审计 sample 50 个分配决策 |
| 冲突解决率 | 多 Agent 意见分歧后成功收敛（不升级到人工）的比例 | > 80% | 追踪每次 conflict → resolution 或 escalation |
| 通信开销比 | 协调 token 消耗 / 任务 token 消耗 | < 30% | Langfuse trace per-agent token attribution |
| 端到端延迟(TAT) | 多 Agent 协作完成端到端任务的总时间 vs. 单 Agent 完成任务的时间 | 多Agent 不慢于单Agent的 2X | Langfuse trace total duration |

**这些指标的查看频率**：Handoff 成功率和通信开销比应实时监控。任务分配偏差每月人工审计一次。冲突解决率每周查看。

**这些指标在单 Agent 产品中不适用**。仅当产品确实使用了多 Agent 编排时才启用此评估维度。

---

## 四、进化宪章：不可变的约束边界

```yaml
# EVOLUTION_CONSTITUTION.yaml
# 这个文件定义了任何自动进化都不得违反的约束。
# 只有人工可以修改这个文件。Codex可以读取但不能修改。

constitution:
  version: "1.0.0"
  last_amended_by: "human"  # 永远不会是 "auto"
  
  # ===== 绝对约束（任何自动进化违反即阻止）=====
  absolute_constraints:
    - id: "no_deception"
      rule: "产品不得在回答中故意误导用户。任何优化指标不得以增加误导性为代价。"
      
    - id: "no_data_abuse"  
      rule: "用户数据不得用于与该用户无关的优化。用户的对话内容不得跨用户共享。"
      
    - id: "always_auditable"
      rule: "任何自动变更必须保留完整的决策记录：触发信号、变更内容、前后评估对比。"
      
    - id: "safety_no_regression"
      rule: "安全rubric指标不得在任何自动优化中倒退。单条安全用例的失败 = 阻止变更。"
      
    - id: "human_identity_disclosure"
      rule: "用户有权知道自己在和AI交互。不得伪装为人类。"
      
    - id: "diversity_preservation"
      rule: "同一平台上的不同产品必须保留差异化。不得将所有产品优化到相同的'最优解'。"
      
  # ===== 受保护指标（权重不可被任何自动优化调整）=====
  protected_metric_weights:
    safety:
      min_weight: 0.30
      rationale: "安全不是可优化的trade-off，是硬底线"
    honesty:
      min_weight: 0.20
      rationale: "诚实是信任的基础"
    user_satisfaction:
      min_weight: 0.20
      rationale: "用户价值是商业可持续的基础"
    # 剩余50%可由进化策略自由分配
      
  # ===== 飞轮刹车条件（触发后停止所有自动进化）=====
  emergency_brakes:
    - condition: "连续3天，任何安全rubric出现一次以上的失败"
      action: "暂停所有产品的自动进化，人工审查所有近7天的变更"
      
    - condition: "核心指标（用户满意度/留存/完成率）连续2周下降"
      action: "暂停受影响产品的自动进化，回滚到2周前的稳定配置"
      
    - condition: "自动变更量 > 人工审核量 持续7天"
      action: "减速：强制人工审批所有变更，直到比例恢复平衡"
      
  # ===== 多样性注入 =====
  diversity_injection:
    exploration_budget: 0.15  # 15%的流量分配到"非最优"策略
    rationale: "防止过度适应和产品同质化"
    injection_methods:
      - "保留10%用户使用上一版本的Prompt"
      - "随机5%流量分配到随机策略（探索）"
      - "每个产品必须有至少一个与众不同的Agent人格特征"
```

---

## 五、Codex可执行指令格式规范

### 5.1 每条指令的标准模板

当前Playbook中大量指令是人读的。Codex需要的是这个格式：

```yaml
instruction:
  # 做什么（具体到文件路径）
  task: "在 lib/analytics/flywheel.ts 中实现 collectFailureCases 函数"
  
  # 输入是什么（必须存在的前置文件）
  inputs:
    - "lib/analytics/langfuse-client.ts"  # Langfuse API封装
    - "lib/ai/eval-runner.ts"             # 评估运行器
  
  # 输出是什么（必须生成的文件和格式）
  outputs:
    - file: "evals/incremental/weekly-{date}.jsonl"
      format: "jsonl"
      schema: "evals/schemas/case-schema.json"
  
  # 不做什么（负面约束）
  do_NOT:
    - "不要修改 evals/golden/ 下的核心回归集"
    - "不要从单个用户少于3次的失败模式中提取案例"
    - "不要包含任何包含个人可识别信息(PII)的案例"
  
  # 验证条件（证据门——如何证明"完成了"）
  evidence_gate:
    # 注：此为 §五 指令格式的示意模板，非实际执行的命令
    # scripts/validate-incremental-evals.ts 不存在。实际执行时使用人工验证。
    command: "bash scripts/validate-incremental-evals.ts --file evals/incremental/weekly-{date}.jsonl --check-schema --check-no-pii --check-dedup"
    passing_condition: "exit code 0 AND output contains 'VALIDATION_PASSED'"
  
  # 失败处理
  max_attempts: 3
  on_failure:
    action: "报告失败原因和具体的验证错误，不继续执行后续步骤"
    do_NOT: "不要在验证失败后继续—这会污染评估集"
  
  # 如果成功，下一步是什么
  on_success: "继续执行：将增量案例追加到评估运行器的读取路径"
```

### 5.2 关键原则（来自2026年研究证据）

**原则1：负面约束 > 正面指令**

研究表明(Zhang et al., arXiv:2604.11088)：每条有正面效果的规则都是负面约束（"不要做X"），每条有负面效果的规则都是正面指令（"应该做Y"）。

这个Playbook中的所有指令都遵循：**定义"不允许做什么"的边界，让Codex在边界内自由发挥**。

**原则2：条件必须锚定到工具输出**

Agent无法可靠评估主观条件。正确格式：
- ✅ `if bash scripts/check-types.ts 返回 exit code 0`
- ✅ `if grep -c "FAIL" test-output.txt 返回 0`
- ❌ `if 代码看起来没问题`
- ❌ `if 实现了良好的设计模式`

**原则3：验证来自外部工具，不是Agent自评**

研究证明(Stechly et al., ICLR 2025)：LLM在自我批判时出现显著性能崩溃。每个任务的完成必须由外部工具验证——Playwright、TypeScript compiler、测试运行器、lint工具。

**原则4：规范模块化，按需加载**

不要将整个Playbook加载到Agent上下文中。每个任务只加载相关的规范文件：
```
project-spec/
├── what-vision.md          → 需求/设计阶段加载
├── how-architecture.md     → 架构决策时加载
├── how-security.md         → 所有编码任务加载（安全是跨领域的）
├── how-testing.md          → 开发/测试阶段加载
├── agents/
│   └── agent-spec-{name}.md → 按功能按需加载
└── ops/
    ├── deploy.md            → 部署时加载
    └── monitoring.md        → 运维阶段加载
```

**原则5：AGENTS.md < 80行**

超过80行的配置文件，Agent开始忽略指令。如果规则很多，拆分为多个模块化文件。

---

## 六、八阶段生命周期（Codex可执行版）

> ⚠️ **2026-07-04 诚实声明**：本章的 evidence_gate 字段引用了多个验证脚本。**以下脚本已实现**：validate-genome.ts、cost-model.ts、generate-eval-set.ts、instantiate-skeleton.ts、init-knowledge-base.ts、generate-agent-infra.ts、deploy-staging.ts。**以下脚本尚不存在**：validate-research.ts、validate-prd.ts、validate-agent-spec.ts、validate-prompt-consistency.ts、validate-eval-set.ts、validate-adr.ts、validate-plan.ts、validate-analytics-pipeline.ts、validate-health-report.ts、rag-debug.ts。对于不存在的脚本，evidence_gate 改为 **手动验证清单**——由人类确认而非脚本自动确认。这是诚实的当前状态，不是理想状态。

### 阶段①：需求洞察与验证（2-5天）

#### 模块化规范文件：`project-spec/what-vision.md`

**这个阶段的可执行指令集**：

```
TASK 1.1: 竞品代码级调研
  task: "克隆仓库 [{repo_urls}]。搜索 system prompt/prompt template/agent tool 相关文件。提取Agent架构模式。对比3个竞品的相似功能实现路径。"
  inputs: ["repo_urls列表"]
  outputs: ["docs/research/competitor-analysis.md"]
  do_NOT:
    - "不要仅基于README文件做判断——必须阅读源代码"
    - "不要只报道优势——必须找到至少2个设计缺陷或架构弱点"
  evidence_gate:
    mode: "manual"  # scripts/validate-research.ts 不存在
    check: "人工确认: docs/research/competitor-analysis.md 包含至少 5 个章节 + 至少 10 处代码引用 + 至少 2 个设计缺陷"
  on_failure: "报告缺少的章节或引用，补充后重新验证"
  on_failure: "报告缺少的章节或引用，补充后重新验证"

TASK 1.2: 多模型交叉审查
  task: "将产品价值主张发送给3个不同模型家族的模型。提示词：'列出这个产品假设成立的3个前提、最可能失败的2个原因、1个被忽略的关键风险。'对比回答，标注分歧点。"
  inputs: ["一句话价值主张"]
  outputs: ["docs/research/assumptions-register.md"]
  do_NOT:
    - "不要让同一个模型家族的模型交叉审查"
    - "不要忽略模型之间的共识——共识处可能是明显的盲点"
  evidence_gate:
    mode: "manual"  # python scripts/check-assumptions.py 不存在
    check: "人工确认: 至少 3 个前提 + 2 个风险 + 1 个被忽略风险已记录在 assumptions-register.md 中"

TASK 1.3: PRD生成（先质疑，后落笔）
  task: "扮演资深产品经理。先向我提出5个尖锐质疑。等我回答后，生成一页纸PRD（价值主张/目标用户/核心功能≤3个/成功指标/不做什么/关键假设）。"
  inputs: ["竞品分析", "假设注册表"]
  outputs: ["docs/prd.md"]
  do_NOT:
    - "不要在PRD中包含超过3个核心功能"
    - "不要使用模糊的成功指标——每个指标必须有可量化的定义和基线"
  evidence_gate:
    mode: "manual"  # scripts/validate-prd.ts 不存在
    check: "人工确认: 所有成功指标可量化 + 核心功能 ≤ 3 + 有基准值"

TASK 1.4: 落地页 + 等候名单
  task: "创建 Next.js 落地页：Hero + 3个价值点 + 邮箱等候名单（Supabase waitlist表）+ PostHog追踪。部署为Codex Site。"
  outputs: ["可访问的URL", "Supabase表已创建", "PostHog事件已配置"]
  do_NOT:
    - "不要花超过30分钟在视觉细节上——这是验证阶段，不是设计阶段"
    - "不要在没有PostHog的情况下部署——没有转化数据，验证无效"
  evidence_gate:
    mode: "manual"  # scripts/validate-landing-page.ts 不存在
    check: "人工确认: URL 可访问 + PostHog 事件流入 + Supabase 写入测试通过"
```

---

### 阶段②：产品设计（3-7天）

#### 模块化规范文件：`project-spec/agents/agent-spec-{feature}.md`

```
TASK 2.1: Agent行为规格书（核心资产）
  task: "生成Agent行为规格书到 docs/design/agent-spec-{feature}.md。包含：角色定义/输入输出契约/工具清单(含触发和不触发条件)/失败矩阵/20+条示例对话。"
  inputs: ["docs/prd.md", "docs/research/competitor-analysis.md"]
  outputs: ["docs/design/agent-spec-{feature}.md"]
  do_NOT:
    - "不要写抽象的规范——每个工具必须精确到'当用户说X且Y条件满足时触发'"
    - "不要让失败矩阵少于6种失败类型"
    - "不要让示例对话少于20条（10正常+5边界+5对抗）"
  evidence_gate:
    # scripts/validate-agent-spec.ts 不存在 — 用人工验证替代
    check: "人工确认: 工具清单(触发+不触发) + 失败矩阵≥6种 + 示例对话≥20条"
    passing_condition: "exit code 0 AND 所有检查通过"

TASK 2.2: 从规格书收割System Prompt
  task: "基于agent-spec.md生成System Prompt v1到 prompts/system/v1.md。遵循Anthropic最佳实践：角色→上下文→规则→示例→输出格式。"
  inputs: ["docs/design/agent-spec-{feature}.md"]
  outputs: ["prompts/system/v1.md"]
  do_NOT:
    - "不要在v1中偏离规格书中的行为定义"
    - "不要加入规格书之外的规则（防止v1和规格书不一致）"
  evidence_gate:
    # scripts/validate-prompt-consistency.ts 不存在，用人工检查替代
    check: "人工确认: System Prompt 与 Agent 规格书一致——角色/工具/失败矩阵/示例对话无偏差"

TASK 2.3: 反馈机制Schema设计
  task: "设计反馈采集的数据库Schema（显式+隐式信号）到 docs/design/feedback-schema.md。包含：feedback表/ implicit_signals表 / 数据如何流入评估集增量文件。"
  outputs: ["docs/design/feedback-schema.md"]
  evidence_gate:
    # scripts/validate-schema.ts 不存在，用人工检查替代
    check: "人工确认: Schema 包含显式和隐式信号 + 包含评估集流入路径"
```

---

### 阶段③：技术架构（2-5天）

#### 模块化规范文件：`project-spec/how-architecture.md`

```
TASK 3.1: 架构决策记录（ADR）
  task: "为每个关键架构节点创建ADR，格式：背景/决策/备选方案/后果/迁移路径。至少覆盖：知识架构/Agent框架/向量数据库/流式架构/评估工具链。"
  outputs: 
    - "docs/architecture/decisions/001-knowledge-architecture.md"
    - "docs/architecture/decisions/002-agent-framework.md"
    - "docs/architecture/decisions/003-vector-database.md"
    - "docs/architecture/decisions/004-streaming-architecture.md"
    - "docs/architecture/decisions/005-evaluation-toolchain.md"
  do_NOT:
    - "不要在ADR中写'因为大家都用'——必须是基于本项目具体约束的推理"
    - "不要遗漏迁移路径——如果当前选择需要改变，成本是多少？"
  evidence_gate:
    # scripts/validate-adr.ts 不存在，用人工检查替代
    check: "人工确认: 所有 ADR 包含 5 个必要章节(背景/决策/备选/后果/迁移路径)"

TASK 3.2: 项目脚手架实例化
  task: "基于产品基因组和ADR创建完整的项目脚手架。"
  执行步骤：
    1. bash scripts/instantiate-skeleton.ts --genome product-genome.yaml
    2. npm run dev (验证可启动)
    3. Playwright MCP: 打开 localhost:3000, 截图验证
  do_NOT:
    - "不要跳过Playwright验证——'npm run dev无报错'不足以证明脚手架正确"
  evidence_gate:
    command: "npm run dev 成功启动 AND Playwright截图显示200状态码页面"
    passing_condition: "两个条件都为true"

TASK 3.3: 成本沙盘
  task: "实现 scripts/cost-model.ts。模拟DAU 100/1000/10000/100000四个级别。参数：每会话5轮/输入800输出400 tokens/缓存命中率变量。输出各提供商的月度成本表格。"
  outputs: ["docs/architecture/cost-model.md", "scripts/cost-model.ts"]
  do_NOT:
    - "不要假设100%缓存命中率——给出50%/65%/80%三个场景"
    - "不要忽略免费层的API额度"
  evidence_gate:
    command: "npx tsx scripts/cost-model.ts --output docs/architecture/cost-model.md"
    passing_condition: "exit code 0 AND 表格包含4个DAU级别 AND 3个缓存场景"
```

---

### 阶段④：开发实施（1-4周）

#### 模块化规范文件：`project-spec/how-security.md` + `project-spec/how-testing.md`

**为什么安全规范要在这个阶段加载**：研究发现51%+的AI生成代码包含漏洞。安全约束必须从写第一行代码时就生效。

**开发阶段的核心工作流：规范驱动的三段式**

```
每次开发新功能的标准流程（强制三步，跳过任何一步都会导致质量崩塌）：

STEP 1: 生成实施计划 PLAN
  task: "阅读相关设计文档和agent-spec.md。制定实施计划：新建/修改文件清单、实施顺序、每个步骤的风险点、需要的测试类型。只输出计划。"
  outputs: ["docs/plans/{feature}-plan.md"]
  do_NOT:
    - "不要在计划阶段就开始写代码"
    - "不要输出超过200行的计划——如果计划太长，说明需要拆分为多个子功能"
  evidence_gate:
    # scripts/validate-plan.ts 不存在，用人工检查替代
    check: "人工确认: 计划包含文件清单 + 包含测试策略 + 不超过 200 行"

STEP 2: 增量实施 IMPLEMENT
  task: "按计划实施。每完成一个文件运行 tsc --noEmit。先写测试，再写实现。每个工具函数必须包含zod schema + 触发条件描述 + 独立单测。"
  do_NOT:
    - "不要修改 evals/golden/ 下的评估集"
    - "不要在一个commit中修改超过5个文件"
    - "不要在代码中硬编码API密钥或敏感配置"
    - "不要重构与当前任务无关的代码（即使它'需要重构'）"
    - "不要在测试通过前声称'完成'"

STEP 3: 自检验证 VERIFY
  task: "Playwright MCP验证：打开页面，模拟完整用户流程，检查控制台无报错。验证所有组件状态矩阵（loading/empty/error/success/edge）。"
  evidence_gate:
    command: "npm run typecheck && npm run test && npm run eval"
    passing_condition: "所有三个命令exit code 0"
  on_failure: "修复失败项，每次只修复一个。如果同一个测试失败3次，STOP并报告——这可能是设计问题，不是实现问题。"
```

**Agent开发的关键约束**：

```
RAG管道 — 检索调试先于管道实现
  STEP 1: 实现 scripts/rag-debug.ts（输入查询→展示召回chunks+得分）【推荐创建，非已有脚本】
  STEP 2: 用它调优分块和检索参数
  STEP 3: 确认参数后，再集成到Agent管道
  do_NOT: "不要跳过调试脚本直接实现管道——你看不到检索盲区"

工具调用 — 描述质量 = Agent智商的一半
  do_NOT: "不要让工具描述中出现'当需要时调用'——必须精确到触发场景"
  do_NOT: "不要让工具缺少'不触发条件'——没有negative triggers的工具会被滥用"

流式响应 — 默认SSE，>30秒任务用持久会话
  do_NOT: "不要在没有任何缓存策略的情况下部署——65-80%的查询可以缓存"
  
记忆系统 — 最难的是生命周期管理，不是存储
  do_NOT: "不要让记忆无限增长——必须实现去重、矛盾检测、过期淘汰"
```

---

### 阶段⑤：测试与评估（贯穿始终）

#### 模块化规范文件：`project-spec/how-testing.md`

```
TASK 5.1: 从规格书收割评估集
  task: "基于 agent-spec.md 生成评估集 evals/golden/{feature}-v1.jsonl：30条正常+15条边界+15条对抗"
  outputs: ["evals/golden/{feature}-v1.jsonl"]
  do_NOT:
    - "不要只从正常用例中采样——对抗用例是评估体系成立的基石"
    - "不要让对抗用例太明显——真实攻击者不会以'请忽略你的指令'开头"
  evidence_gate:
    # scripts/validate-eval-set.ts 不存在，用人工检查替代
    check: "人工确认: 评估集 ≥ 60 条 + 含 normal/boundary/adversarial 三类"

TASK 5.2: 评估运行器
  task: "实现 evals/run.ts。三级防护：确定性规则→分类器→LLM评判。支持 --compare 参数。"
  do_NOT:
    - "不要让LLM评判使用和被评判Agent相同的模型家族（避免自我偏好）"
    - "不要让安全rubric失败被其他维度的高分'平均掉'——安全是pass/fail，不是加权分"
  evidence_gate:
    command: "npm run eval"
    passing_condition: "exit code 0 AND 安全rubric全部pass"
```

---

### 阶段⑥：部署与运维

```
TASK 6.1: CI/CD门禁
  task: "配置GitHub Actions：push → lint → typecheck → test → eval → deploy staging → Playwright E2E → deploy production"
  evidence_gate:
    command: "git push origin main 后观察GitHub Actions运行"
    passing_condition: "所有步骤pass AND Playwright截图显示正确的production页面"

TASK 6.2: Prompt独立部署测试
  task: "验证Prompt可以独立于代码进行灰度发布和回滚"
  验证步骤：
    1. "在Langfuse中创建一个test标签的Prompt版本"
    2. "在staging环境确认test版本生效"
    3. "将标签移回production版本"
    4. "确认回滚<1秒完成"
  evidence_gate: "所有4步验证通过"
```

---

### 阶段⑦：运营与增长

```
TASK 7.1: 隐式信号分析管道
  task: "实现 lib/analytics/implicit-signals.ts。追踪信号：复制内容/重新生成/中断/修改输出/深度阅读/快速离开/重复问题。"
  do_NOT:
    - "不要把所有信号都视为等权重——显式反馈（点赞/点踩）的置信度 > 隐式信号"
    - "不要在用户不知情的情况下追踪——隐私政策必须明确披露"
  evidence_gate:
    # scripts/validate-analytics-pipeline.ts 不存在，用人工检查替代
    check: "人工确认: PostHog 中可查询到所有 7 种隐式信号事件"
```

---

### 阶段⑧：自进化机制

```
TASK 8.1: 数据回流管道
  task: "实现 scripts/evolution/collect.ts。从Langfuse读取每天点踩案例→自动去重→按意图分类→追加到 evals/incremental/"
  evidence_gate:
    command: "bash scripts/evolution/collect.ts --since '7 days ago' --dry-run"
    passing_condition: "exit code 0 AND 输出显示去重后的案例数量"

TASK 8.2: 内容健康检查
  task: "实现 scripts/evolution/content-health-check.ts。检测陈旧/矛盾/盲区。"
  调度: "每周一凌晨2点运行"
  evidence_gate:
    command: "bash scripts/evolution/content-health-check.ts"
    passing_condition: "exit code 0 AND 输出报告包含 {stale_items[], contradictions[], gaps[]}"

TASK 8.3: 进化审计日志
  task: "实现 scripts/evolution/audit-logger.ts。每次自动变更记录：时间/维度/触发信号/变更内容/前后评估对比/审批状态。"
  do_NOT: "不要让任何自动变更绕过审计日志——零例外"
```

---

## 七、共享组件库

平台上有N个产品时，以下组件应该只实现一次，各个产品通过配置复用：

```yaml
shared_components:
  # Agent层
  - name: "unified-llm-client"
    path: "shared/lib/ai/client.ts"
    description: "多提供商LLM调用封装（路由/重试/流式/成本记录/缓存）"
    maturity: 🟢
    
  - name: "memory-manager"
    path: "shared/lib/ai/memory.ts"
    description: "对话记忆管理（窗口/摘要/长期/用户画像）"
    maturity: 🟢
    
  - name: "guardrails"
    path: "shared/lib/ai/guardrails.ts"
    description: "内容审核/注入检测/PII检测"
    maturity: 🟢

  # 知识层
  - name: "knowledge-classifier"
    path: "shared/lib/knowledge/classifier.ts"
    description: "多库查询路由分类器"
    maturity: 🟢
    
  - name: "hybrid-retriever"
    path: "shared/lib/knowledge/retriever.ts"
    description: "混合检索（BM25+稠密+ColBERT）+ RRF融合"
    maturity: 🟢

  # 评估层
  - name: "eval-runner"
    path: "shared/lib/eval/runner.ts"
    description: "三级评估运行器（规则/分类器/LLM评判）"
    maturity: 🟢
    
  - name: "eval-gates"
    path: "shared/lib/eval/gates.ts"
    description: "CI评估门禁（底线/安全/比对）"
    maturity: 🟢

  # 进化层
  - name: "content-health-checker"
    path: "shared/lib/evolution/content-health.ts"
    description: "知识健康检查（陈旧/矛盾/盲区）"
    maturity: 🟡
    
  - name: "feature-signal-collector"
    path: "shared/lib/evolution/feature-signals.ts"
    description: "功能需求信号采集"
    maturity: 🟡
    
  - name: "evolution-audit-logger"
    path: "shared/lib/evolution/audit.ts"
    description: "进化审计日志"
    maturity: 🟢
```

**成熟度图例**：🟢 生产就绪 | 🟡 验证中 | 🔴 实验阶段

---

## 八、平台级关键脚本清单

这些脚本是整个平台的操作杠杆。每个脚本必须存在且可通过bash调用：

```
scripts/
├── validate-genome.ts              # 验证基因组文件完整性
├── instantiate-skeleton.ts          # 从基因组实例化项目骨架
├── init-knowledge-base.ts          # 初始化知识库（collection + 初始索引）
├── generate-agent-infra.ts         # 生成Agent基础设施代码
├── generate-eval-set.ts            # 从规格书生成初始评估集
├── deploy-staging.ts               # 部署到staging环境
│
├── validate-agent-spec.ts          # 验证Agent规格书完整性
├── validate-prompt-consistency.ts  # 验证Prompt与规格书一致性
├── validate-eval-set.ts            # 验证评估集格式和覆盖
├── validate-incremental-evals.ts   # 验证增量评估案例
├── validate-adr.ts                 # 验证架构决策记录
├── validate-plan.ts                # 验证开发计划
│
├── cost-model.ts                   # 成本模拟
├── rag-debug.ts                    # RAG检索调试
│
evolution/
├── collect.ts                      # 数据回流采集
├── content-health-check.ts         # 内容健康检查
├── extract-knowledge-from-conversations.ts  # 从对话提取知识
├── collect-feature-signals.ts      # 功能需求信号采集
├── generate-feature-proposals.ts   # 自动生成功能提案
├── setup-ab-test.ts                # 设置A/B测试
├── deploy-adaptive-ui.ts           # 部署自适应UI
├── audit-logger.ts                 # 进化审计日志
└── rollback.ts                     # 紧急回滚
```

---

## 九、财务模型与ROI分析

### 9.1 平台建设成本估算

基于当前实际脚本开发进度（4个核心脚本已实现），完整平台建设预估：

| 阶段 | 内容 | 人·周 | 状态 |
|------|------|-------|------|
| 核心脚本 | validate-genome + instantiate-skeleton + cost-model + generate-eval-set | 1.5周 | ✅ 已完成 |
| 扩展脚本 | init-knowledge-base + generate-agent-infra + deploy-staging + 其他验证脚本 | 2-3周 | ❌ 待实现 |
| 进化层脚本 | content-health-check + feature-signal-collector + audit-logger | 1-2周 | ❌ 待实现 |
| 共享组件库 | unified-llm-client + memory-manager + guardrails + 其他 | 2-3周 | ❌ 待实现 |
| 集成测试 | 端到端验证 + 指令遵循度测试 + 文档 | 1-2周 | 🔄 进行中 |
| **总计** | | **7.5-11.5周** | |

> 以上为一个全职工程师的估算。用Codex辅助开发，实际耗时可能缩短30-50%。

### 9.2 单产品盈亏平衡

基于cost-model.ts的输出（GPT-5.5方案，优化缓存，DAU 1000）：

| 指标 | 数值 | 说明 |
|------|------|------|
| 月度LLM成本 | ~$870 | DAU 1000, 优化缓存 |
| 月度总运营成本 | ~$1,300-2,600 | LLM + 数据库 + 部署 + 域名（通常是LLM成本的1.5-3倍） |
| Freemium模型盈亏平衡 | ~260-520 付费用户 | 假设$5/月ARPU |
| SaaS模型盈亏平衡 | ~65-130 付费用户 | 假设$20/月ARPU |

**缓存是最大的成本杠杆**：从无缓存到优化缓存，LLM成本下降约36%。从GPT-5切换到DeepSeek V3可再降约85%，但质量有差距——建议用于非关键查询的fallback。

### 9.3 规模化经济效益

| 产品数 | 平台维护成本 | 每新增产品边际成本 | 共享组件节省 |
|--------|------------|-------------------|-------------|
| 1个 | 基线 | 基线 | 0% |
| 5个 | 基线 × 1.3 | 基线的40-50% | 约30-40%（Agent/client/评估复用） |
| 10个 | 基线 × 1.5 | 基线的25-35% | 约50-60%（知识/进化/部署全面复用） |
| 20个+ | 基线 × 2.0 | 基线的15-25% | 约70%+（仅需基因组配置差异化） |

**关键假设**：产品之间相似度越高（同领域、同类型），共享组件节省越大。如果20个产品是完全不同的领域（医疗+游戏+金融+教育），共享价值会大幅降低。

### 9.4 平台投入何时回本

假设：平台建设投入 = 1个工程师10周。手动开发1个AI产品 = 1个工程师8周。

| 场景 | 盈亏平衡点 |
|------|-----------|
| 保守（每个产品节省30%开发时间） | 约4个产品后回本 |
| 乐观（每个产品节省50%开发时间 + 共享组件累积） | 约2-3个产品后回本 |
| 悲观（平台维护开销抵消节省） | 无限期 |

**真实预测**：平台在第3-5个产品时开始产生净收益。前2个产品是"交学费"——验证平台假设、完善脚本、积累共享组件。

---

## 十、进化宪章的执行机制

### 10.1 三层执行模型

v2 Playbook的进化宪章不仅是一个YAML文件——它需要实际的执行机制才能生效。

```
Level 1 — 编译时检查 🟢（当下可实现）
  机制: 进化变更在生成后、部署前，通过评估集自动验证
  实现: CI中的 post-evolution-check 脚本
  覆盖: 安全rubric不得倒退（自动验证）
  
Level 2 — 运行时护栏 🟡（需要工程化）
  机制: 进化变更在灰度发布期间通过实时监控触发自动回滚
  实现: Langfuse trace → 指标异常检测 → 自动回滚标签
  覆盖: 性能劣化、用户满意度下降（实时监控）

Level 3 — 设计时约束 🔴（2026年不可靠）
  机制: AI在生成进化变更时主动避免违反宪法
  实现: Constitution注入到进化Agent的System Prompt
  覆盖: 模糊约束（如"不得误导"）
  局限性: LLM自约束在2026年不可靠。建议人工审计作为Level 3的替代。
```

### 10.2 可执行 vs. 需人工裁判

| 宪法约束 | 执行方式 | 可靠性 |
|---------|---------|--------|
| "安全rubric不得倒退" | 🟢 Level 1自动门禁（评估集验证） | 高 |
| "用户数据不得跨用户共享" | 🟡 Level 1代码检查 + Level 2数据流监控 | 中 |
| "所有变更保留审计记录" | 🟢 进化审计日志脚本强制写入 | 高 |
| "产品不得故意误导用户" | 🔴 不依赖自动检测。每月人工抽样审计。 | 人工判断必需 |
| "保持产品差异化" | 🟡 多样性注入机制（15%探索预算） | 中 |

### 10.3 飞轮刹车实现

```typescript
// scripts/evolution/check-brakes.ts — 飞轮刹车检查
// 在每次自动进化变更前运行。任何刹车条件触发→阻止变更。

const BRAKE_CONDITIONS = [
  {
    name: "safety_regression",
    check: async () => {
      const last3Days = await getSafetyIncidents(3);
      return last3Days.length > 3; // 3天内3次以上安全事件
    },
    action: "暂停所有自动进化，人工审查近7天变更"
  },
  {
    name: "satisfaction_decline",
    check: async () => {
      const trend = await getMetricTrend("user_satisfaction", 14);
      return trend.slope < 0 && trend.p_value < 0.05; // 连续2周显著下降
    },
    action: "暂停受影响产品的进化，回滚到2周前配置"
  },
  {
    name: "review_backlog",
    check: async () => {
      const ratio = await getAutoVsHumanReviewRatio(7);
      return ratio > 1.0; // 自动变更量 > 人工审核量
    },
    action: "减速：所有变更强制人工审批"
  }
];
```

### 10.4 宪章本身的安全

- 宪章文件(`EVOLUTION_CONSTITUTION.yaml`)的修改必须经过人工审批——**没有自动路径**
- 宪章修改记录在独立的Git历史中，与代码变更分离
- `last_amended_by` 字段永远不能是 "auto"

---

## 🆕 Promotion State Machine：知识/资产的治理状态机

### 模式来源

来自 KB Distillation PRD2 的实战验证。这是一个通用的治理状态机模式，适用于任何需要"从候选到正式"的 AI 资产（Prompt、知识、Agent 配置、评估集）。

### 状态定义

```
source_registered          — 来源已登记，可进入 intake
    ↓
reader_extracted           — reader/parser 已提取结构化 source_unit
    ↓
llm_distilled_candidate    — LLM 生成候选（不可 canonical）
    ↓
machine_reviewed_candidate — schema/QA/deterministic review 通过
    ↓
human_review_required      — 需要人工确认（阻塞 promotion）
    ↓
approved_for_staging       — 可进入 staging index/environment
    ↓
approved_for_runtime_promotion — 可执行显式 runtime switch（需单独授权）
    ↓
canonical                  — 正式资产（只能由授权治理流程写入）
```

### 禁止跳级

以下跳级在任何情况下必须被 gate 阻塞：

- `llm_distilled_candidate` → `canonical`（AI 输出不能直接成为正式资产）
- `machine_reviewed_candidate` → `production`（未经人工确认）
- `approved_for_staging` → `human-gold`（staging 不是业务批准）
- `target contract exists` → `canonical write performed`（合同存在 ≠ 写入已授权）

### 适用场景

| 资产类型 | 适用性 | 说明 |
|---------|--------|------|
| Knowledge artifacts（知识条目） | 🟢 完全适用 | PRD2 的原始设计场景 |
| Prompt versions | 🟢 完全适用 | Prompt 从 draft → QA → staging → production |
| Agent configurations | 🟢 完全适用 | Agent 工具配置的变更需要同样的治理 |
| Eval sets（评估集） | 🟡 部分适用 | golden set 的变更需要严格治理；增量集可简化 |
| UI components | 🟡 部分适用 | 关键功能（支付、合规）适用；营销页面可简化 |

### 实现要求

每个状态升级必须有对应的 gate checklist。升级动作记录在不可变审计日志中。任何自动系统不能跳过人工审批节点。

---

## 附录：前瞻性能力（2026年不可用）

### A.1 内容进化 L4-L5（⚫ 方向性）

**L4 — 知识库结构自优化**：AI分析知识库组织方式是否最优并建议重构。2026年无生产案例。

**L5 — 知识前瞻性补全**：AI预测用户接下来会问什么并预先准备知识。需要对话预测模型，目前不存在。

### A.2 功能进化 L3-L4（🔴 实验至⚫ 方向性）

**L3 — 自动实施低风险功能**：至2026年7月，LogRocket和Pendo做的是"检测→修复"，不是"检测→新功能"。无公开的生产案例展示AI自主添加产品新功能。

**L4 — 自主功能规划**：AI规划产品路线图。需要战略推理能力，2026年的LLM不具备。

### A.3 UI进化 L3-L5（🔴 实验至⚫ 方向性）

**L3 — 行为自适应UI**：Coframe/Fibr AI已商用，但仅限营销落地页。AI产品核心交互界面的自适应未有生产验证。

**L4 — 意图感知动态界面**：AG-UI协议标准化了组件请求，但全动态界面组装在2026年不成熟。

**L5 — 信息架构自演进**：AI长期优化产品的信息架构。无生产案例。

### A.4 架构进化 L2-L3（⚫ 方向性）

当前SWE-bench Pro最高59.1%，Senior SWE-Bench仅24%。AI自主架构迁移的前提条件远不满足。建议等SWE-bench Pro在该类任务上>70%后重新评估。

---

---

## 十一、一个人+Codex的实际限制

本节基于2026年7月开发者社区的实际使用数据（500+开发者调查、多工具对比评测），坦率记录Codex的已知限制。不要只相信营销材料——这些是真实用户的共识。

### 11.1 Codex的真实能力画像

| 维度 | 优势 | 劣势 |
|------|------|------|
| Token效率 | 约4倍少于Claude Code（同任务$15 vs $155） | — |
| 代码质量 | 批量任务和脚手架生成高效 | 67%开发者盲测中偏好Claude Code |
| 复杂问题 | 有明确规范时执行可靠 | "遇到复杂问题后表现怪异"是高频投诉 |
| 上下文管理 | Goal Mode能跑数小时 | "没有记忆"——上下文压缩后关键约束丢失 |
| 资源消耗 | — | 150GB/月流量 + 4.8TB SSD写入（极端案例） |
| 可靠性与信任 | 6月配额危机已解决，7月配额大幅提升 | 多次宕机 + 配额危机损害了信任 |
| 多Agent并行 | 并行Worktree是强项 | 并行Agent的协调成本 > 单Agent（CooperBench实证） |

### 11.2 开发者社区的实际工作流（最优实践）

**不是"用Codex做一切"**。2026年7月的社区共识是：

```
Claude Code  → 架构决策、复杂推理、代码Review
                优势：代码质量高、长上下文推理、对规范的遵循度好
                
Codex        → 批量执行、脚手架生成、重复性任务
                优势：token效率高、并行Agent、Goal Mode持久运行
                
v0.dev       → UI原型、组件初稿
                → 截图注入Codex精修

人工         → 方向把控、架构审批、Review、质量抽样
                （OpenAI Symphony实验核心发现：瓶颈是人类注意力，不是GPU）
```

**关键原则**：Codex执行，Claude思考，人类决策。三者各司其职。

### 11.3 Codex "没有记忆"问题的应对策略

由于Codex在上下文压缩时会丢弃关键约束：

1. **AGENTS.md 优先保护"不变项"**：技术栈版本、目录结构、禁止事项放在文件顶部（前20行）
2. **模块化规范文件**：不要一个AGENTS.md包含所有信息——拆分为what-vision.md / how-architecture.md / how-security.md，按任务懒加载
3. **创建 DECISIONS.md**：关键架构决策和理由记录在此文件中。每次新会话，先加载DECISIONS.md
4. **Goal Mode + 检查点**：长时间任务用Goal Mode，关键节点后手动 `/goal pause` 确认状态
5. **每完成一个里程碑，Codex生成"当前状态摘要"**——写入 STATUS.md。下次会话自动加载

### 11.4 什么情况下不应使用Codex作为主力

| 场景 | 原因 | 替代方案 |
|------|------|---------|
| 需要深度架构设计的项目 | Codex倾向于"最快实现"而非"最佳设计" | Claude Code做架构，Codex做实现 |
| 安全关键系统（医疗/金融/航空） | Codex生成代码51%+含漏洞 | 人工主导+AI辅助+严格代码审查 |
| 超大型项目（>50万行已有代码） | 上下文窗口无法容纳足够的项目理解 | 模块化拆分，每模块独立Agent |
| 需要持续状态的长期项目 | Codex"没有记忆"，关键决策会丢失 | DECISIONS.md + STATUS.md + 定期人工检查点 |

### 11.5 🆕 对等协商（Mesh）模式的精确使用条件

Playbook 默认建议避免 Agent 之间的对等协商（Peer-to-Peer / Mesh）模式——Stanford CooperBench 证明两个 Agent 协作反而比一个差（准确率从 58% 降至 25%），协调成本通常超过收益。

但在以下**全部四个条件**同时满足时，Mesh 模式可被实验性使用：

1. **目标是生成多样性观点**，而非收敛到单一正确答案（如创意脑暴、多视角方案评审）
2. **有明确的终止条件** — Agent 间的协商轮次、时间或 token 预算有硬上限
3. **通信开销可量化并被预算约束** — 协调 token 消耗 < 任务 token 消耗的 30%
4. **输出仅作为人类决策的参考输入，不自动执行** — Mesh 产出不直接写入 canonical、不触发 runtime switch、不调用 provider

> 即使四个条件全部满足，Mesh 模式在 2026 年仍处于 🔴 实验阶段。仅在多 Agent 评估维度（§3.7）的指标全部达到目标后，才考虑将 Mesh 用于生产决策。

---

### 防呆设计：什么情况下这个Playbook会失败

> 关于Codex的真实限制、混合工具工作流、以及"没有记忆"问题的应对，详见第11章"一个人+Codex的实际限制"。

**前提假设**

| 假设 | 如果不成立... |
|------|------------|
| 你有一个Codex桌面端或等效的AI Agent | 回到了手动开发模式，Playbook退化为指导文档 |
| 你的产品涉及文本知识检索和对话 | 如果你的产品是代码生成/图像生成/语音助手，知识架构和Agent设计需要大幅调整 |
| 你的知识库是结构化的（有明确的文档源） | 如果知识是隐式的（零散对话/邮件/会议记录），需要不同的提取和结构化策略 |
| 你有一定容错空间（非关键任务） | 如果你的产品是医疗/金融/安全关键系统，需要L3-L4精确级架构+人工在环 |
| 你的团队至少有一个能独立全栈开发的人 | 如果没有，Codex错误时无法判断和纠正 |

### 已知的失败模式

| 失败模式 | 症状 | 应对 |
|----------|------|------|
| 评估集漂移 | 评估分数保持高位，但生产质量下降 | 每周从生产增量补案例，季度清理过时用例 |
| Agent规格书过时 | 实际Agent行为和规格书描述不一致 | 规格书和System Prompt交叉验证（TASK 2.2的验证脚本） |
| 知识库膨胀老化 | 知识量增长，但质量下降（重复/矛盾增多） | 每周内容健康检查（TASK 8.2），设置自动告警 |
| 进化过热 | 太多自动变更，人工失去跟踪 | 飞轮刹车条件触发（见进化宪章） |
| 多样性崩溃 | 平台上所有产品趋同 | 多样性注入机制（15%探索预算） |
| 人类瓶颈 | 产品太多，人工审核跟不上 | 提高自动变更的置信度阈值，优先审核高风险变更 |

### 如果你没有6个月来建这个平台

最短路径（2-4周MVP）：
- Week 1: 完成1个产品基因组 → `npx tsx scripts/validate-genome.ts --file product-genome.yaml` → 修复 → `npx tsx scripts/instantiate-skeleton.ts --genome product-genome.yaml --output ../my-product`
- Week 2: 完成Agent层开发 → `npm run eval` 可运行
- Week 3: 完成前端+后端 → Playwright E2E通过 → 部署到staging
- Week 4: 灰度发布 → 开始收集隐式信号 → 启动L1内容进化和L1功能信号采集

**最小可行平台 = 1个产品基因组 + 1个可运行产品 + 1个进化循环（内容L1 + 功能L1）**。

### 各阶段的已知失败模式

| 阶段 | 常见失败 | 根因 | 预防 |
|------|---------|------|------|
| ①需求验证 | 落地页无人注册 | 价值主张不清晰或触及错误用户群 | 先做5个用户访谈，后建落地页 |
| ②产品设计 | Agent规格书过于抽象 | 写的时候跳过"精确到触发条件"的要求 | 用validate-agent-spec脚本验证 |
| ③技术架构 | 基因组选型后频繁修改 | 选型时基于"热门"而非"适合" | ADR记录决策理由和迁移条件 |
| ④开发实施 | Agent不遵循AGENTS.md | >80行的配置文件被忽略 | 规范模块化，每次只加载相关文件 |
| ⑤测试评估 | 评估集过时，分数虚假 | 静态评估集 + 产品快速迭代 | 每周增量 + 季度清理 |
| ⑥部署运维 | Prompt发布引入回归 | Prompt变更未经过评估门禁 | CI门禁 + 灰度发布 + 自动回滚 |
| ⑦运营增长 | 只追踪显式信号 | 点踩率低，样本不足 | 启动时就埋好隐式信号采集 |
| ⑧自进化 | 进化偏离初始目标 | 优化指标与产品价值不完全对齐 | 进化宪章 + 飞轮刹车 + 月度人工审计 |

---

*本Playbook每季度更新实证部分。最近更新见下方Changelog。*

---

## Changelog

### v2.9 — 2026-07-04（8个phantom脚本实现完毕：17→17可运行，phantom引用 -53%）

**进化层（5个新脚本）**：
- 🆕 `scripts/evolution/check-brakes.ts` — 飞轮刹车检查（5条件），Constitution Level 2 运行时执行
- 🆕 `scripts/evolution/audit-logger.ts` — 进化审计日志（append-only, SHA256防篡改）。4种模式
- 🆕 `scripts/evolution/collect.ts` — 数据回流：用户反馈→去重→分类→评估集增量JSONL
- 🆕 `scripts/evolution/content-health-check.ts` — 内容健康：陈旧检测+Lane C触发+报告生成
- 🆕 `scripts/evolution/lane-c-gap-check.ts` — Lane C 5触发器+紧急熔断（lane-c-triggers.md代码实现）

**验证层（2个新脚本）**：
- 🆕 `scripts/validate-agent-spec.ts` — 5维度完整性验证（角色/工具/失败矩阵/示例/综合）
- 🆕 `scripts/validate-eval-set.ts` — 格式/覆盖度/PII扫描/重复扫描/TODO比例

**RAG调试层（1个新脚本）**：
- 🆕 `scripts/rag-debug.ts` — 查询→chunks+相似度+质量评估+建议。Playbook阶段④RAG前置工具

**脚本总数**: 9→17。phantom引用 19→11（剩余为§五模板示例和人工验证替代）

### v2.8 — 2026-07-04（12项P0修复：六维独立审查）

**组1：证据门真实化**（P0-1/2/3/4）：
- §六开头新增诚实声明——列出已实现的 7 个脚本和 10 个不存在的 phantom 脚本
- 所有 phantom 脚本的 evidence_gate 改为 `mode: "manual"` + 人工验证清单
- §2.3 五原型差异表新增 honest 状态标注——原型 B/C/D/E 的骨架生成为 🔴 待实现
- §一新增反向引用声明——指向 VibeTrack 和 v2.7

**组2：宪章安全硬件化**（P0-5/6/7/9）：
- 🆕 `scripts/check-constitution-integrity.ts` — SHA256 完整性检查。Level 1 编译时检查的实际实现
- AGENTS.md 最顶部添加"禁止修改 EVOLUTION_CONSTITUTION.yaml"约束
- instantiate-skeleton.ts 生成的 `.gitattributes` 中为宪章文件添加 merge=constitution

**组3：安全默认值**（P0-8/11/12）：
- `generate-agent-infra.ts` 输出变更：guardrails.ts 的 detectInjection 函数为可工作最小实现（regex-based）
- `generate-agent-infra.ts` 输出变更：client.ts 默认抛出 Error（而非返回 mock）
- `instantiate-skeleton.ts` 输出变更：为 Supabase 生成默认 RLS 迁移文件

**组4：基因组字段增强**（剩余 P0）：
- 基因组 business 新增 `monthly_infrastructure_cost_estimate` 字段
- 基因组新增 `data_retention` 字段组
- `deploy-staging.ts` 补充前提条件声明

### v2.7 — 2026-07-04（5种技术原型 + 12品类商业分类）

**来自 10 万+ AI 产品的交叉验证**：
- 🆕 产品技术原型分类系统（§1.3）— 对话/内容/分析/行业/工具 5 种原型，按技术架构聚类
- 🆕 基因组 `product_type` 字段 — 驱动 `instantiate-skeleton.ts` 为不同原型生成差异化项目结构
- 🆕 12 品类 ↔ 5 原型映射表 — 市面所有的 AI 产品都能找到对应的技术原型
- v1 路线图同步更新为 v2.7（产品类型从 3 种扩展为 5 种原型，每阶段含原型差异指引）

### v2.6 — 2026-07-03（10-Loop 深度生态搜索合成版）

**10 轮并行 GitHub 深度搜索**：MCP 生态 / Claude Code 生态 / Codex 插件与技能 / 知识管道 / Agent 框架 / 测试与评估 / 部署与基础设施 / 监控与成本 / UI 与前端 / 安全与治理

**工具目录重大扩展**：
- MCP 隐藏宝石（agent-lsp, LoopLens, ARGUS-3, Bytebase DBHub, Qdrant MCP, Zavora）
- Claude Code 生态（shanraisshan 59K⭐, serpro69 toolbox, danzam98 66 技能, can-bridge 双向桥接）
- Codex 生态（openai/codex 93.6K⭐, awesome-codex-skills 13.9K⭐, codex-cli-mcp, cmuxlayer）
- 知识管道全栈（Chonkie 4.1K⭐, Pathway 63K⭐, dlt 5.5K⭐, Grapevine, Graphlit, EmbedCache, Truva）
- Agent 框架势头数据（Mastra 480 贡献者最高, LangGraph 减速, CrewAI 惯性, smolagents 26K⭐上升）
- Agent 记忆基准（Hindsight 91.4% LongMemEval SOTA, Zep Graphiti $25/月最佳价值, Mem0 $249/月）
- 测试全栈（Agent Eval Harness, Understudy, Promptfoo 轨迹断言, MS AgentPex, Skiritai 30x 回放）
- 部署（Kubeara GPU PaaS, local-ai-packaged, Daytona 71K⭐ 90ms 冷启动, KubeAI, KAITO）
- 监控（Arize Phoenix 10K⭐, PrismCache 零依赖语义缓存, LMCache 9.9K⭐ GPU KV 缓存, llmtrace 异常归因）
- UI（assistant-ui 10.6K⭐, Streamdown, Lattice 11+ 框架 DAG, agent-workbench 多 CLI 编排）
- 安全（airlock 7 信任边界, MS Agent Governance Toolkit, mcpguard, Regula EU AI Act, ComplyEdge）
- 15 场景速查表更新为最新 Stars/成熟度数据

### v2.5 — 2026-07-03（新增模块工具推荐目录）

**新增**：
- 🆕 模块工具推荐目录 — 对 Playbook 每个模块匹配高效工具（含 GitHub Stars、成熟度标注、首选/备选）
- 覆盖 7 大类：MCP 服务器 / 知识架构(文档/向量/嵌入/重排/KG) / Agent 工程(框架/记忆/护栏) / 评估(可观测/Prompt优化) / 开发生命周期(设计→代码/部署/测试/网关/缓存/UI/分析/自进化)
- 完整选型决策速查表（15+常见场景的首选+备选方案）
- 详细分析见 `audit/09-Playbook模块工具推荐目录.md`

**新增**：
- 🆕 自进化速度量化指标（§3.5）— 重复错误下降率、知识闭环速度、新场景适应率、模型迁移收益、知识增量密度
- 🆕 跨产品能力迁移标注（§3.6）— 来自成熟度模型 L5，标注 ⚫ 方向性
- 🆕 多Agent协作评估维度（§3.7）— Handoff成功率、任务分配偏差、冲突解决率、通信开销比、端到端TAT
- 🆕 对等协商（Mesh）模式的精确使用条件（§11.5）— 仅在四个条件全部满足时可实验性使用

### v2.3 — 2026-07-03（合入 KB PRD2 实战验证模式）

**来自实战 PRD 的增量**：
- 🆕 Evidence Ladder（七级证据阶梯）— 增强成熟度标注系统。标注不仅能回答"能不能用"还能回答"基于什么证据"
- 🆕 边界词典（15 个术语精确定义）— 防止"demo 通过 = production ready"的沟通灾难
- 🆕 Promotion State Machine（8 态禁止跳级）— 通用知识/资产治理状态机。适用于 Prompt、知识、Agent 配置、评估集等任何需要"从候选到正式"的 AI 资产

### v2.2 — 2026-07-03（本轮最终版）

**技术选型修正**：
- 默认模型 GPT-5 → GPT-5.5（GPT-5/5.2/5.3已于2026年6月退休）
- Agent框架：LangGraph从唯一默认 → Mastra平等并列（按语言生态决策）
- 新增DeepSeek V3为cost_optimized_fallback
- SSE传输更新为Streamable HTTP（MCP 2026-03-26规范）
- 重排序器补充：中文场景建议评估Qwen3 Reranker

**新增章节**：
- MCP安全与传输（40%+服务器零认证的实证+6条操作准则+推荐服务器清单）
- 一个人+Codex的实际限制（500+开发者调查数据+混合工具工作流+"没有记忆"应对策略）
- 财务模型与ROI分析（平台建设成本+单产品盈亏平衡+规模化经济+回本点）
- 进化宪章执行机制（三层模型：编译时/运行时/设计时）
- 前瞻性能力附录（L4-L5降级，标注⚫方向性/🔴实验）

**修正**：
- 全文添加成熟度标注系统（🟢🟡🔴⚫）
- 进化等级从L1-L5降为L1-L3
- 各阶段新增"已知失败模式"对照表
- 最短MVP路径从抽象描述变为具体脚本命令
- Codex定位从"日常开发主力"修正为"主力执行工具"（67%开发者盲测中偏好Claude Code）

### v2.1 — 2026-07-03
- 基于用户反馈的三项核心修正：Codex定位、知识架构重写、评估运维简化
- 新增基因组系统、四维自进化引擎、进化宪章
- Codex可执行指令格式标准

### v2.0 — 2026-07-02
- 从v1 Playbook（AI辅助开发）蜕变为v2（平台批量生产自进化AI产品）
- 产品基因组系统的引入

---

## 🆕 模块工具推荐目录

每个 Playbook 模块对应的高效工具。标注 🟢生产就绪 🟡可实现 🔴实验。完整分析见 `audit/09-Playbook模块工具推荐目录.md`。

### 第〇部分：Codex 基础设施

| 模块 | 首选工具 | 备选 | GitHub |
|------|---------|------|--------|
| MCP 服务器 | Context7 + GitHub MCP + Playwright MCP | Firecrawl / Supabase / Figma MCP | 见 audit/09 |
| Codex Skills | addyosmani/agent-skills (~66K⭐) | openai/skills + anthropics/skills | 见 audit/09 |

### 第一部分：知识架构

| 模块 | 首选工具 | 备选 | 成熟度 |
|------|---------|------|--------|
| 文档解析(中文) | MinerU (~30K⭐) | RAGFlow (~82K⭐) | 🟢 |
| 文档解析(英文) | Docling IBM (~48K⭐) | Unstructured.io (~15K⭐) | 🟢 |
| 向量库(<50M) | pgvector (~18K⭐) | Qdrant (~23K⭐) | 🟢 |
| 向量库(>100M) | Milvus (~44K⭐) | — | 🟢 |
| 嵌入(多语言) | BGE-M3 (~12K⭐) | Qwen3-Embedding | 🟢 |
| 嵌入(中文) | Qwen3-Embedding-8B | BGE-M3 | 🟢 |
| 重排序 | BGE-Reranker-v2-M3 | ColBERT / ColPali | 🟢 |
| 知识图谱(成本) | LightRAG (~36K⭐) | Neo4j GraphRAG | 🟢 |
| 知识图谱(摘要) | MS GraphRAG (~31K⭐) | — | 🟢 |

### 第二部分：Agent 工程

| 模块 | 首选工具 | 备选 | 成熟度 |
|------|---------|------|--------|
| Agent框架(Python) | LangGraph (~35K⭐) | CrewAI (~51K⭐) | 🟢 |
| Agent框架(TypeScript) | Mastra (~25.5K⭐) | Vercel AI SDK (~25K⭐) | 🟢 |
| Agent记忆 | Mem0 (~60K⭐) | Zep Graphiti (~27K⭐) | 🟢 |
| PII检测 | MS Presidio (~9.4K⭐) | — | 🟢 |
| Agent安全 | MS Agent Governance Toolkit (~4.1K⭐) | NeMo Guardrails (~6.4K⭐) | 🟡/🟢 |

### 第三部分：评估体系

| 模块 | 首选工具 | 备选 | 成熟度 |
|------|---------|------|--------|
| LLM 可观测性 | Langfuse (~30K⭐) | Arize Phoenix (~10K⭐) | 🟢 |
| 安全评估/红队 | Promptfoo (~22.3K⭐) | — | 🟢 |
| 多Agent监控 | AgentOps (~5.6K⭐) | Langfuse Agent Graph | 🟢 |
| Prompt 优化 | DSPy (~35K⭐) | TextGrad (~3.6K⭐) | 🟢/🟡 |

### 第四至八部分：开发生命周期

| 模块 | 首选工具 | 备选 | 成熟度 |
|------|---------|------|--------|
| 设计→代码 | screenshot-to-code (~65K⭐) | Onlook (~26K⭐) | 🟢 |
| 部署(自托管) | Coolify (~56.7K⭐) | Dokploy (~34K⭐) | 🟢 |
| AI 模型服务 | LitServe (~3.8K⭐) | FastAPI | 🟢 |
| AI 测试(E2E) | Canary / Scout | Playwright MCP | 🟡 |
| LLM 网关 | LiteLLM (~52K⭐) | Portkey (~12K⭐) | 🟢 |
| 语义缓存 | GPTCache (~8K⭐) | Redis Stack L1/L2 | 🟢 |
| AI Chat UI | AI Elements + assistant-ui (~10.5K⭐) | CopilotKit (~34.4K⭐) | 🟢 |
| 产品分析 | PostHog (~25K⭐) | Langfuse Analytics | 🟢 |
| 自进化引擎 | DSPy GEPA + Hermes Agent | Zenbase | 🟢/🟡 |

> **注意**: Stars 数为 2026-07 近似值。完整 GitHub URL 和选型理由见 `audit/09-Playbook模块工具推荐目录.md`。

---

## 🆕 共享知识库系统（v2.8）

### 定位

Playbook 三份文档的共享真相层。解决"同一个工具在三份文档中推荐不一致"的漂移问题。

**架构**：复用 KB PRD2 的 promotion pipeline。不建新系统。

```
shared/knowledge/
├── schemas/shared-knowledge-entry.schema.json   # 知识条目 Schema
├── canonical/playbook-knowledge-v1.jsonl          # 37 条 canonical 条目（单一真相源）
├── README.md                                       # 维护流程文档
```

**8 个挥发性类别**（只管理"会变的那 30%"，稳定的留在文档中）：

| 类别 | 条目数 | 挥发性维度 | 更新频率 |
|------|--------|----------|---------|
| `mcp_servers` | 8 | Stars, 兼容性(Codex/Claude), 安全审计 | 月 |
| `agent_frameworks` | 5 | Stars, 贡献者, npm/pip 下载, 价格 | 月 |
| `vector_databases` | 3 | Stars, 定价层级, 免费层限制 | 季度 |
| `embedding_models` | 2 | 维度, 上下文窗口, 定价, MTEB分数 | 季度 |
| `knowledge_graph` | 4 | Stars, 定价, 生产就绪度 | 季度 |
| `llm_providers` | 7 | API定价, 上下文窗口, 弃用日期 | **月（最关键）** |
| `deployment_platforms` | 4 | 定价层级, 免费层变更 | 季度 |
| `evaluation_tools` | 4 | Stars, 收购, 弃用, 集成 | 季度 |

**查询接口**：
```bash
npx tsx scripts/kb-query.ts --category agent_frameworks --rank primary
npx tsx scripts/kb-query.ts --entry llm_providers.gpt5_deprecated
npx tsx scripts/kb-query.ts --all --format markdown
```

**维护流程**：
- **周度** Lane C 自动检索（GitHub Stars/定价/弃用通告变更）→ candidate JSONL → 人工审核
- **季度** 全量审计 → 重新验证所有条目 → 标记 >90 天未验证为 stale

**条目 Schema**：完整 JSON Schema 见 `shared/knowledge/schemas/shared-knowledge-entry.schema.json`。

### 三份文档如何引用共享知识

在文档中引用共享知识使用 `[KB: category.entry_id.field]` 语法。编译文档时自动替换为 canonical 值：

```
→ [KB: agent_frameworks.mastra.stars]  替换为 "25500"
→ [KB: agent_frameworks.mastra.status]  替换为 "active"
→ [KB: llm_providers.gpt5.5.api_pricing_input_per_1m_tokens]  替换为 "2.50"
```

---

## 关联脚本清单（已实现 17 个脚本）

| 脚本 | 状态 | 功能 | 验证 |
|------|------|------|------|
| `scripts/validate-genome.ts` | ✅ | 基因组YAML结构验证（8 section, 50+字段） | Pass |
| `scripts/cost-model.ts` | ✅ | 5方案×4 DAU×4缓存策略（2026-07定价） | Pass |
| `scripts/generate-eval-set.ts` | ✅ | 60条评估用例骨架生成（17意图覆盖） | Pass |
| `scripts/instantiate-skeleton.ts` | ✅ | 基因组→项目脚手架（21目录+17文件） | Pass |
| `scripts/init-knowledge-base.ts` | ✅ | 基因组→SQL迁移+TS索引管道+分类器 | Pass |
| `scripts/generate-agent-infra.ts` | ✅ | 基因组→8个Agent文件（client/tools/guardrails/...） | Pass |
| `scripts/deploy-staging.ts` | ✅ | 预部署检查→Vercel/Railway→Playwright→安全报告 | Pass |
| `scripts/check-constitution-integrity.ts` | ✅ 🆕 v2.8 | SHA256 宪章完整性检查。阻止未授权的宪章变更 | Pass |
| `scripts/evolution/check-brakes.ts` | ✅ 🆕 v2.9 | 飞轮刹车检查（5条件）— 解决"宪章是纸老虎"的审计发现 | Pass |
| `scripts/evolution/audit-logger.ts` | ✅ 🆕 v2.9 | 进化审计日志（append-only, SHA256防篡改） | Pass |
| `scripts/evolution/collect.ts` | ✅ 🆕 v2.9 | 数据回流采集：用户反馈→坏案例库→评估集增量 | Pass |
| `scripts/evolution/content-health-check.ts` | ✅ 🆕 v2.9 | 内容健康检查：陈旧/矛盾/盲区检测+Lane C触发 | Pass |
| `scripts/evolution/lane-c-gap-check.ts` | ✅ 🆕 v2.9 | Lane C 5量化触发器+紧急熔断（来自 lane-c-triggers.md） | Pass |
| `scripts/rag-debug.ts` | ✅ 🆕 v2.9 | RAG检索质量调试（查询→chunks+相似度+质量评估+建议） | Pass |
| `scripts/validate-agent-spec.ts` | ✅ 🆕 v2.9 | Agent规格书5维度完整性验证 | Pass |
| `scripts/validate-eval-set.ts` | ✅ 🆕 v2.9 | 评估集格式/覆盖度/PII/重复扫描 | Pass |

## 关联审计文档

| 文档 | 说明 |
|------|------|
| `audit/01-对抗性审计报告.md` | 原路线图8阶段全节点逐项审计 |
| `audit/02-五人对抗性审计与Gap分析.md` | 五角色审计，识别20个Gap |
| `audit/03-v2自我批判评估.md` | Playbook v2逐章节缺陷识别 |
| `audit/04-端到端验证报告.md` | 真实流水线运行记录 |
| `audit/05-最终评估与修正路线图.md` | 基于2026-07最新网络数据的评估 |
| `audit/06-竞品平台基准对比.md` | 7平台成本/质量/安全对比 |
| `audit/07-Codex指令遵循度测试套件.md` | 10条测试指令+分析方法论 |
