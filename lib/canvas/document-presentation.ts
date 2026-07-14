import {
  mapMarkdownPresentationText,
  parseMarkdownPresentation,
  type MarkdownBlockNode,
} from '../markdown/presentation';
import type { DocCanvas, DocNode } from '../parser/types';
import {
  createDocumentSearchIndex,
  type SearchPresentationEntry,
  type SearchPresentationResult,
} from './search-index';
import {
  cleanPresentationText,
  cleanPresentationCode,
  createPresentationText,
} from './presentation-text';

export type PresentationPreviewKind =
  | 'prose'
  | 'list'
  | 'table'
  | 'code'
  | 'prompt'
  | 'resource';

export interface PresentationBadge {
  kind: 'stage' | 'track' | 'type';
  label: string;
}

export interface NodePresentation {
  nodeId: string;
  displayTitle: string;
  displaySummary: string;
  sourceLabel: string;
  badges: readonly PresentationBadge[];
  previewKind: PresentationPreviewKind;
  accessibleLabel: string;
}

export interface RegionPresentation {
  regionId: string;
  displayTitle: string;
  displaySummary: string;
  sourceLabels: readonly string[];
  accessibleLabel: string;
}

export interface PresentationRegionSource {
  id: string;
  title: string;
  summary: string;
  sourceTitle?: string;
  headingNodeIds?: readonly string[];
  nodeIds?: readonly string[];
}

export interface PresentationCopy {
  title?: string;
  summary?: string;
}

export interface DocumentPresentationOptions {
  regions?: readonly PresentationRegionSource[];
  nodeRegionId?: Readonly<Record<string, string>>;
  nodeCopyById?: ReadonlyMap<string, PresentationCopy>;
}

export interface DocumentPresentation {
  schema: 'editorial-architecture-v1';
  presentationByNodeId: ReadonlyMap<string, NodePresentation>;
  regionPresentationById: ReadonlyMap<string, RegionPresentation>;
  searchEntries: readonly SearchPresentationEntry[];
  search(query: string, limit?: number): readonly SearchPresentationResult[];
  getDisplayMarkdown(nodeId: string): readonly MarkdownBlockNode[];
}

const EMPTY_MARKDOWN: readonly MarkdownBlockNode[] = Object.freeze([]);

const STAGE_PRODUCT_TITLES: Readonly<Record<number, string>> = Object.freeze({
  0: '使用入口',
  1: '机会与需求',
  2: '产品定义',
  3: '技术蓝图',
  4: '构建与交付',
  5: '质量保障',
  6: '发布与运行',
  7: '增长运营',
  8: '学习与进化',
});

function padOrdinal(value: number): string {
  return String(value).padStart(2, '0');
}

function previewKind(node: DocNode): PresentationPreviewKind {
  if (node.metadata.isToolReference === true || node.type === 'tool') return 'resource';
  if (node.type === 'prompt' || (node.promptTemplates?.length ?? 0) > 0) return 'prompt';
  if (node.contentBlocks.some(block => block.type === 'list')) return 'list';
  if (node.contentBlocks.some(block => block.type === 'table')) return 'table';
  if (node.contentBlocks.some(block => block.type === 'code')) return 'code';
  return 'prose';
}

function structuralSummary(kind: PresentationPreviewKind): string {
  switch (kind) {
    case 'list':
      return '行动清单';
    case 'table':
      return '结构化对比信息';
    case 'code':
      return '代码与配置示例';
    case 'prompt':
      return '可复制执行模板';
    case 'resource':
      return '聚合资源';
    case 'prose':
      return '内容说明';
  }
}

function boundedText(value: string, maxCharacters = 160): string {
  const characters = Array.from(value);
  if (characters.length <= maxCharacters) return value;
  return `${characters.slice(0, maxCharacters).join('').trimEnd()}…`;
}

