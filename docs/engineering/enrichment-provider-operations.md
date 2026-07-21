# AI Enrichment Provider Operations

**状态**：本地 reference implementation 与 Pilot Control Plane；默认关闭；`provider_call=false`；`production unchanged`
**适用范围**：已经写入 Capture Store、通过完整性校验的不可变来源快照

## 运行边界

- Job Policy 只允许三个显式 profile：OpenAI Responses `POST https://api.openai.com/v1/responses`、DeepSeek Chat Completions `POST https://api.deepseek.com/chat/completions`、Kimi 中国区 Chat Completions `POST https://api.moonshot.cn/v1/chat/completions`。未知 Provider fail-closed。
- OpenAI 使用 strict JSON Schema `output_text`；DeepSeek 使用强制单一 strict function call；Kimi 使用 `response_format=json_schema`。三者都显式处理截断/拒绝、HTTP 错误和 usage，不保存 `reasoning_content`。
- 不抓取 URL，不接受浏览器文件路径，不接收或保存隐藏推理。
- 不自动重试。原始 v1 ledger 每次请求先写 `reserve`，再写 `succeeded` 或 `failed`；这些 outcome 仅表示 Provider transport/structured parse 层完成或失败，不表示产品 candidate 已持久化。对外 projection 使用 `provider_succeeded/provider_failed` 与 `providerCompletedCalls/providerFailedCalls`，产品成功必须另外存在 Enrichment result。
- API key 只从绝对路径的只读 regular file 读取；拒绝 symlink、group/world writable 文件，不进入日志或状态响应。
- 没有有效 job policy、环境与 policy 不一致、过期、Capture 不在 allowlist、预算耗尽或账本损坏时全部 fail-closed。

## 一次性精确解锁包

先从三份真实内置 Markdown 生成 create-only 本地包。生成器固定选择 20 个原子章节（VibeTrack 6、Pro 7、Playbook 7），不会抓取 URL、不会复制整份文档，也不会创建或读取 API key：

```bash
npm run pilot:unlock-pack -- \
  --output-dir /absolute/existing-parent/pilot-<identity> \
  --api-key-file /absolute/operator-managed/provider-api-key \
  --provider deepseek
```

