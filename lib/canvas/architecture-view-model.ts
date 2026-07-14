/**
 * A client-safe, serializable projection of a parsed Markdown graph into the
 * architectural concepts rendered by DocCanvas. This module intentionally has
 * no React, filesystem, or Node-only dependencies so the same projection can
 * run during SSR and in CanvasViewer.
 */
import type { DocCanvas, DocEdge, DocNode } from '../parser/types';
import { cleanPresentationText, createPresentationText } from './presentation-text';

export type ArchitectureMode = 'lifecycle' | 'module';
export type ArchitectureTrack = 'vibe' | 'shared' | 'pro';
export type ArchitectureRegionKind = 'roof' | 'foyer' | 'room' | 'foundation' | 'annex';

export interface ArchitectureTrackSummary {
  track: ArchitectureTrack;
  nodeIds: string[];
  count: number;
  previewNodeIds: string[];
}

export interface ArchitectureResourcePreview {
  id: string;
  title: string;
  sourceTitle: string;
  kind: 'tool' | 'prompt' | 'reference';
  track: ArchitectureTrack;
}

export interface ArchitectureResourceSummary {
  count: number;
  toolNodeIds: string[];
  promptNodeIds: string[];
  referenceNodeIds: string[];
  previews: ArchitectureResourcePreview[];
}

export interface ArchitectureRegion {
  id: string;
  kind: ArchitectureRegionKind;
  title: string;
  /** Raw heading retained for indexing/editing. Never render directly. */
  sourceTitle: string;
  /** Raw headings represented by an aggregated room. Never render directly. */
  sourceTitles: string[];
  /** Display-safe provenance labels for readers and search results. */
  sourceLabels: string[];
  summary: string;
  order: number;
  stageNumber?: number;
  headingNodeIds: string[];
  nodeIds: string[];
  previewNodeIds: string[];
  trackSummaries: ArchitectureTrackSummary[];
  resources: ArchitectureResourceSummary;
  /** Explicit stage headings nested inside a module room. */
  nestedStageNumbers: number[];
}

export interface ArchitectureFloor {
  id: string;
  label: string;
  order: number;
  regionIds: string[];
}

export interface ArchitectureViewModel {
  documentId: string;
  title: string;
  version: string;
  mode: ArchitectureMode;
  graphFingerprint: string;
  rootNodeId?: string;
  stageHeadingIds: string[];
  floors: ArchitectureFloor[];
  regions: ArchitectureRegion[];
  nodeRegionId: Record<string, string>;
  nodePresentationCopy: Record<string, { title: string; summary: string }>;
}

type ArchitectureDocument = Pick<DocCanvas, 'id' | 'title' | 'version' | 'nodes' | 'edges'> &
  Partial<Pick<DocCanvas, 'metadata'>>;

interface RegionDraft {
  id: string;
  kind: ArchitectureRegionKind;
  title: string;
  summary: string;
  order: number;
  stageNumber?: number;
  headingNodeIds: string[];
  nodeIds: string[];
}

const TRACK_ORDER: ArchitectureTrack[] = ['vibe', 'shared', 'pro'];
const FOUNDATION_PATTERN = /原则|铁律|治理|安全|规范|宪章|共享|公共|基础设施|准备|约束/;
const PRESENTATION_SCHEMA = 'editorial-architecture-v1';
const PLAYBOOK_DOMAIN_MAPPING_VERSION = 'playbook-capabilities-v2';

const LIFECYCLE_COPY: Readonly<Record<number, Readonly<{ title: string; summary: string }>>> = {
  0: { title: '使用入口', summary: '明确目标、路径和开始条件' },
  1: { title: '机会与需求', summary: '识别值得解决的问题与真实约束' },
  2: { title: '产品定义', summary: '把目标转成范围、验收和优先级' },
  3: { title: '技术蓝图', summary: '明确架构、数据、安全和失败边界' },
  4: { title: '构建与交付', summary: '形成可独立验证与回退的增量' },
  5: { title: '质量保障', summary: '验证真实用户路径和异常恢复' },
  6: { title: '发布与运行', summary: '固定候选、配置、切换和回滚证据' },
  7: { title: '增长运营', summary: '用运行数据驱动采用、留存和优化' },
  8: { title: '学习与进化', summary: '将反馈转成下一轮可验证改进' },
};

interface PlaybookDomainDefinition {
  id: string;
  title: string;
  summary: string;
  sourceTitles: readonly string[];
}

