---
title: DocCanvas 腾讯云 Docker 候选包
status: local_candidate_only
updated: 2026-07-11
---

# 腾讯云 Docker 候选包

本目录实现 [`PRODUCTION-RUNBOOK.md`](./PRODUCTION-RUNBOOK.md) 的 app/edge 隔离拓扑。它只提供部署产物，不自动执行腾讯云上传、TLS 签发、共享 Nginx 修改或 activation。

三份内置 Playbook 快照由仓库 `documents/` 提供。builder 用它们执行真实内容回归，runtime image 不内置内容；服务器首次 seed 后通过 `/data:ro` 挂载，已有 owner 数据不会被覆盖。

## 本地顺序

1. 为 `NODE_IMAGE` 提供经过核验的 `node:22-bookworm-slim@sha256:...`。
2. 运行 `scripts/tencent/build-linux-image.sh <release-id> <output-dir>`。
3. 运行 `scripts/tencent/verify-linux-image.sh <image-tag>`。
4. 使用 `docker compose -p doccanvas-kgraph -f deploy/tencent/compose.yaml --env-file <release.env> config --quiet` 验证最终变量。

生产 Compose 不发布 host port；app 只在 internal network，并使用项目唯一 alias `doccanvas-kgraph-app-internal`，避免 edge 在共享网络误解析其他项目的通用 `app` alias。edge 是唯一加入 `lighthouse_ai_video_net` 的 endpoint。`release.env.example` 不含 token，首发固定 readonly。

任何远端动作前必须完成 owner 授权、SSH fingerprint 可信核对、Mode A/B 选择、Certbot/变更窗口/回滚 owner 确认。`production unchanged`。
