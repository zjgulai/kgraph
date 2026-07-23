---
title: DocCanvas Factory Scene v3 工程记录
status: d9_automated_acceptance_local_verified_d10_pending
updated: 2026-07-23
---

# Factory Scene v3 工程记录

## 当前决策

DocCanvas 桌面画布使用 DOM 节点和一个 SVG 关系层，不再使用 React Flow。正式发布不保留双引擎 feature flag；旧 image 只作为事故恢复材料。移动端使用原生纵向流程轨且始终只读。

D6 将桌面表现明确拆成同一场景内核上的两种 presentation：`Map` 为默认的扁平知识地图，保留关系图例、正交管线和结构层级；`Factory` 为显式切换的 2.5D 工厂视图，保留屋顶、房间环境和数字员工。切换不创建第二套 layout、route 或 SVG，模型、layout、scene 和 rendered edge count 必须保持不变。

场景链路为：

```text
DocCanvas graph
  -> ArchitectureViewModel
  -> Web Worker deterministic layout
  -> FactoryScene materialization + spatial index
  -> virtualized DOM nodes + SVG relations/hit paths/tracers
```

## 不变量

- 路由端口和节点端口使用同一 `*-in` / `*-out` 契约。
- Markdown 节点 ID 使用 document ID、section hash 和重复序号；引用节点由宿主稳定 ID 与规范化名称派生，通用模块 ID 由其 H2 节点派生。无关章节的插入或移动不会改写既有身份。
- 关系路径为确定性正交 `M/L`；模型、layout、scene 和实际 SVG 边数一致。
- 普通、治理、依赖与资源关系同时以颜色、线型和中文标签区分。
- 静止状态不循环动画；一次性 tracer 动画为 260ms、活动状态在 280ms 清除，可取消重启；reduced motion 与 full-scene export 均不创建 tracer。
- 拖动期间无 transform transition；端点即时跟随，50ms 增量避障，释放后精确重路由。
- 屋顶占高固定为 72px；工业锯齿采光顶只使用语义 token，并以 8px 深度面表达克制的 2.5D，不增加无信息头部高度。
- 语义缩放阈值为 `<0.45` 聚合、`0.45–0.8` 简化、`>0.8` 完整。
- 视口 overscan 后最多渲染 350 个 DOM 节点与 700 条 SVG 关系路径。
- `factory-scene-v3` 只迁移旧 viewport、选中模块和展开状态，节点坐标重新布局。
- Map/Factory 只改变语义文案与材料层；相机、节点身份、路由、选择、tracer、Inspector 和导出仍由同一个 `FactorySceneCanvas` 管理。

## Owner 数据事务

Owner UI 只在服务端确认 HttpOnly 会话后渲染。mutation 使用 revision/hash CAS；Markdown、presentation 和资产引用在写入前创建 revision snapshot，通过 transaction journal 与 atomic replace 提交。失败恢复旧文件并抛出错误。软删除只写 sidecar，Markdown 保留；恢复历史会生成新的 revision。

生产数据根包含内置/用户文档以及 `data/presentation`、`data/revisions`、`data/transactions`、`data/revision-audit`、`data/assets/portraits`。候选 Compose 只让 UID 10001 写入 `/data`，secret 通过 `/run/secrets` 注入。

## 已发现并固定的失败模式

