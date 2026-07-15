---
title: DocCanvas 活体产品工厂剖面实施计划
status: completed
updated: 2026-07-15
design: ../specs/2026-07-15-doccanvas-living-product-factory-design.md
---

# DocCanvas 活体产品工厂剖面实施计划

## 1. 目标与边界

按已批准设计，把工作台和三张内置画布重构为生产级“活体产品工厂剖面”，包含新设计系统、2.5D 建筑、八名真人化数字员工、确定性正交管线、精确搜索定位、移动端一致性以及可靠的视图保存和导出反馈。

本计划只修改本地源码、测试、静态资产和项目文档。禁止执行 commit、push、merge、部署、容器替换、Nginx/DNS/TLS 修改、owner 写模式或生产数据写入。边界保持 `production unchanged`。

## 2. 当前证据与工作树保护

### 2.1 新鲜基线

- 分支：`codex/architecture-house-ui`，upstream 为 `origin/codex/architecture-house-ui`。
- 相关基线测试：38/38 通过。
- 相关测试覆盖 architecture layout/presentation/surfaces、editorial UI、production readonly contract 和 PNG helper。
- 项目没有 lint script，不声明 lint 通过。

### 2.2 必须保留的既有改动

- `DEPLOY.md`
- `deploy/tencent/PRODUCTION-RUNBOOK.md`
- `tests/tencent-runtime-renderer.test.ts`
- `output/`

实施不得覆盖、格式化、stage 或顺手修改以上内容。

## 3. 根因与目标架构

当前 `CanvasViewer.tsx` 同时承担投影、React Flow 节点/边、视图恢复、搜索定位、PNG 导出和桌面/移动编排，超过 1200 行。`ArchitectureFloorNode` 把多个房间嵌在单个 React Flow 节点中，因此边只能连接楼层容器，不能表达房间关系；focused layout 明确返回空 `edges`。

目标架构：

```text
Markdown / DocumentPresentation
  -> ArchitectureViewModel
  -> FactoryPresentationRegistry
  -> ArchitectureLayoutResult
       - structural nodes
       - room/content nodes
       - deterministic relation edges
       - orthogonal waypoints
  -> React Flow desktop projection
  -> native mobile projection
```

设计令牌、展示元数据、布局/路由和 React 组件必须分离。桌面与移动端共享 ViewModel 和角色注册表，不各自重新分类内容。

## 4. 顺序 TODO

| ID | 批次 | 状态 | 完成门槛 |
|---|---|---|---|
| T0 | 规格与基线封板 | completed | 设计批准、实施计划、相关测试 38/38、AGENTS 入口 |
| T1 | 新设计系统与展示注册表 | completed | 令牌、八岗位、环境映射、确定性测试 |
| T2 | 建筑布局与生产管线路由 | completed | 房间成为可连线节点；总览与 focused 均有确定性正交关系 |
| T3 | 桌面建筑组件与 2.5D 外壳 | completed | 固定门楣、锯齿屋顶、房间、人物、主轴与管线落地 |
| T4 | 岗位工作间与精确搜索 | completed | 搜索直接打开目标节点，节点关系可读 |
| T5 | 工作台与生产只读表达 | completed | 入口大厅、只读状态、无误导性 disabled CRUD 表单 |
| T6 | 移动端一致性 | completed | 楼层折叠、人物、状态、精确节点与 44px 触控目标 |
| T7 | 数字员工正式资产 | completed | 八名合成人物、统一构图、响应式静态资产与回退 |
| T8 | 保存视图与导出反馈 | completed | “保存视图”、PNG/Markdown 成功失败反馈、PNG 根因验证 |
| T9 | 全量验证与状态同步 | completed | verify:local、真实 Chrome 四页双视口、文档同步 |

执行顺序固定为 `T0 -> T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 -> T9`。每批先写失败测试或可复现检查，再实现，再跑相关回归。

## 5. T1 — 新设计系统与展示注册表

### 文件

