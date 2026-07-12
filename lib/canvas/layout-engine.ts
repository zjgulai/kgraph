/**
 * Deterministic layouts for the architecture-house overview and focused room.
 * Overview deliberately lays out aggregate floors instead of every Markdown
 * node. Focused mode expands one room into three measured track lanes.
 */
import type {
  ArchitectureFloor,
  ArchitectureRegion,
  ArchitectureTrack,
  ArchitectureViewModel,
} from './architecture-view-model';
import type { DocEdge, DocNode } from '../parser/types';

export type ArchitectureLayoutNodeKind =
  | 'roof'
  | 'floor'
  | 'foyer'
  | 'foundation'
  | 'annex'
  | 'room'
  | 'group'
  | 'lane'
  | 'content'
  | 'resource';

export interface ArchitectureLayoutNode {
  id: string;
  kind: ArchitectureLayoutNodeKind;
  position: { x: number; y: number };
  width: number;
  height: number;
  regionId?: string;
  regionIds?: string[];
  parentId?: string;
  nodeId?: string;
  track?: ArchitectureTrack;
  draggable: boolean;
}

export interface ArchitectureLayoutEdge {
  id: string;
  source: string;
  target: string;
  kind: 'lifecycle' | 'module-sequence';
  animated: false;
}

export interface ArchitectureLayoutResult {
  view: 'overview' | 'focused-region';
  regionId?: string;
  nodes: ArchitectureLayoutNode[];
  edges: ArchitectureLayoutEdge[];
  bounds: { x: number; y: number; width: number; height: number };
}

export type ArchitectureLayoutView =
  | { kind: 'overview' }
  | { kind: 'focused-region'; regionId: string };

export interface ArchitectureLayoutOptions {
  view?: ArchitectureLayoutView;
  profile?: 'desktop' | 'tablet';
}

const OVERVIEW_WIDTH = 1840;
const TABLET_OVERVIEW_WIDTH = 1000;
const ROOF_HEIGHT = 128;
const FLOOR_HEIGHT = 190;
const FOUNDATION_HEIGHT = 112;
const AUXILIARY_HEIGHT = 170;
const SECTION_GAP = 24;
const FLOOR_GAP = 16;
const COLUMN_GAP = 24;

const FOCUS_PADDING = 64;
const FOCUS_HEADER_HEIGHT = 64;
const LANE_WIDTH = 400;
const LANE_GAP = 32;
const LANE_INSET = 24;
const LANE_HEADER_HEIGHT = 64;
const CONTENT_WIDTH = 352;
const CONTENT_HEIGHT = 140;
const CONTENT_GAP = 32;
const RESOURCE_HEIGHT = 112;

function overviewRegionNode(
  region: ArchitectureRegion,
  position: { x: number; y: number },
  width: number,
  height: number,
): ArchitectureLayoutNode {
  return {
    id: region.id,
    kind: region.kind,
    position,
    width,
    height,
    regionId: region.id,
    regionIds: [region.id],
    draggable: false,
  };
}

function overviewFloorNode(
  floor: ArchitectureFloor,
  position: { x: number; y: number },
  width: number,
): ArchitectureLayoutNode {
  return {
    id: floor.id,
    kind: 'floor',
    position,
    width,
    height: FLOOR_HEIGHT,
    regionIds: [...floor.regionIds],
    draggable: false,
  };
}

function macroEdges(
  model: ArchitectureViewModel,
  floorsInLifecycleOrder: ArchitectureFloor[],
  foyer: ArchitectureRegion | undefined,
): ArchitectureLayoutEdge[] {
  if (model.mode !== 'lifecycle') return [];
  const orderedIds = [foyer?.id, ...floorsInLifecycleOrder.map(floor => floor.id)]
    .filter((id): id is string => Boolean(id));
  return orderedIds.slice(1).map((target, index) => ({
    id: `edge:architecture:${orderedIds[index]}:${target}`,
    source: orderedIds[index],
    target,
    kind: 'lifecycle' as const,
    animated: false as const,
  }));
}