const PLAYBOOK_DOMAINS: readonly PlaybookDomainDefinition[] = [
  {
    id: 'use-navigation-evidence',
    title: '使用导航与证据',
    summary: '说明阅读路径、成熟度和证据来源',
    sourceTitles: ['0. 文档架构总览', '成熟度标注说明', '关联审计文档'],
  },
  {
    id: 'factory-operating-model',
    title: '产品工厂运行模型',
    summary: '建立从单次开发到持续运营的工作模型',
    sourceTitles: ['一、平台总览：从"开发一个产品"到"运营一个产品工厂"'],
  },
  {
    id: 'product-knowledge-foundation',
    title: '产品定义与知识底座',
    summary: '沉淀产品基因、共享组件和知识资产',
    sourceTitles: ['二、产品基因组系统', '七、共享组件库', '🆕 共享知识库系统（v2.8）'],
  },
  {
    id: 'security-governance',
    title: '安全与治理',
    summary: '约束连接、权限、进化边界和资产晋升',
    sourceTitles: [
      'MCP安全与传输：2026年7月最新状态',
      '四、进化宪章：不可变的约束边界',
      '十、进化宪章的执行机制',
      '🆕 Promotion State Machine：知识/资产的治理状态机',
    ],
  },
  {
    id: 'self-evolution',
    title: '自进化引擎',
    summary: '把反馈、评估和治理转成受控改进循环',
    sourceTitles: ['三、四维自进化引擎'],
  },
  {
    id: 'delivery-automation',
    title: '交付与自动化',
    summary: '组织生命周期、执行规范、脚本和工具资源',
    sourceTitles: [
      '五、Codex可执行指令格式规范',
      '六、八阶段生命周期（Codex可执行版）',
      '八、平台级关键脚本清单',
      '🆕 模块工具推荐目录',
      '关联脚本清单（已实现 17 个脚本）',
    ],
  },
  {
    id: 'business-scale',
    title: '经营与规模化',
    summary: '评估成本、收益和规模化经营条件',
    sourceTitles: ['九、财务模型与ROI分析'],
  },
  {
    id: 'boundaries-evolution',
    title: '边界与演进',
    summary: '记录当前限制、前瞻能力和版本变化',
    sourceTitles: ['附录：前瞻性能力（2026年不可用）', '十一、一个人+Codex的实际限制', 'Changelog'],
  },
];

const PLAYBOOK_DOMAIN_BY_SOURCE_TITLE = new Map(
  PLAYBOOK_DOMAINS.flatMap(domain => domain.sourceTitles.map(title => [title, domain.id] as const)),
);

