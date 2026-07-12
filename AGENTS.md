# AGENTS.md — DocCanvas 项目约束

## 项目与证据边界

DocCanvas 是基于 Next.js 15 与 React Flow 的 Markdown 知识画布。`documents/` 中三份内置 Playbook 快照和用户 Markdown 是内容事实源；文件系统与 localStorage 承担持久化，不使用数据库。

- 本地测试、候选包 smoke、云端部署、生产验收是不同证据层级，不得互相替代。
- 默认生产模式为 `readonly`；除非用户单独授权，不执行腾讯云、PM2、Nginx、DNS、TLS、防火墙、`current` 切换或真实写入。
- 当前 Git 仓库已使用 `main` 与 remote；每次仍须重新核验 branch、HEAD、upstream 与工作树，禁止把 dirty working tree、未推送 commit 或旧 candidate 冒充可追溯 release。

## 启动顺序

1. 读取本文件、用户最新指令，以及存在时的 `../AGENTS.md`、`.kiro/plan/task_plan.md`、`.kiro/plan/progress.md`。
2. 写入前执行 `git status --short --branch`，保留非本任务改动。
3. 先搜索 `lib/shared/document-registry.ts`、`lib/markdown/sections.ts`、`lib/sync/precise-sync.ts` 与相关测试，确认现有契约后再实现。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm ci` | 按 lockfile 干净安装；不得在含用户依赖改动的共享树中盲目执行 |
| `npm run dev` | 本地开发，监听 `127.0.0.1:3200` 的实际绑定以终端输出为准 |
| `npm run typecheck` | TypeScript strict 检查 |
| `npm test` | 执行全部 `node:test` 回归 |
| `npm run build` | 生成 Next standalone 构建 |
| `npm run verify:local` | 依次执行 typecheck、test、build |
| `bash -n scripts/deploy-prepare.sh scripts/verify-release.sh` | 部署脚本语法检查 |
| `node --check ecosystem.config.cjs` | PM2 配置语法检查 |

项目没有 lint script；不得声称 lint 已通过。非琐碎改动至少运行相关测试与 `npm run typecheck`；核心数据流、运行配置或用户可见行为变化运行 `npm run verify:local`。

## 架构与事实源

```text
app/                         Next.js App Router 与 API routes
components/canvas/           React Flow 客户端画布与交互
lib/parser/                  Markdown -> DocCanvas graph
lib/markdown/sections.ts     Remark AST 章节边界、raw body、section hash
lib/shared/document-registry.ts  文档注册表与路径单一事实源
lib/shared/document-map.ts   旧调用兼容导出，不是新的事实源
lib/sync/precise-sync.ts     章节 CAS 与原子写回
lib/server/                  write guard、路径根、文件锁、JSON 边界
scripts/                     候选包组装与隔离只读验证
tests/                       契约、API、文件锁、客户端状态、部署脚本测试
```

数据流：

```text
Markdown -> extractMarkdownSections() / parseMarkdownToGraph()
  -> computeLayout() -> canonical docNodes -> React Flow projection
  -> PATCH /api/documents -> write guard -> strict CAS -> atomic file replace
  -> POST /api/canvas-state -> bounded schema -> atomic JSON replace
```

- 仅 React Flow 交互子树使用 `'use client'`；App Router 页面和 route handler 保持 server 边界。
- `DocNode.content` 必须是源章节 raw Markdown body；`contentBlocks` 只用于展示，禁止反序列化后写回。
- 带 `hash` 的保存只允许唯一精确命中；stale/重复/歧义返回 conflict（API 409），禁止按 heading 猜测。
- 不带 `hash` 的 legacy 保存只允许唯一 `originalHeading` 命中；不得 append 新章节兜底。
- 文件锁协议只声明同主机、本地 POSIX 文件系统支持；不得外推到 NFS、网络盘或多主机写入。
- “标记删除”会写入 soft-delete marker 并从当前视图移除；Markdown 章节仍保留，不得称为物理删除。
- 轨道折叠只作用于 `vibe` / `pro`；`both` 是 Shared，不能因单轨折叠隐藏。

## 写入与运行模式

| 模式 | 行为 |
|---|---|
| 非 production、未配置 | `dev`，本地可写 |
| `NODE_ENV=production` 默认 | `readonly`，所有写 API 返回 403 |
| `DOCCANVAS_WRITE_MODE=owner` | 需要 `DOCCANVAS_ADMIN_TOKEN` 与 `X-DocCanvas-Token`；只在单独授权的 HTTPS/备份/验收门后开放 |

所有 API 写入必须经过 `lib/server/write-guard.ts`；Markdown 写入必须经过 `precise-sync.ts`，禁止 route handler 直接覆盖文件。不要打印、提交或写入 token。

## 发布拓扑与验证顺序

对目标 `101.34.52.232` / `kgraph.lute-tlz-dddd.top`，以下 PM2 拓扑已被 `.kiro/plan/tencent-cloud-docker-deployment-plan.md` 覆盖：该主机必须使用 `doccanvas-kgraph` 独立 Compose project、app internal network、edge-only shared network、无 host port 与 dedicated TLS。不得执行 PM2 路线、不得安装/重启 Docker daemon、不得修改 `daemon.json`、不得 prune 或让 app 直接加入 `lighthouse_ai_video_net`。公网 readonly activation 已有历史执行证据，但任何新上传、image load、app/edge replacement、shared Nginx 变更或 owner 写入都需要新的明确授权；旧授权不得复用。

以下内容仅保留为非该主机的历史候选发布契约：

```text
/opt/doccanvas/releases/<release-id>  immutable release
/opt/doccanvas/current                atomic symlink selected by owner
/var/lib/doccanvas/documents          mutable Markdown data
/var/lib/doccanvas/data               manifest and canvas state
/var/log/doccanvas                    PM2 logs
```

- `scripts/deploy-prepare.sh <release-dir> <data-dir>` 只构建/组装候选包并 seed 缺失文档；不得启动服务、覆盖已有 data 或切换 `current`。
- `scripts/verify-release.sh <release-dir> <data-dir>` 只在调用者选择的未占用 loopback 端口启动候选包并验证 deep readiness（registry、Markdown parse、目录权限、不泄露 Node 版本）与 readonly 契约；通过仍不等于云端或生产验收。
- 验证顺序：相关测试 -> `npm run verify:local` -> 隔离 clean-room candidate -> readonly fixture smoke -> 人工云端 preflight -> 授权 activation -> 生产 acceptance。
- standalone 必须显式包含 `public/` 与 `.next/static/`；PM2 配置不提供 HTTP health probe，`/api/health` readiness 由独立 synthetic probe/人工验收调用，进程 liveness 由 PM2/端口监控承担。
- 发布锁在进程被 `SIGKILL` 或主机崩溃后可能残留；owner 必须先确认无发布进程与 staging 活动，再人工清理对应 `<release>.publish-lock`。

## 禁止事项

- 不从 `'node:crypto'` 导入；使用 `'crypto'`。
- 不在多个文件重复定义文档路径；使用 `document-registry.ts`。
- 不用 `Math.random()` 进行布局；使用 deterministic hash seed。
- 不在 CardNode 用 JS 截断标题；使用 CSS line clamp。
- 不修改测试、跳过失败或把 fixture/local smoke 写成 production passed。
- 不使用 `git add .`、不主动 commit/deploy/merge；除非用户明确要求并确认范围。