function editorialFallbackTitle(sourceTitle: string, order: number): string {
  const cleaned = cleanPresentationText(sourceTitle);
  if (/^模块化规范文件\s*:/u.test(cleaned)) {
    if (/how-security\.md/iu.test(cleaned) && /how-testing\.md/iu.test(cleaned)) return '安全与质量规范';
    if (/what-vision\.md/iu.test(cleaned)) return '产品愿景规范';
    if (/agent-spec-/iu.test(cleaned)) return 'Agent 行为规范';
    if (/how-architecture\.md/iu.test(cleaned)) return '架构设计规范';
    if (/how-testing\.md/iu.test(cleaned)) return '质量验证规范';
    if (/how-security\.md/iu.test(cleaned)) return '安全规范';
    return '模块规范';
  }
  const version = cleaned.match(/^v(\d+(?:\.\d+)*)\b/iu);
  if (version) return `版本 ${version[1]}`;

  const transition = cleaned.match(/^衔接\s*(?:至|到)?\s*阶段\s*([0-8])$/u);
  if (transition) return `进入${STAGE_PRODUCT_TITLES[Number(transition[1])]}`;

  const core = cleaned
    .replace(/^(?:\d+(?:\.\d+)+|[A-Z]\.\d+)\s*(?:[、.．:：-]\s*)?/iu, '')
    .replace(/^第[一二三四五六七八九十百零〇]+(?:至[一二三四五六七八九十百零〇]+)?部分\s*[:：-]?\s*/u, '')
    .replace(/^附录\s*[:：-]?\s*/u, '')
    .replace(/^(?:新增|进行中|警告|通过)\s+/u, '')
    .replace(/\s*[（(](?:来自)?\d{4}年研究证据[）)]$/u, '')
    .replace(/\s*[（(](?:\d+(?:-\d+)?(?:天|周|月)|贯穿始终|方向性|不可用)[）)]$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();

  return boundedText(core || `内容节点 ${padOrdinal(order + 1)}`, 56);
}

function editorialFallbackSummary(
  displayTitle: string,
  kind: PresentationPreviewKind,
): string {
  if (kind === 'prose') return boundedText(`说明${displayTitle}的目标与关键要求`);
  return structuralSummary(kind);
}

function presentationBadges(node: DocNode): readonly PresentationBadge[] {
  const badges: PresentationBadge[] = [];
  if (Number.isInteger(node.stageNumber) && (node.stageNumber ?? -1) >= 0) {
    badges.push({ kind: 'stage', label: `阶段 ${node.stageNumber}` });
  }
  if (node.track) {
    badges.push({
      kind: 'track',
      label: node.track === 'both' ? 'Shared' : node.track === 'vibe' ? 'Vibe' : 'Pro',
    });
  }
  if (node.type === 'tool' || node.type === 'prompt' || node.type === 'principle') {
    badges.push({
      kind: 'type',
      label: node.type === 'tool' ? '工具' : node.type === 'prompt' ? 'Prompt' : '原则',
    });
  }
  return Object.freeze(badges.map(badge => Object.freeze(badge)));
}

function trimSentenceEnd(value: string): string {
  return value.replace(/[。.!！?？]+$/u, '');
}

function accessibleLabel(
  displayTitle: string,
  displaySummary: string,
  sourceLabels: readonly string[],
): string {
  return cleanPresentationText([
    trimSentenceEnd(displayTitle),
    trimSentenceEnd(displaySummary),
    sourceLabels.length > 0 ? `来源：${sourceLabels.join('、')}` : '',
  ].filter(Boolean).join('。'));
}

function buildNodePresentation(
  node: DocNode,
  order: number,
  copy: PresentationCopy | undefined,
): NodePresentation {
  const kind = previewKind(node);
  const sourceLabel = cleanPresentationText(node.title) || `来源章节 ${padOrdinal(order + 1)}`;
  const productTitle = copy?.title ?? editorialFallbackTitle(node.title, order);
  const text = createPresentationText({
    productTitle,
    productSummary: copy?.summary ?? editorialFallbackSummary(productTitle, kind),
    fallbackTitle: `内容节点 ${padOrdinal(order + 1)}`,
    fallbackSummary: structuralSummary(kind),
  });

  return Object.freeze({
    nodeId: node.id,
    displayTitle: text.displayTitle,
    displaySummary: text.displaySummary,
    sourceLabel,
    badges: presentationBadges(node),
    previewKind: kind,
    accessibleLabel: accessibleLabel(text.displayTitle, text.displaySummary, [sourceLabel]),
  });
}

function uniqueSourceLabels(
  region: PresentationRegionSource,
  nodePresentationById: ReadonlyMap<string, NodePresentation>,
): readonly string[] {
  const sourceIds = (region.headingNodeIds?.length ?? 0) > 0
    ? region.headingNodeIds ?? []
    : region.nodeIds ?? [];
  const labels: string[] = [];
  for (const nodeId of sourceIds) {
    const label = nodePresentationById.get(nodeId)?.sourceLabel;
    if (label && !labels.includes(label)) labels.push(label);
  }
  if (labels.length === 0) {
    const label = cleanPresentationText(region.sourceTitle);
    if (label) labels.push(label);
  }
  return Object.freeze(labels);
}

function buildRegionPresentation(
  region: PresentationRegionSource,
  order: number,
  nodePresentationById: ReadonlyMap<string, NodePresentation>,
): RegionPresentation {
  const text = createPresentationText({
    productTitle: region.title,
    productSummary: region.summary,
    sourceTitle: region.sourceTitle,
    fallbackTitle: `建筑区域 ${padOrdinal(order + 1)}`,
    fallbackSummary: `${region.nodeIds?.length ?? 0} 个内容节点`,
  });
  const sourceLabels = uniqueSourceLabels(region, nodePresentationById);
  return Object.freeze({
    regionId: region.id,
    displayTitle: text.displayTitle,
    displaySummary: text.displaySummary,
    sourceLabels,
    accessibleLabel: accessibleLabel(text.displayTitle, text.displaySummary, sourceLabels),
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function displayMarkdown(node: DocNode): readonly MarkdownBlockNode[] {
  const blocks = parseMarkdownPresentation(node.content);
  return deepFreeze(mapMarkdownPresentationText(blocks, (value, context) => (
    context === 'code' ? cleanPresentationCode(value) : cleanPresentationText(value)
  )));
}

function effectiveNodeCopyById(
  options: Readonly<DocumentPresentationOptions>,
): ReadonlyMap<string, PresentationCopy> {
  const copies = new Map<string, PresentationCopy>();
  for (const region of options.regions ?? []) {
    if (region.headingNodeIds?.length !== 1) continue;
    copies.set(region.headingNodeIds[0], {
      title: region.title,
      summary: region.summary,
    });
  }
  for (const [nodeId, copy] of options.nodeCopyById ?? []) {
    copies.set(nodeId, { ...copies.get(nodeId), ...copy });
  }
  return copies;
}

export function buildDocumentPresentation(
  graph: Pick<DocCanvas, 'nodes'>,
  options: Readonly<DocumentPresentationOptions> = {},
): DocumentPresentation {
  const nodeCopyById = effectiveNodeCopyById(options);
  const presentationByNodeId = new Map<string, NodePresentation>();
  for (const [order, node] of graph.nodes.entries()) {
    presentationByNodeId.set(
      node.id,
      buildNodePresentation(node, order, nodeCopyById.get(node.id)),
    );
  }

  const regionPresentationById = new Map<string, RegionPresentation>();
  for (const [order, region] of (options.regions ?? []).entries()) {
    if (regionPresentationById.has(region.id)) continue;
    regionPresentationById.set(
      region.id,
      buildRegionPresentation(region, order, presentationByNodeId),
    );
  }

  const searchIndex = createDocumentSearchIndex(
    graph.nodes,
    presentationByNodeId,
    options.nodeRegionId,
  );
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
  const markdownCache = new Map<string, readonly MarkdownBlockNode[]>();
  const getDisplayMarkdown = (nodeId: string): readonly MarkdownBlockNode[] => {
    const cached = markdownCache.get(nodeId);
    if (cached) return cached;
    const node = nodeById.get(nodeId);
    if (!node) return EMPTY_MARKDOWN;
    const blocks = displayMarkdown(node);
    markdownCache.set(nodeId, blocks);
    return blocks;
  };

  return Object.freeze({
    schema: 'editorial-architecture-v1' as const,
    presentationByNodeId,
    regionPresentationById,
    searchEntries: searchIndex.entries,
    search: searchIndex.search,
    getDisplayMarkdown,
  });
}