const PLAYBOOK_HEADING_COPY: Readonly<Record<string, Readonly<{ title: string; summary: string }>>> = {
  '0. 文档架构总览': { title: '使用路径', summary: '选择正确文档与阅读顺序' },
  '成熟度标注说明': { title: '证据分级', summary: '统一声明的成熟度与证据口径' },
  '一、平台总览：从"开发一个产品"到"运营一个产品工厂"': { title: '工厂运行模型', summary: '从单次交付走向持续产品运营' },
  'MCP安全与传输：2026年7月最新状态': { title: '连接安全', summary: '约束协议、认证与传输边界' },
  '二、产品基因组系统': { title: '产品基因组', summary: '固化可实例化的产品定义' },
  '三、四维自进化引擎': { title: '进化闭环', summary: '用反馈、评估与治理驱动改进' },
  '四、进化宪章：不可变的约束边界': { title: '不可变边界', summary: '明确系统不能突破的约束' },
  '五、Codex可执行指令格式规范': { title: '执行指令规范', summary: '把意图转成可校验的代理任务' },
  '六、八阶段生命周期（Codex可执行版）': { title: '生命周期编排', summary: '贯通定义、构建、发布与运营' },
  '七、共享组件库': { title: '共享组件体系', summary: '复用跨产品能力与资产' },
  '八、平台级关键脚本清单': { title: '自动化工具链', summary: '汇总平台级执行脚本' },
  '九、财务模型与ROI分析': { title: '财务与回报', summary: '量化成本、收益与投入边界' },
  '十、进化宪章的执行机制': { title: '宪章执行', summary: '将约束接入运行与审计' },
  '🆕 Promotion State Machine：知识/资产的治理状态机': { title: '资产晋升治理', summary: '管理知识与资产的状态变化' },
  '附录：前瞻性能力（2026年不可用）': { title: '前瞻能力', summary: '区分当前可用与未来候选' },
  '十一、一个人+Codex的实际限制': { title: '单人运行边界', summary: '说明一个人与 Codex 的现实限制' },
  Changelog: { title: '版本演进', summary: '记录行为与能力的变化' },
  '🆕 模块工具推荐目录': { title: '工具资源目录', summary: '按能力域收纳推荐与备选' },
  '🆕 共享知识库系统（v2.8）': { title: '共享知识体系', summary: '统一跨文档事实与更新路径' },
  '关联脚本清单（已实现 17 个脚本）': { title: '已实现自动化', summary: '对齐可执行脚本与覆盖范围' },
  '关联审计文档': { title: '审计证据', summary: '汇总验证来源与历史审查' },
  '5.1 每条指令的标准模板': { title: '标准指令模板', summary: '规定任务、输入、输出、证据门和失败处理' },
  '5.2 关键原则（来自2026年研究证据）': { title: '指令设计原则', summary: '用约束、验证条件和失败边界提升执行可靠性' },
  '模块化规范文件：project-spec/what-vision.md': { title: '产品愿景规范', summary: '定义问题、用户、价值与成功条件' },
  '模块化规范文件：project-spec/agents/agent-spec-{feature}.md': { title: 'Agent 行为规范', summary: '约束角色、输入、输出和失败边界' },
  '模块化规范文件：project-spec/how-architecture.md': { title: '架构设计规范', summary: '固定系统边界、数据流和关键技术决策' },
  '模块化规范文件：project-spec/how-security.md + project-spec/how-testing.md': { title: '安全与质量规范', summary: '同步加载安全约束与测试策略' },
  '模块化规范文件：project-spec/how-testing.md': { title: '质量验证规范', summary: '定义验证范围、证据和失败处理' },
  '第〇部分：Codex 基础设施': { title: 'Codex 基础设施工具', summary: '组织代理运行所需的基础能力' },
  '第一部分：知识架构': { title: '知识架构工具', summary: '组织知识采集、检索与维护能力' },
  '第二部分：Agent 工程': { title: 'Agent 工程工具', summary: '组织代理设计、编排与运行能力' },
  '第三部分：评估体系': { title: '评估体系工具', summary: '组织质量评估与回归验证能力' },
  '第四至八部分：开发生命周期': { title: '生命周期工具', summary: '覆盖构建、测试、发布与运营环节' },
};

function isStageHeading(node: DocNode): boolean {
  return node.metadata.isStageHeading === true && Number.isInteger(node.stageNumber);
}

function isReferenceNode(node: DocNode): boolean {
  return node.metadata.isToolReference === true;
}

function isResourceNode(node: DocNode): boolean {
  return isReferenceNode(node) || node.type === 'tool' || node.type === 'prompt';
}

function architectureTrack(node: DocNode, fallback: ArchitectureTrack = 'shared'): ArchitectureTrack {
  if (node.track === 'vibe') return 'vibe';
  if (node.track === 'pro') return 'pro';
  if (node.track === 'both') return 'shared';
  return fallback;
}

function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function padOrdinal(value: number): string {
  return String(value).padStart(2, '0');
}

function graphemes(value: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const Segmenter = Intl.Segmenter as typeof Intl.Segmenter;
    return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(value)]
      .map(segment => segment.segment);
  }
  return Array.from(value);
}

function productizeModuleTitle(sourceTitle: string, ordinal: number, duplicateIndex: number): string {
  const normalized = cleanPresentationText(sourceTitle.normalize('NFKC'))
    .replace(/^(?:第\s*)?(?:\d+|[一二三四五六七八九十百零〇]+)\s*[、.．:：章节篇部]\s*/u, '')
    .replace(/^附录\s*[:：-]?\s*/u, '')
    .replace(/[（(](?:v?\d+(?:\.\d+)*|\d{4}(?:[-年/]\d{1,2})?(?:[-月/]\d{1,2})?|已实现[^）)]*|不可用|新增|草案|状态[^）)]*)[）)]/giu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const fallback = normalized || `能力模块 ${padOrdinal(ordinal)}`;
  const limit = /\p{Script=Han}/u.test(fallback) ? 18 : 36;
  const bounded = graphemes(fallback).slice(0, limit).join('').trim() || `能力模块 ${padOrdinal(ordinal)}`;
  return duplicateIndex <= 1 ? bounded : `${bounded} ${padOrdinal(duplicateIndex)}`;
}