- React Flow handle 使用 `top/bottom/left/right`，路由输出 `top-in/out`，导致模型有边而 DOM 为 0；真实 SVG 计数测试必须保留。
- Worker hook 的 `view` 对象若每次 render 重建，会持续 terminate/restart worker；调用方必须 memoize layout view。
- 仅按 waypoint 判断视口相交会漏掉穿越视口的长线；必须使用 segment/rectangle 相交。
- Owner 排序 payload 曾携带 `parentSectionHash`，API strict schema 却不接受；CRUD 浏览器测试必须覆盖移动与软删除。
- production `Secure` cookie 在 `127.0.0.1` 测试地址不会回传；Playwright production fixture 使用 `localhost`。
- `output: standalone` 的浏览器测试必须实际运行 production build，不能用 HMR 代替。
- Next 内置 Sharp 与直接依赖版本不一致会在 macOS 同时加载两套 libvips；直接依赖固定为 Next 当前使用的 `0.34.5` 并以 `npm ls sharp --all` 验证去重。
- WebKit 对完全透明 SVG stroke 的 hover/click 命中不稳定；命中线使用 `0.001` stroke opacity，并以 mouse enter、pointer up 和键盘路径分别验收。
- 外层 ResizeObserver 不得执行已排队但已失效的自动适配；视口一旦完成变更即关闭 auto-fit，resize timer 在执行时再次核验，避免 hover 后线路坐标漂移。
- Docker 29 containerd image store 的 `.Id` 可表示 manifest digest，而 Docker 26 传统 store 在 `docker load` 后可能以 config digest 表示 image ID；禁止跨版本直接断言 `.Id == config digest`。候选制作分别校验 Buildx manifest 与本地 RepoDigest，并从最终 `docker save` 归档提取 config blob、重算其 SHA-256 后再与 Buildx runtime config digest 比对。
- Buildx 的全局当前 builder 会被其他项目切换，且可能携带不相容的 registry mirror；候选脚本必须要求显式 `BUILDX_BUILDER`、通过 `--builder` 传入并把 builder 身份写入 manifest。
- Next standalone 在容器或反向代理后的 `req.nextUrl.origin` 可能是内部 origin，不等于浏览器 `Origin`；Owner 同源校验使用 edge 覆盖后的 `Host` 和受限 `X-Forwarded-Proto` 重建网络 origin，非 `http/https`、多值 protocol 或非法 Host 均 fail closed。
- Distroless Node 22 中的 stdin smoke 程序不得混用 CommonJS `require()` 与 top-level `await`；使用 `--input-type=module` 和 ESM import 锁定模块格式。
- Docker `diff` 会把只读 bind-mounted secret 报告为 `/run` 下的新增挂载点；验证器先通过 inspect 确认两个精确 secret mount 均为 `bind:false`，然后只允许这两个路径及其直接挂载父节点；禁止把整个 `/run/**` 加入 diff allowlist。
- SVG pipelines 与 DOM nodes 若分别形成 `z-index: 2/3` 的父级 stacking context，floor 壳体会覆盖所有关系线和 18px hit path；nodes 容器不得建立统一 stacking context，结构壳体、pipeline、room/content 必须分别处于 `0/2/3` 层，并由浏览器 `elementFromPoint` 验证真实命中。
- 跨层主流程若每层都按同一方向排列，会在层尾到下一层层首形成整层 U 形折返；楼层按业务顺序蛇形排列，跨层 flow 进入短竖向 riser，治理关系使用独立源端竖向主干和单一目标接入段。
- section body 若没有尾换行，直接拼接下一 heading 会让 Markdown 解析器吞并后续模块；replacement 在非空 suffix 前必须补用源文档行尾风格。mutation 与 restore 的精确重放以 canonical request hash、当前 revision/hash 和最新 audit entry 三者一致为前提返回原结果，其他 stale request 仍返回冲突。
- 双层 Nginx 中 edge 不得把 shared proxy 已确认的 public `X-Forwarded-Proto` 覆盖成内部 HTTP `$scheme`；shared 负责覆盖外部输入，edge 透传，应用继续对 protocol/Host 做 fail-closed 校验。
- Node 默认 `umask 0022` 会让未指定 mode 的原子临时文件落成 `0644`；`atomicWriteText()` 必须显式创建 `0750` 父目录和 `0640` 临时文件，再执行 rename。unit、mutation 集成测试与 Owner image smoke 都必须检查实际 mode，不能只依赖部署前一次性 `chmod`。
- `html-to-image` 深克隆 DOM 时不会把嵌套 SVG 子节点的 computed CSS 递归固化；关系 `path` 只依赖外部 class 时，下载产物会回退到 SVG 默认 `fill: black`，把开放正交路径隐式闭合成大面积黑色多边形。所有 export-visible line、hit path、marker、label 和 tracer 都必须携带完整 presentation attributes；真实虚线使用用户坐标长度，不设置归一化 `pathLength`。
- 导出回归不能只检查文件头、字节数、class 或边数。Chromium 必须用 gated production-rendering fixture 实跑 flow、dependency、governance、resource 四种分支，下载后以 `image/svg+xml` 独立文档重新打开并校验精确 RGB、线宽、dash、marker 与 18px 命中层；PNG 同时保留 Sharp 解码、entropy 与近纯黑像素灾难门。

## 验证门

