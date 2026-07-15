---
title: DocCanvas Factory Scene v3 工程记录
status: implementation_complete_local
updated: 2026-07-15
---

# Factory Scene v3 工程记录

## 当前决策

DocCanvas 桌面画布使用 DOM 节点和一个 SVG 关系层，不再使用 React Flow。正式发布不保留双引擎 feature flag；旧 image 只作为事故恢复材料。移动端使用原生纵向流程轨且始终只读。

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
- 静止状态不循环动画；一次性 tracer 为 260ms，可取消重启；reduced motion 不创建 tracer。
- 拖动期间无 transform transition；端点即时跟随，50ms 增量避障，释放后精确重路由。
- 语义缩放阈值为 `<0.45` 聚合、`0.45–0.8` 简化、`>0.8` 完整。
- 视口 overscan 后最多渲染 350 个 DOM 节点与 700 条 SVG 关系路径。
- `factory-scene-v3` 只迁移旧 viewport、选中模块和展开状态，节点坐标重新布局。

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

## 验证门

- `npm test`：模型、scene、路由、状态迁移、Owner 会话、mutation/revision、Sharp、Docker 契约。
- `npm run typecheck` 与 `npm run build`。
- Playwright Chromium/WebKit/移动端：三文档边数、关系 Inspector/tracer、焦点、reduced motion、Owner CRUD/CAS/restore、安全负例、PNG/SVG、视觉快照。
- Chromium 规模夹具：1000 scene nodes、2000 relations、FCI ≤2.5s、渲染 ≤350/700、55fps、重路由 p95 ≤50ms。
- Owner amd64 image smoke 与 Compose config 只能证明 L2 候选，不等于生产验收。