- 新增 `opendesign/design-systems/doccanvas-product-factory/SKILL.md`。
- 新增 `opendesign/design-systems/doccanvas-product-factory/README.md`。
- 新增 `opendesign/design-systems/doccanvas-product-factory/tokens/colors_and_type.css`，作为唯一规范令牌入口。
- 新增 `opendesign/design-systems/doccanvas-product-factory/brand/voice-and-tone.md`。
- 新增 `opendesign/design-systems/doccanvas-product-factory/brand/style-notes.md`。
- 修改 `app/globals.css`，只负责导入规范令牌和消费语义类，不再建立第二份令牌源。
- 新增 `lib/canvas/factory-presentation.ts`。
- 新增 `tests/factory-presentation.test.ts`。
- 修改 `tests/editorial-ui-contract.test.ts`，锁定令牌入口与禁止页面级重复颜色。

### RED

新增测试证明当前缺少：

1. 已批准的 `--factory-*` 令牌。
2. 八个唯一岗位 ID。
3. Playbook 八个 capability region 的完整映射。
4. lifecycle Stage 1–8 的稳定岗位映射。
5. 角色、环境和 accent 输出的确定性。
6. 未知 region 的显式中性回退，不读取或修改 Markdown。

运行：

```bash
npx tsx --test tests/factory-presentation.test.ts tests/editorial-ui-contract.test.ts
```

### GREEN

- 建立颜色、字体、空间、深度、动效、连线令牌。
- 建立 `FactoryEmployeeRole`、`FactoryEnvironment`、`FactoryPresentation` 类型。
- 以 `ArchitectureRegion.id`、`mode` 和 `stageNumber` 映射岗位与环境。
- 不复制文档路径；文档身份继续来自 `document-registry.ts`。
- 不使用 `Math.random()`。

### 回归

```bash
npx tsx --test tests/factory-presentation.test.ts tests/architecture-presentation.test.ts tests/editorial-ui-contract.test.ts
npm run typecheck
```

## 6. T2 — 建筑布局与生产管线路由

### 文件

- 修改 `lib/canvas/layout-engine.ts`。
- 新增 `lib/canvas/orthogonal-router.ts`。
- 修改 `components/canvas/ArchitectureNodes.tsx` 的数据契约。
- 新增 `components/canvas/FactoryPipelineEdge.tsx`。
- 修改 `components/canvas/CanvasViewer.tsx` 的节点/边投影。
- 扩展 `tests/architecture-layout.test.ts`。
- 新增 `tests/orthogonal-router.test.ts`。

### RED

新增测试证明当前：

1. overview 房间不是独立可连线 layout node。
2. module overview 没有关系边。
3. focused layout 返回空 edges。
4. lifecycle 现有路径可能产生零长度或反向折返段。
5. 边没有显式方向与关系类型。

### GREEN

- 将楼层容器和房间节点拆开；房间成为 React Flow 子节点。
- 增加结构主轴节点或等价的确定性路由通道。
- lifecycle 按 Stage 顺序建立 `flow` 关系。
- Playbook 按已批准 capability 顺序建立模块级 `flow`，治理关系使用 `governance`。
- focused mode 从原始 `DocEdge` 投影区域内的节点级关系。
- 路由器返回明确 waypoints、source handle、target handle 和 marker。
- 只允许水平/垂直段，过滤零长度段和反向折返。
- 多条同向关系使用稳定 channel offset；不得穿过节点矩形。

### 回归

```bash
npx tsx --test tests/orthogonal-router.test.ts tests/architecture-layout.test.ts tests/architecture-presentation.test.ts
npm run typecheck
```

## 7. T3 — 桌面建筑组件与 2.5D 外壳

### 文件

- 新增 `components/canvas/FactoryHeader.tsx`。
- 新增 `components/canvas/DigitalEmployee.tsx`。
- 修改 `components/canvas/ArchitectureNodes.tsx`。
- 修改 `components/canvas/CanvasViewer.tsx`。
- 修改 `app/globals.css`。
- 扩展 `tests/architecture-surfaces.test.ts` 与 `tests/editorial-ui-contract.test.ts`。