function moduleStructuralSummary(nodes: DocNode[]): string {
  const childTopics = nodes.filter(node => node.level === 3 && !isResourceNode(node)).length;
  const contentCount = nodes.filter(node => !isResourceNode(node)).length;
  const resourceCount = nodes.filter(isResourceNode).length;
  const parts = [
    childTopics > 0 ? `${childTopics} 个子主题` : undefined,
    `${contentCount} 个内容节点`,
    resourceCount > 0 ? `${resourceCount} 个资源` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.join('，');
}

function isCompletePlaybookMapping(document: ArchitectureDocument): boolean {
  if (document.id !== 'playbook-v2') return false;
  const headings = document.nodes.filter(node => node.level === 2 && !isReferenceNode(node));
  return headings.length === PLAYBOOK_DOMAIN_BY_SOURCE_TITLE.size
    && headings.every(node => PLAYBOOK_DOMAIN_BY_SOURCE_TITLE.has(node.title));
}

/**
 * cyrb128-style synchronous hash. It is deliberately non-cryptographic: the
 * fingerprint invalidates stale canvas state; it is not a security digest.
 */
function clientSafeFingerprint(source: string): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1, h2, h3, h4]
    .map(value => (value >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

function graphFingerprint(document: ArchitectureDocument): string {
  const canonical = {
    schema: 3,
    presentationSchema: PRESENTATION_SCHEMA,
    domainMappingVersion: PLAYBOOK_DOMAIN_MAPPING_VERSION,
    layoutMode: 'architecture-house',
    id: document.id,
    title: document.title,
    version: document.version,
    nodes: document.nodes.map(node => ({
      id: node.id,
      type: node.type,
      title: node.title,
      summary: node.summary,
      level: node.level,
      track: node.track ?? null,
      stageNumber: node.stageNumber ?? null,
      toolReferences: node.toolReferences ?? [],
      promptCount: node.promptTemplates?.length ?? 0,
      children: node.children,
      isStageHeading: node.metadata.isStageHeading === true,
      isToolReference: node.metadata.isToolReference === true,
      referencedBy: typeof node.metadata.referencedBy === 'string' ? node.metadata.referencedBy : null,
      sectionHash: typeof node.metadata.sectionHash === 'string' ? node.metadata.sectionHash : null,
    })),
    edges: document.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
    })),
  };
  return `graph-v3-${clientSafeFingerprint(JSON.stringify(canonical))}`;
}

function chooseMode(nodes: DocNode[]): ArchitectureMode {
  const stageHeadings = nodes.filter(isStageHeading);
  const eligible = nodes.filter(node => node.type !== 'document' && !isReferenceNode(node));
  const covered = eligible.filter(node =>
    Number.isInteger(node.stageNumber) && (node.stageNumber ?? -1) >= 0 && (node.stageNumber ?? 9) <= 8,
  );
  const coverage = eligible.length === 0 ? 0 : covered.length / eligible.length;
  return stageHeadings.length >= 3 && coverage >= 0.45 ? 'lifecycle' : 'module';
}

function isFoundationGroup(nodes: DocNode[]): boolean {
  const heading = nodes.find(node => node.level === 2) ?? nodes[0];
  if (!heading) return false;
  return heading.type === 'principle' || heading.track === 'both' || FOUNDATION_PATTERN.test(heading.title);
}

function topLevelGroups(nodes: DocNode[]): DocNode[][] {
  const groups: DocNode[][] = [];
  let current: DocNode[] | undefined;
  for (const node of nodes) {
    if (node.type === 'document' || isReferenceNode(node)) continue;
    if (node.level === 2) {
      current = [node];
      groups.push(current);
    } else if (current) {
      current.push(node);
    } else {
      groups.push([node]);
    }
  }
  return groups;
}

function pushUnique(target: string[], id: string): void {
  if (!target.includes(id)) target.push(id);
}