export function computeArchitectureOverviewLayout(
  model: ArchitectureViewModel,
  profile: 'desktop' | 'tablet' = 'desktop',
): ArchitectureLayoutResult {
  const nodes: ArchitectureLayoutNode[] = [];
  const overviewWidth = profile === 'tablet' ? TABLET_OVERVIEW_WIDTH : OVERVIEW_WIDTH;
  const roof = model.regions.find(region => region.kind === 'roof');
  const foyer = model.regions.find(region => region.kind === 'foyer');
  const foundation = model.regions.find(region => region.kind === 'foundation');
  const annex = model.regions.find(region => region.kind === 'annex');
  let y = 0;

  if (roof) {
    nodes.push(overviewRegionNode(roof, { x: 0, y }, overviewWidth, ROOF_HEIGHT));
    y += ROOF_HEIGHT + SECTION_GAP;
  }

  const floorsInLifecycleOrder = [...model.floors].sort((left, right) => left.order - right.order);
  const floorsInVisualOrder = model.mode === 'lifecycle'
    ? [...floorsInLifecycleOrder].reverse()
    : floorsInLifecycleOrder;
  floorsInVisualOrder.forEach((floor, index) => {
    nodes.push(overviewFloorNode(floor, { x: 0, y }, overviewWidth));
    y += FLOOR_HEIGHT;
    if (index < floorsInVisualOrder.length - 1) y += FLOOR_GAP;
  });

  const auxiliaryRegions = [foyer, annex].filter((region): region is ArchitectureRegion => Boolean(region));
  if (auxiliaryRegions.length > 0) {
    y += SECTION_GAP;
    const width = auxiliaryRegions.length === 1
      ? overviewWidth
      : (overviewWidth - COLUMN_GAP) / 2;
    auxiliaryRegions.forEach((region, index) => {
      nodes.push(overviewRegionNode(
        region,
        { x: index * (width + COLUMN_GAP), y },
        width,
        AUXILIARY_HEIGHT,
      ));
    });
    y += AUXILIARY_HEIGHT;
  }

  y += SECTION_GAP;
  if (foundation) {
    nodes.push(overviewRegionNode(foundation, { x: 0, y }, overviewWidth, FOUNDATION_HEIGHT));
  } else {
    nodes.push({
      id: 'architecture:structural-foundation',
      kind: 'foundation',
      position: { x: 0, y },
      width: overviewWidth,
      height: FOUNDATION_HEIGHT,
      regionIds: [],
      draggable: false,
    });
  }
  y += FOUNDATION_HEIGHT;

  // A short document must still read as a building rather than a horizontal
  // strip. Scale the actual vertical geometry (not just the reported bounds)
  // so roof, floors, auxiliary rooms, and foundation keep real occupancy.
  const minimumHeight = overviewWidth / 2.4;
  if (y < minimumHeight) {
    const scale = minimumHeight / y;
    for (const node of nodes) {
      node.position = { x: node.position.x, y: node.position.y * scale };
      node.height *= scale;
    }
    y = minimumHeight;
  }

  return {
    view: 'overview',
    nodes,
    edges: macroEdges(model, floorsInLifecycleOrder, foyer),
    bounds: { x: 0, y: 0, width: overviewWidth, height: y },
  };
}

function laneId(regionId: string, track: ArchitectureTrack): string {
  return `lane:${regionId}:${track}`;
}

export function computeArchitectureFocusedLayout(
  model: ArchitectureViewModel,
  regionId: string,
): ArchitectureLayoutResult {
  const region = model.regions.find(candidate => candidate.id === regionId);
  if (!region) throw new Error(`Unknown architecture region: ${regionId}`);

  const rootId = `focus:${region.id}`;
  // Shared remains structural even when empty. Empty optional tracks do not
  // reserve a full lane, and a collapsed Vibe/Pro summary therefore causes a
  // real re-layout instead of leaving an unreadable blank column behind.
  const trackSummaries = region.trackSummaries.filter(summary =>
    summary.track === 'shared' || summary.count > 0,
  );
  const laneConfigs = trackSummaries.map(summary => {
    const columns = summary.count >= 9 ? 3 : summary.count >= 5 ? 2 : 1;
    const rows = Math.max(1, Math.ceil(summary.nodeIds.length / columns));
    const width = Math.max(
      LANE_WIDTH,
      LANE_INSET * 2 + columns * CONTENT_WIDTH + Math.max(0, columns - 1) * CONTENT_GAP,
    );
    return { summary, columns, rows, width };
  });
  const maximumRows = Math.max(1, ...laneConfigs.map(config => config.rows));
  const laneHeight = Math.max(
    220,
    LANE_HEADER_HEIGHT + maximumRows * CONTENT_HEIGHT + Math.max(0, maximumRows - 1) * CONTENT_GAP + LANE_INSET,
  );
  const focusWidth = FOCUS_PADDING * 2
    + laneConfigs.reduce((sum, config) => sum + config.width, 0)
    + Math.max(0, laneConfigs.length - 1) * LANE_GAP;
  const resourceOffset = region.resources.count > 0 ? RESOURCE_HEIGHT + LANE_GAP : 0;
  const focusHeight = FOCUS_HEADER_HEIGHT + laneHeight + resourceOffset + FOCUS_PADDING;
  const nodes: ArchitectureLayoutNode[] = [{
    id: rootId,
    kind: 'group',
    position: { x: 0, y: 0 },
    width: focusWidth,
    height: focusHeight,
    regionId: region.id,
    regionIds: [region.id],
    draggable: false,
  }];

  let laneX = FOCUS_PADDING;
  laneConfigs.forEach(({ summary, columns, width }) => {
    const id = laneId(region.id, summary.track);
    nodes.push({
      id,
      kind: 'lane',
      position: {
        x: laneX,
        y: FOCUS_HEADER_HEIGHT,
      },
      width,
      height: laneHeight,
      regionId: region.id,
      regionIds: [region.id],
      parentId: rootId,
      track: summary.track,
      draggable: false,
    });

    summary.nodeIds.forEach((nodeId, contentIndex) => {
      const row = Math.floor(contentIndex / columns);
      const column = contentIndex % columns;
      nodes.push({
        id: nodeId,
        kind: 'content',
        position: {
          x: LANE_INSET + column * (CONTENT_WIDTH + CONTENT_GAP),
          y: LANE_HEADER_HEIGHT + row * (CONTENT_HEIGHT + CONTENT_GAP),
        },
        width: CONTENT_WIDTH,
        height: CONTENT_HEIGHT,
        regionId: region.id,
        regionIds: [region.id],
        parentId: id,
        nodeId,
        track: summary.track,
        draggable: true,
      });
    });
    laneX += width + LANE_GAP;
  });

  if (region.resources.count > 0) {
    nodes.push({
      id: `resources:${region.id}`,
      kind: 'resource',
      position: {
        x: FOCUS_PADDING,
        y: FOCUS_HEADER_HEIGHT + laneHeight + LANE_GAP,
      },
      width: focusWidth - FOCUS_PADDING * 2,
      height: RESOURCE_HEIGHT,
      regionId: region.id,
      regionIds: [region.id],
      parentId: rootId,
      draggable: false,
    });
  }

  return {
    view: 'focused-region',
    regionId: region.id,
    nodes,
    edges: [],
    bounds: { x: 0, y: 0, width: focusWidth, height: focusHeight },
  };
}

