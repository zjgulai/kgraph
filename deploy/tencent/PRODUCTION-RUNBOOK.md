---
title: DocCanvas 腾讯云生产部署与验收计划
status: awaiting-execution-gates
updated: 2026-07-11
target_domain: kgraph.lute-tlz-dddd.top
compose_project: doccanvas-kgraph
production_status: unchanged
---

# 腾讯云生产部署与验收计划

目标是在共享 Docker 主机上部署独立的 `doccanvas-kgraph` Compose project，同时不停止、重建或修改其他应用容器。当前状态是本地候选通过，`production unchanged`。

## 硬门

开始远端写入前必须具备：从腾讯云可信渠道核对的 ED25519 host fingerprint、明确变更窗口、共享 Nginx reload 负责人、Certbot 冲突检查和回滚负责人。

默认采用 Mode B：成功路径最多 3 次 graceful reload，覆盖首次 activation、真实回滚、再次 activation；失败安全上限 4 次。若变更窗口只允许单次 reload，则采用 Mode A，但验收结论必须标记为“未实测生产回滚”。

SSH 固定使用 isolated `known_hosts`、`StrictHostKeyChecking=yes`、`IdentitiesOnly=yes` 和 `BatchMode=yes`。禁止 TOFU、`StrictHostKeyChecking=no`、写入全局 `known_hosts` 或打印私钥内容。

## 执行 TODO

| 顺序 | 阶段 | 关键动作 | 完成标准 |
|---|---|---|---|
| 1 | GitHub 基线 | secret scan、初始 commit、push、远端 SHA 核对 | 公开仓库可独立 `npm ci && npm run verify:local` |
| 2 | 服务器只读再熟悉 | 核验主机、资源、Docker/Compose、对象清单、共享 Nginx、Certbot timer、现有站点 sentinel | 保存 L3 只读基线；任一冲突即停止 |
| 3 | 候选 staging | 校验 archive SHA，创建 `/srv/doccanvas-kgraph` 独立目录，`docker load`，seed missing-only 文档，启动 app/edge | 仅新增本项目 2 个容器和 1 个 internal network，无 host port/volume/其他对象变化 |
| 4 | TLS 与 activation | 签发 dedicated certificate，marker-bounded 修改共享 vhost，旁路 `nginx -t`，checksum CAS，graceful reload | 正确 Host 路由到 edge；其他站点 sentinel 不变 |
| 5 | 产品 E2E | HTTPS/TLS、首页、三画布、缩放/折叠/搜索、Markdown/PNG 导出、移动端、readonly 403、错误 Host、重启恢复 | API、桌面和移动端证据全部通过，restart/OOM 为 0 |
| 6 | 回滚与再激活 | Mode B 下恢复 Nginx backup、移除本项目 endpoint、复核旧站点，再重新 activation | 回滚和再激活都实测；其他 Compose project ID/StartedAt/RestartCount 不变 |
| 7 | 生产验收 | 归档 manifest、checksums、容器 inspect、stats、TLS、sentinel、E2E 和回滚记录 | 才可标记 `production_accepted` |

## 隔离契约

- 不安装或重启 Docker daemon，不改 `daemon.json`，不执行任何 prune。
- 所有 Compose 命令显式带 `-p doccanvas-kgraph`、release 文件和 env 文件。
- app 只加入 `internal: true` network；edge 是唯一加入现有 proxy network 的 endpoint。
- 不声明 `ports:`、host network、privileged、Docker socket、host PID/IPC 或 named volume。
- app/edge 使用 non-root、read-only rootfs、`cap_drop: ALL`、no-new-privileges、资源/PID/log 上限。
- data 由 host root 管理并以 `/data:ro` 挂载；首发固定 `DOCCANVAS_WRITE_MODE=readonly`。
- TLS 使用独立 certificate lineage，不扩写其他产品证书。
- 删除和回滚只允许作用于本项目 allowlist；禁止删除 external network、共享 Nginx 或其他容器。

## 停止条件

- fingerprint 不可信、主机/alias/目录冲突、共享 Nginx 基线失败；
- 可用内存低于 3 GiB、磁盘低于 20 GiB，或现有应用处于事故/高负载；
- Certbot 正在运行或 timer 与变更窗口冲突；
- archive/image/checksum/platform 不匹配；
- 出现 host port、unexpected mount、unexpected Docker object、restart、OOM、health flapping；
- 任一现有站点 sentinel、container ID、StartedAt 或 RestartCount 非预期变化。

本地测试、服务器只读检查、staging、activation、E2E 与 production acceptance 是不同证据等级，不能互相替代。