function finalizeRegion(
  draft: RegionDraft,
  nodeById: Map<string, DocNode>,
  fallbackTrack: ArchitectureTrack = 'shared',
): ArchitectureRegion {
  const nodes = draft.nodeIds.map(id => nodeById.get(id)).filter((node): node is DocNode => Boolean(node));
  const sourceTitles = draft.headingNodeIds
    .map(id => nodeById.get(id)?.title)
    .filter((title): title is string => Boolean(title));
  const sourceTitle = sourceTitles[0] ?? draft.title;
  const sourceLabels = sourceTitles
    .map(title => cleanPresentationText(title))
    .filter((title, index, titles) => Boolean(title) && titles.indexOf(title) === index);
  const headingIds = new Set(draft.headingNodeIds);
  // Room headings carry the Markdown body that introduces the room. Keep that
  // content available in focus mode; only the document roof is presentation-only.
  const contentNodes = nodes.filter(node =>
    !isResourceNode(node) && (draft.kind !== 'roof' || !headingIds.has(node.id)),
  );
  const trackSummaries = TRACK_ORDER.map(track => {
    const trackNodes = contentNodes.filter(node => architectureTrack(node, fallbackTrack) === track);
    return {
      track,
      nodeIds: trackNodes.map(node => node.id),
      count: trackNodes.length,
      previewNodeIds: trackNodes.slice(0, 3).map(node => node.id),
    } satisfies ArchitectureTrackSummary;
  });

  const toolNodeIds = nodes
    .filter(node => node.type === 'tool' && !isReferenceNode(node))
    .map(node => node.id);
  const promptNodeIds = nodes
    .filter(node => node.type === 'prompt' || (node.promptTemplates?.length ?? 0) > 0)
    .map(node => node.id);
  const referenceNodeIds = nodes.filter(isReferenceNode).map(node => node.id);
  const uniqueResourceIds = new Set([...toolNodeIds, ...promptNodeIds, ...referenceNodeIds]);
  const previews: ArchitectureResourcePreview[] = [];
  for (const node of nodes) {
    let kind: ArchitectureResourcePreview['kind'] | undefined;
    if (isReferenceNode(node)) kind = 'reference';
    else if (node.type === 'tool') kind = 'tool';
    else if (node.type === 'prompt' || (node.promptTemplates?.length ?? 0) > 0) kind = 'prompt';
    if (!kind || previews.some(preview => preview.id === node.id)) continue;
    previews.push({
      id: node.id,
      title: createPresentationText({
        sourceTitle: node.title,
        fallbackTitle: kind === 'tool' ? '工具资源' : kind === 'prompt' ? '执行模板' : '参考资源',
      }).displayTitle,
      sourceTitle: node.title,
      kind,
      track: architectureTrack(node, fallbackTrack),
    });
    if (previews.length === 3) break;
  }

  const nestedStageNumbers = uniqueSortedNumbers(
    nodes
      .filter(isStageHeading)
      .map(node => node.stageNumber)
      .filter((stage): stage is number => stage !== undefined),
  );
  return {
    ...draft,
    title: createPresentationText({ productTitle: draft.title, fallbackTitle: sourceTitle }).displayTitle,
    summary: createPresentationText({ productSummary: draft.summary }).displaySummary,
    sourceTitle,
    sourceTitles,
    sourceLabels,
    previewNodeIds: contentNodes.slice(0, 3).map(node => node.id),
    trackSummaries,
    resources: {
      count: uniqueResourceIds.size,
      toolNodeIds,
      promptNodeIds,
      referenceNodeIds,
      previews,
    },
    nestedStageNumbers,
  };
}

function attachReferenceNodes(
  document: ArchitectureDocument,
  drafts: RegionDraft[],
  nodeRegionId: Record<string, string>,
  fallbackRegionId: string,
): void {
  const draftById = new Map(drafts.map(draft => [draft.id, draft]));
  for (const node of document.nodes) {
    if (!isReferenceNode(node)) continue;
    const hostId = typeof node.metadata.referencedBy === 'string' ? node.metadata.referencedBy : undefined;
    const regionId = (hostId ? nodeRegionId[hostId] : undefined) ?? fallbackRegionId;
    const draft = draftById.get(regionId) ?? draftById.get(fallbackRegionId);
    if (!draft) throw new Error(`Architecture reference has no region: ${node.id}`);
    pushUnique(draft.nodeIds, node.id);
    nodeRegionId[node.id] = draft.id;
  }
}

