---
title: DocCanvas
status: production-candidate
updated: 2026-07-11
---

# DocCanvas

DocCanvas 是一个 Markdown-first 的知识画布应用：它把结构化 Markdown 解析为可浏览、可折叠、可导出的 React Flow 知识图谱。项目基于 Next.js 15、React 19、TypeScript 和 Tailwind CSS v4。

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

## 数据与写入边界

- `documents/*.md` 是内置内容快照；`documents/user/` 用于用户画布。
- 生产默认 `DOCCANVAS_WRITE_MODE=readonly`，写 API 返回 `403`。
- Owner 写入必须显式配置 `DOCCANVAS_WRITE_MODE=owner`、管理员 token、HTTPS、备份和单独验收；不要把 token 或密钥提交到仓库。
- Markdown 写回统一经过 `lib/sync/precise-sync.ts` 的 CAS 与原子替换路径。

## 腾讯云部署拓扑

目标部署使用隔离的 `doccanvas-kgraph` Compose project：

```text
shared Nginx :443
  -> edge sidecar :8080
    -> internal app :3200
      -> read-only /data
```

生产 Compose 不发布 host port；app 只加入项目 internal network，只有最小 edge sidecar 加入现有共享 proxy network。运行容器使用 non-root、read-only rootfs、capability drop、PID/CPU/内存上限和 digest-pinned images。

部署入口与边界：

- [DEPLOY.md](./DEPLOY.md)：当前部署入口与证据分层。
- [deploy/tencent/README.md](./deploy/tencent/README.md)：Linux image 与 Compose 候选包说明。
- [deploy/tencent/PRODUCTION-RUNBOOK.md](./deploy/tencent/PRODUCTION-RUNBOOK.md)：服务器熟悉、activation、E2E、回滚与验收计划。

当前仓库提供已在本地验证的生产候选，不等于腾讯云已部署或公网已验收。私钥、`.env`、本地计划、测试证据目录和生成状态均由 `.gitignore` / `.dockerignore` 排除。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run typecheck` | TypeScript strict 检查 |
| `npm test` | 全部回归测试 |
| `npm run build` | Next.js standalone production build |
| `npm run verify:local` | typecheck + tests + build |

项目当前没有 lint script，因此验收不把 lint 声称为已通过。