export function computeArchitectureLayout(
  model: ArchitectureViewModel,
  options: ArchitectureLayoutOptions = {},
): ArchitectureLayoutResult {
  const view = options.view ?? { kind: 'overview' as const };
  return view.kind === 'focused-region'
    ? computeArchitectureFocusedLayout(model, view.regionId)
    : computeArchitectureOverviewLayout(model, options.profile);
}

// ---------------------------------------------------------------------------
// Legacy graph-position adapter
// ---------------------------------------------------------------------------

const LEGACY_CANVAS_WIDTH = 4800;
const LEGACY_STAGE_SPACING_Y = 320;
const LEGACY_BRANCH_OFFSET_X = 380;
const LEGACY_CARD_WIDTH = 280;

export interface LayoutResult {
  nodes: Array<{ id: string; position: { x: number; y: number } }>;
}

/**
 * Kept temporarily for the server page while CanvasViewer moves to the
 * architecture projection. Unlike the former implementation, only explicit
 * `isStageHeading` nodes may occupy the trunk.
 */
export function computeLayout(
  docNodes: DocNode[],
  docEdges: DocEdge[],
  canvasState?: Record<string, { x: number; y: number }>,
): LayoutResult {
  const positions: LayoutResult['nodes'] = [];
  const manualPositions = new Map(Object.entries(canvasState ?? {}));
  const hasManualLayout = manualPositions.size > 5;
  const stageNodes = docNodes
    .filter(node => node.metadata.isStageHeading === true && Number.isInteger(node.stageNumber))
    .sort((left, right) => (left.stageNumber ?? 0) - (right.stageNumber ?? 0));
  const trunkCenterX = LEGACY_CANVAS_WIDTH / 2;
  const startY = 120;
  const stagePositions = new Map<string, { x: number; y: number }>();
  stageNodes.forEach((node, index) => {
    stagePositions.set(node.id, {
      x: trunkCenterX - LEGACY_CARD_WIDTH / 2,
      y: startY + index * LEGACY_STAGE_SPACING_Y + 100,
    });
  });

  const positionById = new Map<string, { x: number; y: number }>();
  for (const node of docNodes) {
    const manual = hasManualLayout ? manualPositions.get(node.id) : undefined;
    if (manual) {
      positions.push({ id: node.id, position: manual });
      positionById.set(node.id, manual);
      continue;
    }
    const stagePosition = node.metadata.isStageHeading === true
      ? stagePositions.get(node.id)
      : undefined;
    if (stagePosition) {
      positions.push({ id: node.id, position: stagePosition });
      positionById.set(node.id, stagePosition);
      continue;
    }

    const parentEdge = docEdges.find(edge => edge.target === node.id && !edge.id.startsWith('edge-stage-'));
    const parentPosition = parentEdge ? positionById.get(parentEdge.source) : undefined;
    const siblingEdges = parentEdge
      ? docEdges.filter(edge => edge.source === parentEdge.source && !edge.id.startsWith('edge-stage-'))
      : [];
    const siblingIndex = parentEdge ? Math.max(0, siblingEdges.findIndex(edge => edge.target === node.id)) : 0;
    let position: { x: number; y: number };
    if (parentPosition) {
      const trackOffset = node.track === 'vibe'
        ? -LEGACY_BRANCH_OFFSET_X
        : node.track === 'pro'
          ? LEGACY_BRANCH_OFFSET_X
          : 180;
      position = {
        x: parentPosition.x + trackOffset,
        y: parentPosition.y + 80 + siblingIndex * 132,
      };
    } else {
      const hash = deterministicInteger(node.id);
      position = {
        x: trunkCenterX - 720 + (hash % 5) * 300,
        y: 40 + (Math.floor(hash / 5) % 4) * 150,
      };
    }
    positions.push({ id: node.id, position });
    positionById.set(node.id, position);
  }
  return { nodes: positions };
}

function deterministicInteger(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