function lifecycleProjection(document: ArchitectureDocument): {
  regions: ArchitectureRegion[];
  floors: ArchitectureFloor[];
  nodeRegionId: Record<string, string>;
} {
  const nodeById = new Map(document.nodes.map(node => [node.id, node]));
  const explicitlyTracked = document.nodes.filter(node =>
    Number.isInteger(node.stageNumber) && (node.track === 'vibe' || node.track === 'pro'),
  );
  const lifecycleFallbackTrack: ArchitectureTrack = explicitlyTracked.length > 0
    ? 'shared'
    : /(?:^|[-_\s])pro(?:$|[-_\s])/i.test(`${document.id} ${document.title}`)
      ? 'pro'
      : /(?:^|[-_\s])vibe(?:$|[-_\s])/i.test(`${document.id} ${document.title}`)
        ? 'vibe'
        : 'shared';
  const root = document.nodes.find(node => node.type === 'document');
  const nodeRegionId: Record<string, string> = {};
  const drafts: RegionDraft[] = [];
  const roof: RegionDraft = {
    id: 'region:roof',
    kind: 'roof',
    title: createPresentationText({ sourceTitle: document.title, fallbackTitle: '文档总览' }).displayTitle,
    summary: createPresentationText({ sourceSummary: document.version, fallbackSummary: '文档目标与版本' }).displaySummary,
    order: 0,
    headingNodeIds: root ? [root.id] : [],
    nodeIds: root ? [root.id] : [],
  };
  drafts.push(roof);
  if (root) nodeRegionId[root.id] = roof.id;

  const stageHeadings = document.nodes.filter(isStageHeading);
  const stageNumbers = uniqueSortedNumbers(
    stageHeadings
      .map(node => node.stageNumber)
      .filter((stage): stage is number => stage !== undefined && stage >= 0 && stage <= 8),
  );
  const stageDrafts = new Map<number, RegionDraft>();
  for (const stageNumber of stageNumbers) {
    const headings = stageHeadings.filter(node => node.stageNumber === stageNumber);
    const heading = headings[0];
    const copy = LIFECYCLE_COPY[stageNumber] ?? {
      title: `阶段 ${stageNumber}`,
      summary: '阶段目标与交付内容',
    };
    const draft: RegionDraft = {
      id: `region:stage:${stageNumber}`,
      kind: stageNumber === 0 ? 'foyer' : 'room',
      title: copy.title,
      summary: copy.summary,
      order: stageNumber + 1,
      stageNumber,
      headingNodeIds: headings.map(node => node.id),
      nodeIds: [],
    };
    stageDrafts.set(stageNumber, draft);
    drafts.push(draft);
  }

  const foundation: RegionDraft = {
    id: 'region:foundation',
    kind: 'foundation',
    title: '共享基础与治理',
    summary: '跨阶段原则、安全、治理与公共能力',
    order: 100,
    headingNodeIds: [],
    nodeIds: [],
  };
  const annex: RegionDraft = {
    id: 'region:annex',
    kind: 'annex',
    title: '附属模块',
    summary: '不属于生命周期主房间的补充内容',
    order: 101,
    headingNodeIds: [],
    nodeIds: [],
  };

  for (const node of document.nodes) {
    if (node === root || isReferenceNode(node)) continue;
    const stage = node.stageNumber;
    const stageDraft = stage === undefined ? undefined : stageDrafts.get(stage);
    if (!stageDraft) continue;
    pushUnique(stageDraft.nodeIds, node.id);
    nodeRegionId[node.id] = stageDraft.id;
  }

  for (const group of topLevelGroups(document.nodes)) {
    const unassigned = group.filter(node => !nodeRegionId[node.id] && !isReferenceNode(node));
    if (unassigned.length === 0) continue;
    const target = isFoundationGroup(group) ? foundation : annex;
    if (target.headingNodeIds.length === 0 && group[0]) target.headingNodeIds.push(group[0].id);
    for (const node of unassigned) {
      pushUnique(target.nodeIds, node.id);
      nodeRegionId[node.id] = target.id;
    }
  }

  for (const node of document.nodes) {
    if (nodeRegionId[node.id] || isReferenceNode(node)) continue;
    pushUnique(annex.nodeIds, node.id);
    nodeRegionId[node.id] = annex.id;
  }

  drafts.push(foundation);
  if (annex.nodeIds.length > 0) drafts.push(annex);
  attachReferenceNodes(document, drafts, nodeRegionId, foundation.id);

  const floors: ArchitectureFloor[] = [];
  for (let floorNumber = 1; floorNumber <= 4; floorNumber++) {
    const firstStage = floorNumber * 2 - 1;
    const regionIds = [firstStage, firstStage + 1]
      .map(stage => stageDrafts.get(stage)?.id)
      .filter((id): id is string => Boolean(id));
    if (regionIds.length === 0) continue;
    floors.push({
      id: `floor:lifecycle:${floorNumber}`,
      label: `第 ${floorNumber} 层 · Stage ${firstStage}–${firstStage + 1}`,
      order: floorNumber,
      regionIds,
    });
  }

  return {
    regions: drafts.map(draft => finalizeRegion(
      draft,
      nodeById,
      draft.stageNumber === undefined ? 'shared' : lifecycleFallbackTrack,
    )),
    floors,
    nodeRegionId,
  };
}