### RED

静态与行为测试锁定：

- 标题门楣位于 React Flow 缩放层之外。
- 桌面 H1 使用设计令牌且最小 36px。
- 屋顶使用结构化锯齿层，不承载缩放正文。
- 房间显示岗位、职责、状态和人物资源/回退。
- 保存按钮文案为“保存视图”。
- 2.5D 动效受 reduced motion 控制。

### GREEN

- 提取固定门楣和工具栏，减少 `CanvasViewer` 编排责任。
- 屋顶、楼板、墙体、地基使用三层深度令牌。
- 房间正文始终正视，不随 2.5D 透视倾斜。
- 人物资源未就绪时先使用正式岗位占位卡，不使用 emoji。
- 默认 fitView 参数以建筑占屏目标为准，不靠空白 bounds 撑比例。

### 回归

```bash
npx tsx --test tests/architecture-surfaces.test.ts tests/editorial-ui-contract.test.ts tests/canvas-production-contract.test.ts
npm run typecheck
```

## 8. T4 — 岗位工作间与精确搜索

### 文件

- 修改 `components/canvas/SearchPanel.tsx`。
- 修改 `components/canvas/CanvasViewer.tsx`。
- 修改 `components/canvas/ArchitectureRegionReader.tsx`。
- 修改 `components/canvas/NodeDetailSheet.tsx`。
- 修改 `components/canvas/MobileArchitectureView.tsx`。
- 扩展 `tests/architecture-surfaces.test.ts` 与 `tests/detail-search-presentation.test.ts`。

### RED

测试稳定复现：点击搜索结果只选择所属 region，没有打开精确目标节点详情。

### GREEN

- 搜索结果保留 query、nodeId、regionId 和来源展示信息。
- 点击结果一次完成：关闭搜索 -> 进入岗位工作间 -> 高亮节点 -> 打开节点详情。
- 未找到精确节点时保留搜索上下文并提示内容已变化，不按 heading 猜测。
- 返回总览后仍能重新打开原搜索上下文。
- 生产节点详情继续只读。

### 回归

```bash
npx tsx --test tests/detail-search-presentation.test.ts tests/architecture-surfaces.test.ts tests/canvas-production-contract.test.ts
npm run typecheck
```

## 9. T5 — 工作台与生产只读表达

### 文件

- 修改 `components/canvas/WorkspaceDashboard.tsx`。
- 修改 `tests/display-format.test.ts`。
- 新增或扩展工作台 UI contract 测试。

### RED

- 生产 readonly 当前仍渲染 disabled 创建表单。
- 工作台卡片没有共享设计令牌和工厂入口语义。

### GREEN

- readonly 模式不渲染创建表单或 owner token 入口。
- dev/owner 写路径保持现有能力，不删除 API 或写入守卫。
- 三份内置文档使用入口大厅卡，显示定位、状态、更新时间和只读边界。
- Markdown 下载与进入画布仍使用现有 route/registry。

### 回归

```bash
npx tsx --test tests/display-format.test.ts tests/canvas-production-contract.test.ts
npm run typecheck
```

## 10. T6 — 移动端一致性

### 文件

- 修改 `components/canvas/MobileArchitectureView.tsx`。
- 修改 `app/globals.css`。
- 扩展 `tests/architecture-surfaces.test.ts` 与 `tests/editorial-ui-contract.test.ts`。

### RED / GREEN

- 锁定 390px 无页面级横向溢出。
- 所有可操作控件至少 44×44px。
- 移动房间显示岗位、人物、状态和节点/资源统计。
- 精确搜索命中自动展开正确楼层、轨道和节点详情。
- 移动端禁用视差，reduced motion 路径一致。

## 11. T7 — 数字员工正式资产

### 文件

- 新增 `public/digital-employees/` 下八名合成人物的响应式资产。
- 新增资产清单或在 `factory-presentation.ts` 中引用稳定 portrait key。
- 修改 `DigitalEmployee.tsx` 使用 `next/image` 或项目现有静态图片路径。
- 新增静态资产契约测试。

