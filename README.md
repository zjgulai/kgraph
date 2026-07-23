---
title: DocCanvas
status: governed-workbench-ui098-preflight-batch-1-candidate-blocked
updated: 2026-07-23
---

# DocCanvas

DocCanvas 是一个 Markdown-first 的产品工厂画布：它把结构化 Markdown 投影为统一 `FactoryScene`，以 DOM 渲染模块和节点、以单一 SVG 图层渲染正交关系与情境 tracer。桌面端支持 Owner 结构化编辑与修订恢复，移动端始终使用只读纵向流程轨。项目基于 Next.js 15、React 19、TypeScript 和 Tailwind CSS v4。

当前产品已经扩展为四域证据工作台：`Knowledge / Product / Operations / Sources`。产品定位、商业价值、设计逻辑、Owner/Reviewer/Operator 操作方法、模块演进方向和证据边界统一记录在 [DocCanvas 产品复盘、设计逻辑与角色使用手册](./docs/product/doccanvas-product-review-and-role-manual.html)。D9 本地自动化验收与 D10/UI-097 文档已完成；[UI-022–025 Knowledge 工作流](./docs/engineering/ui098-knowledge-workflow-implementation.md)已在本地实现并通过完整 Chromium/WebKit/mobile 顺序验收，[UI-098 候选前对账](./docs/engineering/ui098-preflight-reconciliation.md)已进入精确 source checkpoint 冻结准备，UI-099 生产未执行。

## 本地运行

要求 Node.js 22 与 npm。

```bash
npm ci
npm run dev
```

默认开发地址为 `http://127.0.0.1:3200`。完整本地验证：

```bash
npm run verify:local
```

该命令依次执行 TypeScript 检查、全部 `node:test` 回归和 Next.js production build。三份内置 Playbook 快照位于 `documents/`，独立克隆本仓库即可完成开发与验证。

真实 standalone 跨浏览器验收使用：

```bash
npm run test:e2e
```

## 数据与写入边界

- 运行模式未显式配置时 fail-closed 为 `readonly`；活动 Owner v3 Compose 候选显式固定 `DOCCANVAS_WRITE_MODE=owner`。
- Owner token 与 session secret 只从 Docker secret file 读取；登录后使用 8 小时 `HttpOnly + Secure + SameSite=Strict` 会话，浏览器不保存 token。
- 首次 Owner 发布只把缺失的内置 Markdown 复制到独立 `/data/documents`；后续 seed 不覆盖 Owner 已编辑内容，也不修改镜像或服务器 Git 工作区。
- 所有 mutation 使用 revision、document hash 和 section hash 做 CAS；Markdown、presentation sidecar、资源引用通过 transaction journal、写前快照、原子替换和重新解析完成事务。
- `/data/revisions` 保留最近至少 50 个修订及全部 30 天内修订；恢复本身也生成新修订。

## 腾讯云部署拓扑

目标部署使用隔离的 `doccanvas-kgraph` Compose project：

```text
shared Nginx :443
  -> edge sidecar :8080
    -> internal app :3200
      -> writable /data (UID 10001 only)
```

生产 Compose 不发布 host port；app 只加入项目 internal network，只有最小 edge sidecar 加入现有共享 proxy network。运行容器使用 non-root、read-only rootfs、capability drop、PID/CPU/内存上限和 digest-pinned images，业务写入只允许发生在 UID `10001` 管理的 `/data` bind mount。

部署入口与边界：

- [DEPLOY.md](./DEPLOY.md)：当前部署入口与证据分层。
- [deploy/tencent/README.md](./deploy/tencent/README.md)：Linux image 与 Compose 候选包说明。
- [deploy/tencent/PRODUCTION-RUNBOOK.md](./deploy/tencent/PRODUCTION-RUNBOOK.md)：只读盘点、备份、受控替换、生产 smoke 与人工事故恢复计划。

历史快照不能替代当前生产事实；发布前必须重新执行只读盘点。当前工作树完成 D6–D10、UI-098 前置对账、UI-022–025 本地实现及完整 Playwright `50/22/0`，但仍包含未提交改动，也没有为本版本固定 clean commit、image digest、数据备份 checksum 和变更窗口：`production unchanged`。源码验证、本地 candidate、镜像 smoke、生产替换与最终验收必须继续分层表述，不能互相替代。当前授权边界以 [DEPLOY.md](./DEPLOY.md) 为准。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run typecheck` | TypeScript strict 检查 |
| `npm test` | 全部回归测试 |
| `npm run build` | Next.js standalone production build |
| `npm run verify:local` | typecheck + tests + build |
| `npm run test:e2e` | production build + Chromium/WebKit/移动端 Playwright |

项目当前没有 lint script，因此验收不把 lint 声称为已通过。