function playbookCapabilityProjection(document: ArchitectureDocument): {
  regions: ArchitectureRegion[];
  floors: ArchitectureFloor[];
  nodeRegionId: Record<string, string>;
} {
  const nodeById = new Map(document.nodes.map(node => [node.id, node]));
  const root = document.nodes.find(node => node.type === 'document');
  const nodeRegionId: Record<string, string> = {};
  const roof: RegionDraft = {
    id: 'region:roof',
    kind: 'roof',
    title: createPresentationText({ sourceTitle: document.title, fallbackTitle: '文档总览' }).displayTitle,
    summary: createPresentationText({ sourceSummary: document.version, fallbackSummary: '文档目标与版本' }).displaySummary,
    order: 0,
    headingNodeIds: root ? [root.id] : [],
    nodeIds: root ? [root.id] : [],
  };
  if (root) nodeRegionId[root.id] = roof.id;

  const moduleDrafts = PLAYBOOK_DOMAINS.map<RegionDraft>((domain, index) => ({
    id: `region:module:${domain.id}`,
    kind: 'room',
    title: domain.title,
    summary: domain.summary,
    order: index + 1,
    headingNodeIds: [],
    nodeIds: [],
  }));
  const draftByDomainId = new Map(
    PLAYBOOK_DOMAINS.map((domain, index) => [domain.id, moduleDrafts[index]] as const),
  );

  for (const group of topLevelGroups(document.nodes)) {
    const heading = group.find(node => node.level === 2) ?? group[0];
    if (!heading) continue;
    const domainId = PLAYBOOK_DOMAIN_BY_SOURCE_TITLE.get(heading.title);
    const target = domainId ? draftByDomainId.get(domainId) : undefined;
    if (!target) {
      throw new Error(`Unmapped Playbook H2 heading: ${heading.title}`);
    }
    pushUnique(target.headingNodeIds, heading.id);
    for (const node of group) {
      if (isReferenceNode(node)) continue;
      pushUnique(target.nodeIds, node.id);
      nodeRegionId[node.id] = target.id;
    }
  }

  for (const node of document.nodes) {
    if (nodeRegionId[node.id] || isReferenceNode(node)) continue;
    if (node.type === 'document') {
      pushUnique(roof.nodeIds, node.id);
      nodeRegionId[node.id] = roof.id;
      continue;
    }
    throw new Error(`Unmapped Playbook node: ${node.id}`);
  }

  const drafts = [roof, ...moduleDrafts];
  attachReferenceNodes(document, drafts, nodeRegionId, roof.id);
  const floors: ArchitectureFloor[] = [0, 4].map((offset, index) => ({
    id: `floor:module:${padOrdinal(index + 1)}`,
    label: `第 ${index + 1} 层 · 能力域 ${offset + 1}–${offset + 4}`,
    order: index + 1,
    regionIds: moduleDrafts.slice(offset, offset + 4).map(region => region.id),
  }));

  return {
    regions: drafts.map(draft => finalizeRegion(draft, nodeById)),
    floors,
    nodeRegionId,
  };
}

