---
title: DocCanvas Owner v3 腾讯云生产发布与验收 Runbook
status: owner_v3_local_candidate_awaiting_release_identity
updated: 2026-07-15
target_domain: kgraph.lute-tlz-dddd.top
compose_project: doccanvas-kgraph
production_status: last_verified_readonly_release_requires_fresh_recheck
---

# DocCanvas Owner v3 生产发布与验收 Runbook

本 Runbook 只适用于 SVG＋DOM `factory-scene-v3`、动态关系层、Owner 会话、结构化 mutation、修订历史和肖像素材库完成后的同窗发布。当前代码仍是本地工作树，未生成可追溯 commit 和候选 image，也未执行 SSH、SCP、`docker load`、容器替换或 Nginx reload：`production unchanged`。

历史生产快照显示站点仍运行只读版本，但发布前必须重新读取真实生产状态；历史 release ID、容器 ID、image digest、data checksum 和资源数据不能直接复用。

## 发布原则

- 正式版本一次性替换旧 React Flow 运行时，不保留 feature flag，也不保留旧引擎在线切换入口。
- 活动 Compose 固定 `DOCCANVAS_WRITE_MODE=owner`；移动端由应用层始终只读。
- Owner token 与 session secret 只通过 Docker secret file 注入，不进入 Git、bundle、env value、命令输出或验收日志。
- app rootfs 保持 read-only；只有专用 `/data` bind mount 可写，所有数据文件由 UID/GID `10001:10001` 管理。
- 种子文件只补充缺失的 document ID，绝不覆盖已存在的 Owner 文档。
- 不执行“某一验收门失败即自动回滚”，也不把生产回滚演练作为发布成功路径。上一不可变 image 和发布前数据快照只用于经人工判断后的硬故障事故恢复。
- 不停止、重建或修改其他 Compose project、Docker daemon、共享网络、共享证书或无关 Nginx 配置。

## 最终授权硬门

远端写入前必须同时固定并向 Owner 展示：

1. 已推送的 clean Git commit SHA；工作树构建不得作为发布来源。
2. `linux/amd64` immutable image tag、image ID、manifest digest、runtime config digest 和 archive SHA-256。
3. 本地 unit/typecheck/build/Playwright、Owner image smoke、Compose config、dependency/security gate 的新鲜结果。
4. 生产只读盘点：当前 app/edge image 与 ID、Compose config checksum、data tree、磁盘/内存、共享 Nginx、TLS、其他容器 sentinel。
5. Owner 写入停止后的数据 snapshot archive SHA-256 与 manifest SHA-256。
6. 两个 secret file 的存在性、权限与非空检查；只报告状态和 checksum，不报告内容。
7. 明确变更窗口、执行人、观察窗口和人工事故恢复负责人。
8. Owner 对上述精确 commit、image digest、backup checksum 和变更窗口的最终批准。

计划批准、旧 release 授权或“继续”不能替代第 8 项。

## 执行 TODO

| 顺序 | 阶段 | 动作 | 完成标准 |
|---|---|---|---|
| 1 | 本地收口 | `npm ci`、unit、typecheck、production build、Chromium/WebKit/移动端、视觉快照、CRUD、安全负例、1000/2000 性能夹具 | 全部新鲜通过；失败不得制作 release |
| 2 | 候选制作 | 从 clean commit 运行 `build-linux-image.sh`，再运行 Owner `verify-linux-image.sh` | immutable amd64 image 与 checksum 证据齐全；未登录 401、跨站 403、Owner 登录与真实写入通过 |
| 3 | 生产只读再熟悉 | 使用可信 fingerprint 和 isolated `known_hosts` 检查主机、Docker、Compose、Nginx、TLS、data、资源和其他容器 | 形成 L3 基线；发现漂移即重新规划 |
| 4 | 写入静默与快照 | 停止 DocCanvas app 接收写入，确认无 transaction journal 活动；运行 `backup-owner-data.sh` | archive 可解包，archive/manifest checksum 固定，其他项目不变 |
| 5 | Owner data 预检 | 运行 `prepare-owner-data.sh`，校验 missing-only seed、UID 10001、目录权限、secret file 和 Compose config | 既有文档 checksum 不变；新增目录可写；无 symlink/path traversal |
| 6 | 受控替换 | `docker load` 后只替换 `doccanvas-kgraph` app；只有 edge 契约发生变化时才受控替换 edge | app/edge 身份、网络、mount、rootfs、权限和资源限制符合候选配置 |
| 7 | 生产 smoke | health、首页、三内置画布、Owner 登录、每模块 CRUD、CAS 409、修订恢复、肖像、关系 Inspector、PNG/SVG、移动端只读、安全负例 | 真实 HTTPS 和浏览器证据通过；无 restart/OOM、无数据或其他项目漂移 |
| 8 | 观察与归档 | 连续资源观察并归档 release、image、backup、Compose、inspect、TLS、CRUD 和浏览器证据 | 只在全部生产证据完成后标记 `production_accepted` |

