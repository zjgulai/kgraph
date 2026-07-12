/**
 * A client-safe, serializable projection of a parsed Markdown graph into the
 * architectural concepts rendered by DocCanvas. This module intentionally has
 * no React, filesystem, or Node-only dependencies so the same projection can
 * run during SSR and in CanvasViewer.
 */
import type { DocCanvas, DocEdge, DocNode } from '../parser/types';

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
    schema: 2,
    id: document.id,
    title: document.title,
    version: document.version,
    nodes: document.nodes.map(node => ({
      id: node.id,
      type: node.type,
      title: node.title,
      level: node.level,
      track: node.track ?? null,
      stageNumber: node.stageNumber ?? null,
      toolReferences: node.toolReferences ?? [],
      promptCount: node.promptTemplates?.length ?? 0,
      children: node.children,
      isStageHeading: node.metadata.isStageHeading === true,
      isToolReference: node.metadata.isToolReference === true,
      referencedBy: typeof node.metadata.referencedBy === 'string' ? node.metadata.referencedBy : null,
    })),
    edges: document.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
    })),
  };
  return `graph-v2-${clientSafeFingerprint(JSON.stringify(canonical))}`;
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
    previews.push({ id: node.id, title: node.title, kind, track: architectureTrack(node, fallbackTrack) });
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
    title: document.title,
    summary: document.version,
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
    const draft: RegionDraft = {
      id: `region:stage:${stageNumber}`,
      kind: stageNumber === 0 ? 'foyer' : 'room',
      title: heading?.title ?? `阶段 ${stageNumber}`,
      summary: heading?.summary ?? '',
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
    title: document.title,
    summary: document.version,
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
      current = {
        id: `region:module:${padOrdinal(ordinal)}`,
        kind: 'room',
        title: node.title,
        summary: node.summary,
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

export function buildArchitectureViewModel(document: ArchitectureDocument): ArchitectureViewModel {
  const mode = chooseMode(document.nodes);
  const projection = mode === 'lifecycle'
    ? lifecycleProjection(document)
    : moduleProjection(document);
  const root = document.nodes.find(node => node.type === 'document');
  return {
    documentId: document.id,
    title: document.title,
    version: document.version,
    mode,
    graphFingerprint: graphFingerprint(document),
    rootNodeId: root?.id,
    stageHeadingIds: document.nodes.filter(isStageHeading).map(node => node.id),
    floors: projection.floors,
    regions: projection.regions,
    nodeRegionId: projection.nodeRegionId,
  };
}

/** Exposed for tests and state adapters; not a security primitive. */
export function computeGraphFingerprint(document: ArchitectureDocument): string {
  return graphFingerprint(document);
}

/** Keep the imported edge type anchored in this client-safe public module. */
export type ArchitectureSourceEdge = DocEdge;