function moduleProjection(document: ArchitectureDocument): {
  regions: ArchitectureRegion[];
  floors: ArchitectureFloor[];
  nodeRegionId: Record<string, string>;
} {
  const nodeById = new Map(document.nodes.map(node => [node.id, node]));
  const root = document.nodes.find(node => node.type === 'document');
  const nodeRegionId: Record<string, string> = {};
  const drafts: RegionDraft[] = [];
  const roof: RegionDraft = {
    id: 'region:roof',
    kind: 'roof',
    title: createPresentationText({ sourceTitle: document.title, fallbackTitle: '文档总览' }).displayTitle,
    summary: createPresentationText({ sourceSummary: document.version, fallbackSummary: '文档目标与版本' }).displaySummary,
    order: 0,
    headingNodeIds: root ? [root.id] : [],
    nodeIds: root ? [root.id] : [],
  };
  drafts.push(roof);
  if (root) nodeRegionId[root.id] = roof.id;

  const moduleDrafts: RegionDraft[] = [];
  let current: RegionDraft | undefined;
  const orphan: RegionDraft = {
    id: 'region:annex',
    kind: 'annex',
    title: '附属模块',
    summary: '未归入二级模块的补充内容',
    order: 999,
    headingNodeIds: [],
    nodeIds: [],
  };
  const titleOccurrences = new Map<string, number>();

  for (const node of document.nodes) {
    if (isReferenceNode(node)) continue;
    if (node.type === 'document') {
      if (node !== root) {
        pushUnique(roof.nodeIds, node.id);
        nodeRegionId[node.id] = roof.id;
      }
      current = undefined;
      continue;
    }
    if (node.level === 2) {
      const ordinal = moduleDrafts.length + 1;
      const baseTitle = productizeModuleTitle(node.title, ordinal, 1);
      const duplicateIndex = (titleOccurrences.get(baseTitle) ?? 0) + 1;
      titleOccurrences.set(baseTitle, duplicateIndex);
      current = {
        id: `region:module:${padOrdinal(ordinal)}`,
        kind: 'room',
        title: productizeModuleTitle(node.title, ordinal, duplicateIndex),
        summary: '',
        order: ordinal,
        headingNodeIds: [node.id],
        nodeIds: [node.id],
      };
      moduleDrafts.push(current);
      nodeRegionId[node.id] = current.id;
      continue;
    }
    const target = current ?? orphan;
    if (target.headingNodeIds.length === 0) target.headingNodeIds.push(node.id);
    pushUnique(target.nodeIds, node.id);
    nodeRegionId[node.id] = target.id;
  }

  for (const draft of moduleDrafts) {
    draft.summary = moduleStructuralSummary(
      draft.nodeIds.map(id => nodeById.get(id)).filter((node): node is DocNode => Boolean(node)),
    );
  }

  drafts.push(...moduleDrafts);
  if (orphan.nodeIds.length > 0) drafts.push(orphan);
  attachReferenceNodes(document, drafts, nodeRegionId, orphan.nodeIds.length > 0 ? orphan.id : roof.id);

  const floors: ArchitectureFloor[] = [];
  for (let index = 0; index < moduleDrafts.length; index += 4) {
    const chunk = moduleDrafts.slice(index, index + 4);
    const floorNumber = floors.length + 1;
    floors.push({
      id: `floor:module:${padOrdinal(floorNumber)}`,
      label: `第 ${floorNumber} 层 · 模块 ${index + 1}–${index + chunk.length}`,
      order: floorNumber,
      regionIds: chunk.map(region => region.id),
    });
  }

  return {
    regions: drafts.map(draft => finalizeRegion(draft, nodeById)),
    floors,
    nodeRegionId,
  };
}

function buildNodePresentationCopy(
  document: ArchitectureDocument,
  projection: { regions: ArchitectureRegion[]; nodeRegionId: Record<string, string> },
): Record<string, { title: string; summary: string }> {
  const regionById = new Map(projection.regions.map(region => [region.id, region]));
  const copy: Record<string, { title: string; summary: string }> = {};
  for (const node of document.nodes) {
    const playbookCopy = PLAYBOOK_HEADING_COPY[node.title];
    if (playbookCopy && document.id === 'playbook-v2') {
      copy[node.id] = { ...playbookCopy };
      continue;
    }
    if (isStageHeading(node) && node.stageNumber !== undefined) {
      const stageCopy = LIFECYCLE_COPY[node.stageNumber];
      if (stageCopy) copy[node.id] = { ...stageCopy };
      continue;
    }
    if (node.type === 'track') {
      const title = node.track === 'vibe'
        ? '快速产品路径'
        : node.track === 'pro'
          ? '工程化路径'
          : '共享能力';
      copy[node.id] = { title, summary: '组织该路径的目标、步骤与交付内容' };
      continue;
    }
    const region = regionById.get(projection.nodeRegionId[node.id]);
    if (
      node.level === 2
      && region?.kind === 'room'
      && region.headingNodeIds.length === 1
      && region.headingNodeIds[0] === node.id
    ) {
      copy[node.id] = { title: region.title, summary: region.summary };
    }
  }
  return copy;
}

export function buildArchitectureViewModel(document: ArchitectureDocument): ArchitectureViewModel {
  const mode = chooseMode(document.nodes);
  const projection = mode === 'lifecycle'
    ? lifecycleProjection(document)
    : isCompletePlaybookMapping(document)
      ? playbookCapabilityProjection(document)
      : moduleProjection(document);
  const root = document.nodes.find(node => node.type === 'document');
  return {
    documentId: document.id,
    title: createPresentationText({ sourceTitle: document.title, fallbackTitle: '文档总览' }).displayTitle,
    version: document.version,
    mode,
    graphFingerprint: graphFingerprint(document),
    rootNodeId: root?.id,
    stageHeadingIds: document.nodes.filter(isStageHeading).map(node => node.id),
    floors: projection.floors,
    regions: projection.regions,
    nodeRegionId: projection.nodeRegionId,
    nodePresentationCopy: buildNodePresentationCopy(document, projection),
  };
}

/** Exposed for tests and state adapters; not a security primitive. */
export function computeGraphFingerprint(document: ArchitectureDocument): string {
  return graphFingerprint(document);
}

/** Keep the imported edge type anchored in this client-safe public module. */
export type ArchitectureSourceEdge = DocEdge;