- `--provider` 可选 `openai|deepseek|kimi`，省略时保持兼容默认 `openai`。每个包只绑定一个 Provider/模型，禁止同一 policy 在运行时切换。
- 当前主 pilot 使用 exact `deepseek-v4-flash`，关闭 thinking，通过 strict function schema 返回结构化结果；依据 [DeepSeek 当前模型/价格页](https://api-docs.deepseek.com/quick_start/pricing)和[Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)。不要使用即将弃用的 `deepseek-chat/reasoner` alias。
- Kimi 备用 profile 固定 `kimi-k2.6`、关闭 thinking、使用 Structured Output；依据 [Kimi 模型列表](https://platform.kimi.com/docs/models)和[Chat Completions API](https://platform.kimi.com/docs/api/chat)。Kimi 不会自动作为第二模型重复外发，另一次复核需要独立 policy/plan/gold 归因。
- OpenAI 兼容 profile 仍固定 `gpt-5.6-terra`，来源为[当前模型指南](https://developers.openai.com/api/docs/guides/latest-model)和[数据控制表](https://developers.openai.com/api/docs/guides/your-data#api-endpoint-tool-and-model-support)。
- exact budget 为 20 calls、每条最多 24KiB 输入、900 output tokens、30 秒 timeout；policy/plan 身份窗口 24 小时，真实 canary 仍只能由独立 15 分钟 Stage Receipt 开放一条。
- data egress 只允许选中章节正文以及 `captureId`、`sourceHash`；不发送本地路径、源文件名、Owner 身份、其他文档内容或 secret。
- output parent 必须是已存在的绝对真实目录；目标 pack 目录必须不存在。生成过程使用 sibling staging，完整后原子 rename；失败清理 staging，重复执行不会覆盖旧包。
- API key file 不存在时，包仍会完成并以 exit `2` 返回 `awaiting_secret_install`。这表示本地 L2 准备完成，不是错误重试信号，也不是授权或 Provider readiness。
- API key 只由 operator 在包外路径安装。生成器最多检查 regular-file、symlink、权限和 size metadata，不读取、复制或输出 key 内容。

包内容：

```text
captures/                                  20 个不可变来源快照
enrichments/                               空结果目录
gold/                                      空独立人工标注目录
job-policy.json                            exact model/budget/egress/cohort
pilot-plan.json                            policy hash + 1/19 stages + annotator
pack-manifest.json                         L2 状态、来源 hash 与模型依据
operator-env.sh                            仅路径与非秘密配置
canary-stage-authorization.template.json   unsigned、不可被 runtime 消费的模板
```

生成器不会创建 `provider-ledger.jsonl`、`authorization-request.json` 或 `stage-authorization.json`。安装 secret 后，由 operator `source operator-env.sh`，再运行下文 `pilot:authorization-request`；只有输出达到 `ready_for_receipt`，才能基于 exact request hashes 另建 Stage Receipt。

## 精确授权文件

真实调用前，由变更责任人创建权限不高于 `0640` 的 JSON 文件，并明确填写实际值：

```json
{
  "schemaVersion": "doccanvas-enrichment-job-policy-v1",
  "jobId": "replace-with-approved-job-id",
  "approvalId": "replace-with-approval-record-id",
  "approvedBy": "replace-with-accountable-owner",
  "approvedAt": "2026-07-19T00:00:00Z",
  "validFrom": "2026-07-19T00:00:00Z",
  "validUntil": "2026-07-19T01:00:00Z",
  "providerId": "deepseek",
  "modelId": "deepseek-v4-flash",
  "promptVersion": "knowledge-enrichment-v2",
  "allowedCaptureIds": ["exactly-20-unique-capture-ids"],
  "dataEgress": {
    "sourceText": true,
    "metadata": ["captureId", "sourceHash"],
    "classification": "Source text and the two listed identifiers may be sent to DeepSeek for this job only."
  },
  "limits": {
    "maxCalls": 20,
    "maxInputBytes": 65536,
    "maxOutputTokens": 800,
    "timeoutMs": 30000
  }
}
```

`modelId`、有效窗口、Capture allowlist 和 limits 不得由应用推断。策略文件的 canonical hash 会绑定预算账本；同一 `jobId` 改写策略会被拒绝。

Pilot 必须额外提供与策略 hash 精确绑定的计划文件。计划固定 20 条唯一 Capture、1 次 canary、canary 后暂停和最多 19 次 batch；人工 gold annotator 不能等于 job policy 的 `approvedBy`：

```json
{
  "schemaVersion": "doccanvas-enrichment-pilot-plan-v1",
  "pilotId": "replace-with-pilot-id",
  "jobId": "replace-with-approved-job-id",
  "jobPolicyHash": "sha256:<canonical-policy-hash>",
  "createdAt": "2026-07-19T00:00:00Z",
  "validUntil": "2026-07-19T01:00:00Z",
  "cohortCaptureIds": ["exactly-20-unique-capture-ids"],
  "humanGold": {
    "assignmentId": "replace-with-assignment-id",
    "annotator": "replace-with-independent-annotator",
    "dueAt": "2026-07-19T08:00:00Z",
    "requiredCount": 20,
    "independentSourceReview": true,
    "modelOutputNotCopied": true
  },
  "stages": { "canaryCalls": 1, "batchCalls": 19, "pauseAfterCanary": true }
}
```

示例中的占位数组必须在实际文件中替换为 20 个完整 Capture ID；策略 allowlist 与 plan cohort 必须是完全相同的集合，不做静默交集或缩窄。

## 环境契约

以下变量必须同时存在，且 Provider/模型与 policy 精确一致：

```text
DOCCANVAS_ENRICHMENT_MODE=provider
DOCCANVAS_ENRICHMENT_PROVIDER=<openai|deepseek|kimi exactly matching policy>
DOCCANVAS_ENRICHMENT_MODEL=<exact authorized model>
DOCCANVAS_ENRICHMENT_JOB_POLICY_FILE=/absolute/path/job-policy.json
DOCCANVAS_ENRICHMENT_API_KEY_FILE=/absolute/path/provider-api-key
DOCCANVAS_ENRICHMENT_LEDGER_PATH=/absolute/path/provider-ledger.jsonl
DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE=/absolute/path/pilot-plan.json
DOCCANVAS_ENRICHMENT_STAGE_AUTHORIZATION_FILE=/absolute/path/stage-authorization.json
DOCCANVAS_ENRICHMENT_CANARY_REVIEW_FILE=/absolute/path/canary-review.json
DOCCANVAS_ENRICHMENT_GOLD_COMPLETION_FILE=/absolute/path/gold-completion.json
```

后三项 evidence file 仅在对应阶段存在。只设置 API key 不会启用 Provider；`ready_for_canary` 只是预检，只有当前 Stage Authorization Receipt 通过后才会显示 receipt 范围内的执行入口。

## Pilot Authorization Request Pack

在创建 Stage Authorization Receipt 之前，先生成脱敏、可哈希的 L2 授权请求：

```bash
npm run pilot:authorization-request

npm run pilot:authorization-request -- \
  --output /absolute/existing-directory/pilot-authorization-request.json
```

- stdout 与 `--output` 使用同一个 server projection；指定输出时以 `wx`、`0640` create-only 写入，已存在文件不会覆盖。
- request 绑定当前 policy hash、plan hash、requested stage、exact Capture scope、ledger baseline、预算、数据外发声明和 blockers；不包含 source text、secret 内容或 secret/server path。
- request 固定 `evidenceGrade=L2-fixture-or-dry-run`、`providerCall=false`、`authorizationGranted=false`。即使当前 Stage Receipt 已存在，request 也只能报告 `receipt_present`，不能自行授予权限。
- blocked/not-configured 时 CLI 仍输出诊断 JSON，但 exit code 为 `2`；生成 request 不创建 ledger、不创建 receipt、不调用 Provider。
- Enrichment Workspace 的桌面 Owner 会话可以从受保护的只读 API 导出同一 request；移动端不显示导出和 request scope。

审批人应以 request 中的 `requestHash + policyHash + planHash + requestedStage + requestedCaptureIds + ledgerBaseline` 为审批对象，再独立创建 Stage Authorization Receipt。普通“继续”、request 文件本身或 `ready_for_receipt` 状态均不构成调用授权。

## Stage Authorization Receipt

Stage receipt 是独立于 plan 的短期调用授权。Canary receipt 只能覆盖 cohort 第一条 Capture：

```json
{
  "schemaVersion": "doccanvas-enrichment-stage-authorization-v1",
  "authorizationId": "replace-with-canary-authorization-id",
  "pilotId": "replace-with-pilot-id",
  "pilotPlanHash": "sha256:<canonical-plan-hash>",
  "jobPolicyHash": "sha256:<canonical-policy-hash>",
  "stage": "canary",
  "authorizedBy": "replace-with-accountable-approver",
  "authorizedAt": "2026-07-19T00:00:00Z",
  "validUntil": "2026-07-19T00:30:00Z",
  "expectedReservedCalls": 0,
  "maxNewCalls": 1,
  "allowedCaptureIds": ["capture-<first-cohort-id>"]
}
```

Batch receipt 只能在 canary 成功并完成 review 后建立，覆盖剩余 19 条 Capture，并绑定 canary reservation 与 review hash：

```json
{
  "schemaVersion": "doccanvas-enrichment-stage-authorization-v1",
  "authorizationId": "replace-with-batch-authorization-id",
  "pilotId": "replace-with-pilot-id",
  "pilotPlanHash": "sha256:<canonical-plan-hash>",
  "jobPolicyHash": "sha256:<canonical-policy-hash>",
  "stage": "batch",
  "authorizedBy": "replace-with-accountable-approver",
  "authorizedAt": "2026-07-19T01:00:00Z",
  "validUntil": "2026-07-19T02:00:00Z",
  "expectedReservedCalls": 1,
  "maxNewCalls": 19,
  "canaryReservationId": "sha256:<first-reservation-id>",
  "canaryReviewHash": "sha256:<canonical-review-hash>",
  "allowedCaptureIds": ["exactly-the-remaining-19-capture-ids"]
}
```

实际数组必须替换为完整且唯一的 Capture ID。Receipt 的检查与 budget/duplicate 检查在同一个 provider ledger lock 内完成，并在 append `reserve` 前执行；路由外预检不能替代该原子门。

## 分阶段硬门

Provider 输入由 Store 确定性附加 `sourceLanguage` 和 Capture 当前稳定 `domain_refs`。三个 Provider adapter 使用同一 prompt contract：title、summary、key points、abstentions 保持明确的来源主语言；dynamic JSON Schema 将稳定 domain refs 作为 exact 闭集，Store 在落盘前再次验证。`mixed/und` 不做伪精确语言判断；domain refs 的替换、扩张、缺失或重复始终失败。

1. `ready_for_canary`：plan、policy hash/window、20 条 Capture 完整性、exact allowlist、20-call 预算和 secret metadata 全部通过；仍须提供绑定当前 plan hash 的 canary Stage Receipt。
2. `canary_review_required`：canary projection 必须为 `provider_succeeded`、usage 完整且对应 Enrichment result 已持久化；只有前一条件时保持 `canary_result_missing`。
3. `ready_for_batch`：人工 review 文件绑定 plan hash 与首个 reservation，且 schema、来源落地、敏感数据、usage、来源主语言保持、稳定 domain taxonomy 六项检查全部为 true；随后还须提供绑定 reservation/review hash 的 batch Stage Receipt。review 之前出现第二个 reservation 会 fail-fast。
4. `ready_for_evaluation`：20 个成功且 usage 完整的 reservation、20 个匹配当前 source hash 的 Provider result、20 条人工 gold 和 Gold Completion Receipt 全部一致。

Canary review 是人工管理的不可变证据文件：

```json
{
  "schemaVersion": "doccanvas-enrichment-canary-review-v2",
  "pilotId": "replace-with-pilot-id",
  "pilotPlanHash": "sha256:<canonical-plan-hash>",
  "reservationId": "sha256:<first-reservation-id>",
  "decision": "approved_for_batch",
  "reviewedBy": "replace-with-reviewer",
  "reviewedAt": "2026-07-19T00:15:00Z",
  "checks": {
    "schemaValid": true,
    "sourceGrounded": true,
    "sensitiveDataAcceptable": true,
    "usageAccepted": true,
    "sourceLanguagePreserved": true,
    "domainTaxonomyPreserved": true
  }
}
```

## Human-gold 批处理

1. 桌面 Owner 从 Enrichment Lab 导出最多 20 条空白任务；任务只包含不可变 `sourceText`、source hash、行数和当前 gold CAS 引用。
2. 标注人只读来源，不查看或复制模型输出；完成包必须声明 `independentSourceReview=true` 与 `modelOutputNotCopied=true`。
3. 导入前验证 pack/source hash、行数、实时来源漂移、evidence locator 和当前 gold revision/hash。
4. 每条导入使用确定性 mutation ID；中途失败可重放同一完成包，已经写入的 revision 不会重复增加。
5. 模型结果、fixture 和 extractive draft 永远不会自动成为 human-gold 或 canonical。

Gold Store 本身不能证明“谁独立完成了整批任务”。因此最终 gate 还要求由 plan 中 annotator 形成 Gold Completion Receipt，绑定 assignment、原始 task pack、20 个 Capture ID 和当前 source hash：

```json
{
  "schemaVersion": "doccanvas-enrichment-gold-completion-v1",
  "pilotId": "replace-with-pilot-id",
  "pilotPlanHash": "sha256:<canonical-plan-hash>",
  "assignmentId": "replace-with-assignment-id",
  "taskPackId": "gold-pack-<24-hex>",
  "taskPackHash": "sha256:<task-pack-hash>",
  "completedBy": "replace-with-assigned-annotator",
  "completedAt": "2026-07-19T02:00:00Z",
  "independentSourceReview": true,
  "modelOutputNotCopied": true,
  "items": [{ "captureId": "repeat-for-exactly-20-items", "sourceHash": "sha256:<source-hash>" }]
}
```

Plan、stage authorization、review 与 completion 文件只接受绝对路径下的 regular JSON file，拒绝 symlink、group/world writable、超限和非法 UTF-8/JSON。文件一旦被 readiness 消费，不应原位覆盖；变更应创建新的 pilot/evidence identity。

## Readiness 门

默认策略要求至少 20 条与当前来源 hash 匹配的独立 gold，并同时满足：分类 exact match ≥ 90%，标题 token F1 ≥ 70%，摘要 token F1 ≥ 70%，要点覆盖 ≥ 70%，invalid locator ≤ 0%，schema failure ≤ 0%。样本不足返回 `insufficient_data`；任一质量门失败返回 `failed`。

本地 mock transport、fixture、单条 gold 和 UI smoke 只证明契约可执行，不证明真实模型效果。真实 pilot 仍需对精确 plan 先授权 1-call canary，复核后再单独授权剩余批次；readiness、普通“继续”或历史授权不会自动获得调用权限。