### 资产约束

- 使用图像生成能力创建，不抓取或冒用真实人物照片。
- 八人统一 4:5 半身构图、镜头高度、柔和侧光、服装体系和暖工业背景。
- 每名角色具有差异化岗位工具，但不添加文字水印。
- 输出 WebP/AVIF；单张首屏候选目标不超过 140KB。
- 资源缺失时显示正式岗位占位卡，页面保持完整。

## 12. T8 — 保存视图与导出反馈

### 文件

- 修改 `components/canvas/CanvasViewer.tsx`。
- 按实际复现结果修改 `lib/canvas/png-export.ts`。
- 扩展 `tests/png-export.test.ts` 与 `tests/canvas-production-contract.test.ts`。

### RED

- 在本地生产构建中复现 Playbook 速读状态的 PNG 行为。
- 区分真实生成失败、下载事件未触发和浏览器插件观察限制。
- 如无法复现，不假设根因；只保留证据并增强用户反馈。

### GREEN

- 保存文案统一为“保存视图”。
- readonly 保存只写 localStorage，保留既有三次退避与状态恢复契约。
- PNG/Markdown 都有 generating/success/error 状态。
- PNG 失败向用户显示可读错误和重试入口。
- 导出完成后恢复原 canvas view、viewport、reader 和选中状态。

## 13. T9 — 验证与项目状态同步

### 自动化

```bash
npm run verify:local
git diff --check
```

### 真实 Chrome

逐页验证：

1. `/`
2. `/canvas/vibe-track`
3. `/canvas/v2-pro`
4. `/canvas/playbook-v2`

视口：当前桌面默认视口与 390×844。

检查：标题字号、建筑占屏、屋顶、人物、状态、连线方向与折返、搜索精确定位、节点详情、保存视图、Markdown、PNG、console、横向 overflow、键盘焦点和 44px 触控目标。

### 文档同步

- 更新 `.kiro/plan/task_plan.md` 与 `.kiro/plan/progress.md`，只记录实际完成和新鲜证据。
- 若实现产生长期有效架构知识，更新本 `AGENTS.md` 对应事实。
- 不修改历史 `audit/` 文档。
- 不把本地验证写成部署或生产验收。

### 执行结果（2026-07-15）

- `npm run verify:local`：TypeScript 通过、215/215 tests 通过、Next.js 15.5.20 production build 通过；7/7 static pages 生成成功。
- `git diff --check` 通过；项目无 lint script，因此没有 lint 结论。
- Chrome 最终矩阵覆盖四页、1440×900 与 390×844；无正向横向 overflow，移动可见操作目标最小 44px。
- 三张桌面画布各有 8 个房间、8 张已加载人物图与 8 条正交关系边；0 条曲线/对角线段。
- Playbook 的精确搜索、readonly 详情、保存状态、Markdown/PNG、键盘焦点和 console 均通过。
- 验收中发现移动端保存会持久化隐藏桌面 viewport；按同一路径增加失败测试并修复。最终移动保存后回到桌面，8 个房间与原 fit transform 均保持完整。
- 本地 readonly API 为 health 200、三写 API 403、Markdown export 200。
- 最终状态：`implementation_complete_local / production unchanged`。

## 14. 停止条件

- 同一问题第三次验证仍失败，停止局部 patch，回到布局/数据流审查。
- 发现需修改 Markdown 事实源、写入守卫、生产 owner 配置或部署拓扑，停止并请求新授权。
- 发现本任务需要覆盖既有 dirty 文件，停止并请求用户决策。
- 图片资产无法满足一致性、许可或体积约束时，保留岗位占位卡并明确未完成，不使用低质量拼贴替代。

## 15. 完成声明

只有 T1–T9 全部完成并附新鲜自动化与 Chrome 证据，才能声明 `implementation_complete_local`。生产仍保持 `production unchanged`；部署、activation 和 `production_accepted` 需要独立授权与证据。
