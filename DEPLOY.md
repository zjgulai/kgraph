---
title: DocCanvas 腾讯云部署入口
status: local_linux_candidate_ready_awaiting_execution_gates
updated: 2026-07-11
target_host: 101.34.52.232
target_domain: kgraph.lute-tlz-dddd.top
production_status: unchanged
---

# DocCanvas 腾讯云部署入口

三份内置 Playbook 的可发布快照统一位于 `documents/`。本地开发、回归测试、Docker allowlist build context 和首次生产 data seed 均从该目录读取，因此独立克隆本仓库不依赖上一级目录。

目标服务器 `101.34.52.232` / 域名 `kgraph.lute-tlz-dddd.top` 的公开执行依据是 [`deploy/tencent/PRODUCTION-RUNBOOK.md`](deploy/tencent/PRODUCTION-RUNBOOK.md)。本机更细的命令证据、备份清单与验收输出不进入公开仓库。

当前只完成本地候选验证、域名检查和远端只读服务器熟悉；没有创建 Docker objects、目录或证书，没有修改 Nginx/DNS/防火墙，也没有 reload/restart，`production unchanged`。

最新已封板的本地候选为 `20260711T120409Z-0eafc7e4f71f`，对应 Git commit `0eafc7e4f71f98e62fc2b16b89f5df9c543d672c`。Linux amd64 image、完整 Compose topology、readonly smoke、SBOM/CVE 与 checksum 已通过；本机验收证据不随公开源码发布。这只把部署门推进到 L2 candidate，不代表云端已部署。

## 当前部署决策

```text
Internet :80/:443
  -> existing ai_video_nginx
  -> doccanvas-kgraph-edge:8080
  -> app:3200 on doccanvas-kgraph internal network
```

- 使用现有 rootful Docker daemon，但创建独立 Compose project `doccanvas-kgraph`；不安装第二个 daemon。
- app 只加入 `internal: true` network；只有 edge 加入现有 `lighthouse_ai_video_net`。
- app/edge 均无 `ports:`、无 Docker socket、non-root、read-only rootfs、resource/PID/log limits。
- 本地构建并验证 immutable `linux/amd64` image，服务器只 `docker load`，不现场 build。
- 默认 `DOCCANVAS_WRITE_MODE=readonly`；owner 写入与 token 不属于首发范围。
- TLS 使用独立 `kgraph.lute-tlz-dddd.top` lineage，不扩写现有 multi-SAN certificate。
- shared Nginx 只允许 marker-bounded vhost 变更、旁路 `nginx -t`、checksum CAS、保持 bind-mount inode 的原位写入与 graceful reload。

## 执行门

进入任何远端写入前必须同时满足：

1. owner 批准详细计划与同一 Docker daemon 内的强项目隔离边界；若要求物理零共享则改为新 VM。
2. 从腾讯云可信来源核对 ED25519 host fingerprint。
3. 明确批准创建本项目 Docker/目录对象、签发 dedicated certificate，以及 shared Nginx reload 模式和失败安全上限。
4. `linux/amd64` image、Compose/edge static contracts、readonly fixture 与 vulnerability gate 全部通过。
5. `npm audit --omit=dev` 与 runtime image vulnerability gate 维持为 0 findings；若新构建产生发现则停止。
6. 变更窗内没有其他 Docker/Nginx 发布，基线、backup、sentinel 和回滚 owner 已记录。

## 证据边界

| 等级 | 当前/未来证据 | 允许结论 |
|---|---|---|
| L2 | 本地 amd64 image、fixture、dry-run | 候选通过，不代表生产 |
| L3 | 生产只读 SSH/HTTPS/API/E2E 观察 | 生产行为可观察，不代表授权写入 |
| L4 | owner 授权 + live side-effect logs | 只可声明实际完成的 activation/验收项 |

DNS 正确、container healthy、一次 curl 200、一次 Nginx reload 或单张截图都不能单独称为部署完成。

## 历史路线

被替代的 PM2、`/opt/doccanvas`、loopback `:3200` runbook 已归档到 [`archive/DEPLOY-PM2-HISTORICAL-20260710.md`](archive/DEPLOY-PM2-HISTORICAL-20260710.md)，只供追溯，禁止在该目标主机执行或与 Docker 路线混用。
