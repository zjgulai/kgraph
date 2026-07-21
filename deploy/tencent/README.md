---
title: DocCanvas 腾讯云 Docker 候选包
status: owner_v3_local_candidate_only
updated: 2026-07-15
---

# 腾讯云 Docker 候选包

本目录实现 [`PRODUCTION-RUNBOOK.md`](./PRODUCTION-RUNBOOK.md) 的 app/edge 隔离拓扑。它只提供部署产物，不自动执行腾讯云上传、TLS 签发、共享 Nginx 修改或 activation。

三份内置 Playbook 快照由仓库 `documents/` 提供。builder 用它们执行真实内容回归，runtime image 不内置内容；服务器首次 seed 只补缺失 document ID，运行时通过可写 `/data` 保存文档、presentation、修订、事务 journal 与肖像。已有 Owner 数据不得被种子覆盖。

## 本地顺序

1. 确认 clean commit 中的 `source-dependencies.sha256` 与七个父目录共享运行输入一致；构建脚本会在复制前逐项校验，任何漂移均 fail-fast。
2. 为 `NODE_IMAGE` 提供经过核验的 `node:22-bookworm-slim@sha256:...`，并通过 `BUILDX_BUILDER` 显式指定已核验的 Buildx builder；不得继承全局当前 builder。
3. 运行 `scripts/tencent/build-linux-image.sh <release-id> <output-dir>`，并保留 manifest 中的 `source_sha256` 与 `source_dependency_lock_sha256`。
4. 运行 `scripts/tencent/verify-linux-image.sh <image-tag>`，在隔离临时数据上验证 Owner 会话、未授权拒绝与真实写入。
5. 在候选主机目录以 root 运行 `scripts/tencent/prepare-owner-data.sh <data-root> <seed-root>`，只补缺失种子并固定 UID `10001` 权限。
6. 写入两个独立 secret file（不得放进 release bundle、日志或 Git），再使用 `docker compose -p doccanvas-kgraph -f deploy/tencent/compose.yaml --env-file <release.env> config --quiet` 验证最终变量。
7. 停止写入后运行 `DOCCANVAS_WRITES_QUIESCED=1 scripts/tencent/backup-owner-data.sh <data-root> <backup-dir>`，记录 archive checksum。

生产 Compose 不发布 host port；app 只在 internal network，并使用项目唯一 alias `doccanvas-kgraph-app-internal`，避免 edge 在共享网络误解析其他项目的通用 `app` alias。edge 是唯一加入 `lighthouse_ai_video_net` 的 endpoint。活动候选固定 `owner` 模式，token 与 session secret 仅通过 Docker secret file 注入；移动端仍由应用强制只读。

任何远端动作前必须重新读取生产状态，并针对精确 commit、image digest、备份 checksum、变更窗口与人工事故恢复步骤取得最终授权。本目录变更本身不执行远端动作：`production unchanged`。
