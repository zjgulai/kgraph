---
title: DocCanvas 腾讯云部署入口
status: new_l2_candidate_ready_production_acceptance_in_progress
updated: 2026-07-12
target_host: 101.34.52.232
target_domain: kgraph.lute-tlz-dddd.top
production_status: live_readonly_release_20260712T031453Z_1579d67cfd78
---

# DocCanvas 腾讯云部署入口

三份内置 Playbook 的可发布快照统一位于 `documents/`。本地开发、回归测试、Docker allowlist build context 和首次生产 data seed 均从该目录读取，因此独立克隆本仓库不依赖上一级目录。

目标服务器 `101.34.52.232` / 域名 `kgraph.lute-tlz-dddd.top` 的公开执行依据是 [`deploy/tencent/PRODUCTION-RUNBOOK.md`](deploy/tencent/PRODUCTION-RUNBOOK.md)。本机更细的命令证据、备份清单与验收输出不进入公开仓库。

隔离 `doccanvas-kgraph` app/edge、dedicated TLS、首次公网 activation，以及 Mode B live rollback/re-activation 均已在对应授权窗完成。当前公网运行 readonly release `20260712T031453Z-1579d67cfd78`（Git commit `1579d67cfd7893dafeac85f2780e6adaed2e7424`）；本轮未执行新的远端写入。

新 L2 candidate `20260712T100007Z-2a9ba490ccf0` 已从 source Git snapshot `2a9ba490ccf0b1bc1c7c1cf39b247bc1bd04ee56` 构建；runtime allowlist commit 为 `4b65c461fe9da54cda6041d2691618912ae55816`。Image/index ID `sha256:7ec0c80c...a2b6ea`、archive SHA `99867603...e8d03`；shared/image 94/94 tests、8/8 routes、readonly image/Compose smoke、npm audit、Scout SBOM/CVE 与 candidate checksum 均通过。

该候选只允许标记为 `L2 allowed-with-label`：当前 builder 的 image revision 是包含随机绝对临时路径的不可复现 context hash，不是 Git SHA；补充 provenance sidecar 未嵌入或签名到 image。新 image 的 Playwright session 又连续三次卡在启动阶段，因此浏览器 PNG E2E 仍未验证。新的 final deploy bundle 尚未组装，旧 `fd5804e` bundle 继续保持失效；取得单独的 app-only 部署授权前，生产继续运行 `1579d67` release。

## 当前部署决策

```text
Internet :80/:443
  -> existing ai_video_nginx
  -> doccanvas-kgraph-edge:8080
  -> doccanvas-kgraph-app-internal:3200 on doccanvas-kgraph internal network
```

- 使用现有 rootful Docker daemon，但创建独立 Compose project `doccanvas-kgraph`；不安装第二个 daemon。
- app 只加入 `internal: true` network；只有 edge 加入现有 `lighthouse_ai_video_net`。
- app/edge 均无 `ports:`、无 Docker socket、non-root、read-only rootfs、resource/PID/log limits。
- 本地构建并验证 immutable `linux/amd64` image，服务器只 `docker load`，不现场 build。
- 默认 `DOCCANVAS_WRITE_MODE=readonly`；owner 写入与 token 不属于首发范围。
- TLS 使用独立 `kgraph.lute-tlz-dddd.top` lineage，不扩写现有 multi-SAN certificate。
- 首次 activation 的单次受控 shared Nginx recreate 与后续 Mode B graceful rollback/re-activation 已完成，只属于历史执行证据；不得把该授权复用于新版本发布。后续 app-only hotfix 默认不得修改 edge/shared Nginx。

## 执行门

进入下一次远端写入前必须同时满足：

1. 发布源码是明确且已推送的 clean Git commit；不得从未提交工作树或旧 candidate 冒充可追溯 release。
2. 新 `linux/amd64` image、readonly fixture、Compose static contracts、`npm audit --omit=dev`、runtime vulnerability gate 与 checksum 全部重新通过。
3. final bundle 只包含 allowlist 文件，bundle checksum 与实际脚本/归档逐字节一致，previous release/image/config 由新鲜只读证据固定。
4. 变更窗内没有其他 Docker/Nginx 发布；资源、shared Nginx、DocCanvas app/edge、documents checksum、既有容器与站点 sentinel 的 preflight 全部通过。
5. owner 明确批准本次上传、`docker load` 与 app-only replacement；失败回滚只能使用已固定的 previous release。未批准时保持当前生产 release 不变。
6. 部署后重新执行公网 API/UI/readonly、浏览器导出、restart/resource/isolation 与 rollback-ready 验收；这些证据完成前不得标记 `production_accepted`。

## 证据边界

| 等级 | 当前/未来证据 | 允许结论 |
|---|---|---|
| L2 | 本地 amd64 image、fixture、dry-run | 候选通过，不代表生产 |
| L3 | 生产只读 SSH/HTTPS/API/E2E 观察 | 生产行为可观察，不代表授权写入 |
| L4 | owner 授权 + live side-effect logs | 只可声明实际完成的 activation/验收项 |

DNS 正确、container healthy、一次 curl 200、一次 Nginx reload 或单张截图都不能单独称为部署完成。

## 历史路线

被替代的 PM2、`/opt/doccanvas`、loopback `:3200` runbook 已归档到 [`archive/DEPLOY-PM2-HISTORICAL-20260710.md`](archive/DEPLOY-PM2-HISTORICAL-20260710.md)，只供追溯，禁止在该目标主机执行或与 Docker 路线混用。