- `npm test`：模型、scene、路由、状态迁移、Owner 会话、mutation/revision、Sharp、Docker 契约。
- `npm run typecheck` 与 `npm run build`。
- Playwright Chromium/WebKit/移动端：三文档边数、关系 Inspector/一次性 tracer、焦点、reduced motion、Owner CRUD/CAS/restore、安全负例、PNG、独立 SVG 与四关系 presentation fixture、视觉快照。
- Chromium 规模夹具：1000 scene nodes、2000 relations、FCI ≤2.5s、渲染 ≤350/700、55fps、重路由 p95 ≤50ms。
- Owner amd64 image smoke 与 Compose config 只能证明 L2 候选，不等于生产验收。

## D6 新鲜验证（2026-07-22）

- 完整 unit/contract：`347/347`；TypeScript 与 production build 通过。
- Chromium/WebKit：默认 Map、显式 Factory、8/8/8 关系计数不变、关系 Inspector、一次性 tracer 与两份视觉基准通过。
- Chromium：viewport PNG 与 full-scene SVG 真实下载、独立 SVG 四类关系 presentation 通过。
- Chromium mobile：纵向关系轨与只读边界通过。
- 全套 Playwright 的 1000/2000 性能门仍沿用 D5 结论：全套顺序下曾低于 55fps、隔离复跑通过；D6 未放宽阈值，D8 前不能声明全套发布门通过。
- 本状态是 `local implementation verified`；未 commit、push、构建候选或改变生产。

## D7 响应式新鲜验证（2026-07-23）

- 1280+ 保持完整桌面画布，768–1279 使用紧凑 shell 与右侧 reader drawer，<768 切换为只读纵向关系轨和底部导航。
- 1024px drawer 经真实浏览器复验为 420px 宽、右/下 12px；修复了继承桌面第二列定位后仅 50px 宽的布局缺陷。
- 390×844 为 `overflow=0`，五项底部导航目标均为 `75×48px`；节点详情覆盖全视口、标记“只读”、不暴露 Owner 或内容写控件，并使用 overscroll containment。
- focused contract `40/40`、完整 unit `350/350`、typecheck、production build 与 standalone E2E preparation 通过；Pixel 7 关系轨视觉用例正常复跑 `1/1`；D8 全局 55fps 性能门仍开放。
- 本状态仍是 `local implementation verified`；未 commit、push、构建候选或改变生产。

## D8 性能与工程治理验证（2026-07-23）

- 1000/2000 基线连续三次为 `50.00–52.94fps`；相机交互改为即时 DOM transform，viewport 与虚拟化查询在 80ms trailing commit，避免每帧 React 重绘可见节点与关系。
- 隔离连续 `3/3` 通过，最终完整 Playwright 顺序中的规模夹具也通过；55fps、25ms frame p95、50ms reroute p95、2.5s 首次交互和 350/700 渲染上限均未放宽。
- wheel 改为原生 `{ passive:false }` 监听，真实 Chromium 缩放 console 从 passive-listener error 恢复为 `0/0`。
- Canvas 记录 zoom、pan、drag、reroute 指标；真实浏览器样本为 zoom handler `0.10ms`、scene materialize/reroute `5.00ms`。
- Canvas CSS 已从 `globals.css` 迁移到独立 `app/canvas.css`；Canvas 仍通过既有 worker、空间索引和视口虚拟化保持确定性。

## D9 自动化验收（2026-07-23）

- 三内置文档继续满足 model/layout/scene/SVG/hit-path 关系计数一致；关系 Inspector、一次性 tracer、reduced-motion、PNG、full-scene SVG 和四关系 presentation 均在完整套件通过。
- 1000-node/2000-relation 规模夹具在最终 66-case Playwright 顺序通过，阈值没有放宽。
- Chromium Desktop 完成隔离 Owner CRUD、stale CAS 与 revision restore；Chromium Mobile 完成只读流程轨、44px 触控和无横向溢出。
- D9 专项加上既有全套最终为 `45 passed / 21 intentionally skipped / 0 failed`；unit `356/356`、typecheck 和 production build 通过。
- 本状态只支持本地自动化验收；未 commit、push、构建候选或改变生产。
- 最终 unit `353/353`、typecheck、production build、Playwright `34 passed / 17 intentionally skipped / 0 failed`；未 commit、push、构建候选或改变生产。
