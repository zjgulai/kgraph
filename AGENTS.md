# AGENTS.md — DocCanvas 项目约束

## 项目与证据边界

DocCanvas 是基于 Next.js 15、DOM 节点与单一 SVG 关系层的 Markdown 知识画布。`documents/` 中三份内置 Playbook 快照和用户 Markdown 是内容事实源；文件系统承担文档、presentation、修订、事务与素材持久化，localStorage 只作为个人视图兜底，不使用数据库。

- 本地测试、候选 image smoke、生产只读检查、远端替换和生产验收是不同证据层级，不得互相替代。
- production 默认 fail-closed 为 `readonly`；活动发布 Compose 显式配置 `owner`。未取得针对精确 commit、image digest、backup checksum 与变更窗口的最终授权，不执行腾讯云、Nginx、DNS、TLS、容器替换或真实生产写入。
- 每次重新核验 branch、HEAD、upstream 与工作树；禁止把 dirty tree、未推送 commit 或旧 candidate 冒充可追溯 release。

## 启动顺序

1. 读取本文件、用户最新指令，以及存在时的 `../AGENTS.md`、`.kiro/plan/task_plan.md`、`.kiro/plan/progress.md`。
2. 涉及画布、Owner 写入或发布时，读取 `docs/engineering/factory-scene-v3.md` 与 `deploy/tencent/PRODUCTION-RUNBOOK.md`。
3. 写入前执行 `git status --short --branch`，保留非本任务改动。
4. 先搜索 `lib/shared/document-registry.ts`、`lib/markdown/sections.ts`、`lib/server/document-mutations.ts` 与相关测试，确认现有契约后再实现。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm ci` | 按 lockfile 干净安装；不得在含用户依赖改动的共享树中盲目执行 |
| `npm run dev` | 本地开发，实际绑定以终端输出为准 |
| `npm run typecheck` | TypeScript strict 检查 |
| `npm test` | 执行全部 `node:test` 回归 |
| `npm run build` | 生成 Next standalone production build |
| `npm run test:e2e` | build 后执行 Chromium、WebKit 与移动端 Playwright |
| `npm run verify:local` | 依次执行 typecheck、test、build |
| `bash -n scripts/tencent/*.sh` | 腾讯云候选与运行脚本语法检查 |

项目没有 lint script；不得声称 lint 已通过。非琐碎改动至少运行相关测试与 typecheck；核心数据流、运行配置或用户可见行为变化运行完整 unit、build 和相关 Playwright。

## 架构与事实源

```text
app/                              Next.js App Router 与 API routes
components/canvas/                DOM 画布、SVG 关系层、Owner/关系 Inspector
lib/parser/                       Markdown -> DocCanvas graph
lib/canvas/architecture-view-model.ts  业务建筑投影
lib/canvas/layout-engine.ts       确定性建筑布局
lib/canvas/factory-layout.worker.ts    Worker 全量布局入口
lib/canvas/factory-scene.ts       scene materialization、增量重路由、空间索引
lib/canvas/orthogonal-router.ts   统一端口与正交路由契约
lib/canvas/presentation-sidecar.ts     模块档案、节点类型与软删除 sidecar
lib/server/document-mutations.ts  CAS、journal、snapshot、revision 与恢复
lib/server/write-guard.ts         readonly/dev/Owner 会话边界
lib/shared/document-registry.ts   文档注册表与路径单一事实源
opendesign/.../tokens/            画布语义设计 token 单一事实源
```

主数据流：

```text
Markdown -> parseMarkdownToGraph() -> applyDocumentSidecar()
  -> buildArchitectureViewModel() -> worker computeArchitectureLayout()
  -> materializeFactoryScene() -> DOM nodes + one SVG relation layer

Owner mutation -> HttpOnly session + same-origin guard -> revision/hash CAS
  -> write-before snapshot + transaction journal -> atomic Markdown/sidecar replace
  -> reparse + scene validation -> audit + revision retention
```

- `FactorySceneCanvas` 是唯一桌面运行时画布；禁止重新引入 React Flow、`@xyflow/react` 或旧运行时 feature flag。
- 统一端口 ID 为 `top-in/out`、`bottom-in/out`、`left-in/out`、`right-in/out`；模型、路由与 SVG hit path 边数必须一致。
- 路径只使用确定性正交 `M/L` waypoint；禁止随机布局、自由贝塞尔和穿越节点的长期路径。
- 拖动中端点即时跟随，受影响边最多每 50ms 增量重路由，释放后精确重路由；直接拖动不得添加 transform transition。
- tracer 只在 hover/focus/选中/搜索/进入/拖动完成时单次运行 220–280ms；reduced motion 禁止路径位移动画。
- 视口通过空间索引与 overscan 虚拟化，规模夹具最多同时渲染 350 DOM 节点和 700 SVG path。
- `DocNode.content` 是源章节 raw Markdown body；`contentBlocks` 只用于展示，禁止反序列化后写回。
- presentation sidecar 可改模块档案、节点类型和软删除，不得把视觉字段写进 Markdown。
- 关系只由 Markdown 层级和确定性结构规则生成；关系 Inspector 只读，禁止手动画线与关系编辑。
- 画布 CSS 与 canvas component 不得出现裸十六进制颜色；只消费 `doccanvas-product-factory` 语义 token。
- 八岗位、环境和人物映射由 `lib/canvas/factory-presentation.ts` 统一提供；desktop/mobile 不得重建另一份映射。
- 移动端始终只读，并用纵向流程轨保留关系语义；不得持久化隐藏桌面 viewport。

## Owner 写入契约

| 模式 | 行为 |
|---|---|
| 非 production、未配置 | `dev`，本地可写 |
| `NODE_ENV=production` 默认 | `readonly`，所有写 API 返回 403 |
| `DOCCANVAS_WRITE_MODE=owner` | secret file 完整时可登录；未登录写入 401、跨站写入 403 |

- token 与 session secret 优先且在生产只允许通过 `DOCCANVAS_ADMIN_TOKEN_FILE`、`DOCCANVAS_SESSION_SECRET_FILE` 注入。
- 登录签发 8 小时 `HttpOnly + Secure + SameSite=Strict` cookie；前端不得使用 local/sessionStorage token 或自定义 token header。
- mutation 必须携带 `baseRevision` 与 `baseDocumentHash`；冲突返回 409，禁止 last-write-wins。
- 顶层模块可编辑与排序但不可新增/删除；子节点可新增、修改、复制、移动和软删除；关系自动重建。
- 每次写入先创建 snapshot 和 journal；失败保持旧版本并 fail-fast。至少保留最近 50 个修订和全部 30 天内修订；恢复本身创建新修订。
- Markdown 不得由 route handler 直接覆盖；使用 server mutation/precise sync 与 atomic file helpers。
- 肖像只接受 JPG/PNG/WebP、最大 5MB/1200 万像素，规范化为 800×1000 WebP、移除元数据并按内容 hash 保存。

## 发布拓扑

目标 `101.34.52.232` / `kgraph.lute-tlz-dddd.top` 使用独立 Compose project `doccanvas-kgraph`：app 只在 internal network，edge 是唯一加入共享 proxy network 的 endpoint，无 host port。不得执行 PM2 路线、安装/重启 Docker daemon、修改 `daemon.json`、prune 或让 app 直接加入共享网络。

- rootfs 保持 read-only；只有 `/data` bind mount 可写，业务数据 UID/GID 固定 `10001:10001`。
- `prepare-owner-data.sh` 只补缺失种子并拒绝 symlink；`backup-owner-data.sh` 只在写入静默时生成 create-only checksum snapshot。
- 不自动回滚。上一不可变 image 与发布前 snapshot 只用于 Owner 再次授权后的硬故障事故恢复。
- standalone 必须包含 `public/`、`.next/static/`、Sharp native trace 和 OpenDesign token source。

## 禁止事项

- 不从 `'node:crypto'` 导入；使用 `'crypto'`。
- 不在多个文件重复定义文档路径；使用 `document-registry.ts`。
- 不用 `Math.random()` 进行布局。
- 不在 CardNode 用 JS 截断标题；使用 CSS line clamp。
- 不修改/跳过测试制造通过，不把 fixture/local smoke 写成 production passed。
- 不使用 `git add .`，不主动 commit/deploy/merge；除非用户明确要求并确认范围。
