---
title: DocCanvas Owner v3 腾讯云部署入口
status: implementation_in_progress_local_production_unchanged
updated: 2026-07-15
target_host: 101.34.52.232
target_domain: kgraph.lute-tlz-dddd.top
production_status: last_verified_readonly_release_requires_fresh_recheck
---

# DocCanvas Owner v3 部署入口

当前工作树正在实现 SVG＋DOM `factory-scene-v3`、动态关系、Owner HttpOnly 会话、结构化 mutation、修订恢复和肖像素材库。它不是已部署 release：尚无 clean/pushed commit、immutable image digest、发布前 data snapshot checksum 或针对精确候选的最终授权。本轮没有执行 SSH/SCP、`docker load`、容器替换或 Nginx reload，`production unchanged`。

活动部署入口是 [`deploy/tencent/PRODUCTION-RUNBOOK.md`](deploy/tencent/PRODUCTION-RUNBOOK.md)。活动 Compose 已改为 Owner 候选：可写 `/data`、UID `10001`、Docker secret file、read-only rootfs、无 host port；旧 readonly Compose 不再作为新版本发布策略。上一不可变 image 与发布前数据快照只保留为经人工授权的硬故障事故恢复材料，不参与自动回滚。

## 发布前必须重新生成

- clean Git commit 与远端 SHA；
- `linux/amd64` image tag、image/manifest/config digest 和 archive SHA-256；
- unit/typecheck/build/Playwright/Owner image smoke/Compose config 证据；
- 生产只读现状与其他项目 sentinel；
- Owner 写入静默后的 data archive 和 manifest checksum；
- secret file 状态与权限证明（不得输出值）；
- 针对上述精确对象的最终 Owner 授权。

在这些对象出现前，不沿用历史候选 release ID 或历史 checksum，也不声称“最新版本已部署”。

## 证据分层

| 等级 | 证据 | 可声明结论 |
|---|---|---|
| L1 | unit/typecheck/build | 本地实现通过相应门禁 |
| L2 | amd64 image、Owner fixture、Compose dry-run | 候选可进入生产只读预检 |
| L3 | 生产 SSH/HTTPS/API/浏览器只读观察 | 当前生产事实已刷新，不代表已授权写入 |
| L4 | 精确授权、远端副作用日志、生产 CRUD/安全/数据证据 | 只声明实际完成的替换与验收项 |

PM2 与旧 loopback 路线只保留在历史归档，禁止用于本次 Owner v3 发布。