## 数据准备契约

`scripts/tencent/prepare-owner-data.sh <data-root> <seed-documents-root>` 必须以 root 运行，并完成：

- 拒绝相对路径、`/`、symlink data root 和 data tree 内任意 symlink；
- 创建 `documents/user`、`data/canvases`、`data/canvas-states`、`data/presentation`、`data/revisions`、`data/transactions`、`data/revision-audit`、`data/assets/portraits`；
- 只在目标不存在时复制三个内置文档；
- 将专用 data tree 固定为 `10001:10001`、目录 `0750`、文件 `0640`；
- 输出只包含计数与状态，不输出内容。

一致性快照仅在 Owner 写入已静默时执行：

```bash
DOCCANVAS_WRITES_QUIESCED=1 \
  scripts/tencent/backup-owner-data.sh \
  /srv/doccanvas-kgraph/data \
  /srv/doccanvas-kgraph/backups/OWNER_APPROVED_SNAPSHOT_ID
```

输出目录必须 create-only 且位于 data tree 外。发布后不得覆盖或删除该快照。

## 隔离与安全验收

- Compose 无 `ports:`、host network、privileged、Docker socket、host PID/IPC 或无关 mount。
- app 只加入 `internal: true` network；edge 是唯一加入现有 proxy network 的 endpoint。
- app/edge 均 non-root、`cap_drop: ALL`、`no-new-privileges`、read-only rootfs，并保留 memory/CPU/PID/log 上限。
- `/data` 是唯一业务可写 bind mount；`/tmp` 和 `.next/cache` 仅为受限 tmpfs。
- 未登录所有写 API 返回 `401`；跨站写请求返回 `403`；过期/篡改 cookie 失败；readonly 生产模式仍 fail-closed。
- secret file 目标为 `/run/secrets/doccanvas_owner_token` 和 `/run/secrets/doccanvas_session_secret`，应用不接受浏览器 token header 作为 Owner 会话替代。
- 非法 MIME、超过 5MB、超过 1200 万像素、路径穿越和有引用素材删除全部失败。

## 产品验收

- 三个内置文档和至少一个用户画布的模型边数、路由边数与 SVG hit path 数一致。
- 桌面 Owner 在每个模块可编辑档案、新增、修改、复制、同级排序、软删除和恢复；旧 revision 并发写稳定返回 `409`。
- 移动端不渲染任何写控件，并用纵向流程轨保留关系语义。
- 关系 hover/focus/选中只执行一次 220–280ms tracer；reduced motion 无路径位移动画。
- viewport PNG 与 full-scene SVG 包含主题、节点、关系和箭头，不包含 Owner 控件。
- 1000 节点／2000 关系夹具满足 FCI、虚拟化、55fps 和重路由门限；生产资源观察无 OOM、非计划 restart 或持续高负载。

## 人工事故恢复

只有 app/edge 有界等待后仍不可用、持续 restart/OOM、核心数据不一致、安全边界失效或其他项目受到实际影响时，才进入人工事故判断。恢复动作必须再次获得 Owner 指令，并使用：

- 发布前固定的上一不可变 image 与其原始 Compose/release env；
- 发布前 checksum-bound Owner data snapshot；
- 本次只读基线和允许对象清单。

不得自动执行恢复，不得只恢复 image 却忽略数据 schema/sidecar/revision 一致性，也不得把恢复成功表述为新版本发布成功。

## 停止条件

- commit/image/archive/config/backup 任一 checksum 不匹配；
- fingerprint 不可信，或生产状态与只读基线冲突；
- data 中存在 symlink、权限不属于 UID 10001、活动 transaction journal 无法解释；
- secret file 缺失、为空、权限过宽或被纳入 bundle/log；
- 磁盘、内存、证书、共享 Nginx 或其他项目处于事故/变更中；
- 任何操作将修改允许清单之外的容器、网络、配置或数据。

本地通过、镜像 smoke、生产只读盘点、远端替换和生产验收是不同证据等级，不能互相替代。
