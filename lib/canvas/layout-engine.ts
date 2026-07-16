/**
 * Deterministic layouts for the architecture-house overview and focused room.
 * Overview lays out structural floors plus independently connectable rooms.
 * Focused mode expands one room into measured track lanes and projects the
 * source graph through a deterministic orthogonal router.
 */
import type {
  ArchitectureFloor,
  ArchitectureRegion,
  ArchitectureTrack,
  ArchitectureViewModel,
} from './architecture-view-model';
import type { DocEdge, DocNode } from '../parser/types';
import {
  routeOrthogonalEdge,
  type OrthogonalPoint,
  type OrthogonalRectangle,
  type OrthogonalRelation,
} from './orthogonal-router';

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
  kind: OrthogonalRelation;
  sourceHandle: string;
  targetHandle: string;
  marker: 'arrow-closed';
  waypoints: OrthogonalPoint[];
  label?: string;
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
const ROOF_HEIGHT = 72;
const FLOOR_HEIGHT = 224;
const FOUNDATION_HEIGHT = 112;
const AUXILIARY_HEIGHT = 170;
const SECTION_GAP = 24;
const FLOOR_GAP = 16;
const COLUMN_GAP = 24;
const FLOOR_INSET_X = 28;
const FLOOR_ROOM_TOP = 48;
const FLOOR_ROOM_HEIGHT = 158;
// Leave a visible pipeline body ahead of the 8–10px SVG marker. The previous
// 18px room gap allowed the marker to consume nearly the whole connection.
const ROOM_GAP = 32;

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

function overviewRoomNodes(
  floor: ArchitectureFloor,
  regionsById: ReadonlyMap<string, ArchitectureRegion>,
  overviewWidth: number,
  reverseFlow: boolean,
): ArchitectureLayoutNode[] {
  const regions = floor.regionIds
    .map(regionId => regionsById.get(regionId))
    .filter((region): region is ArchitectureRegion => Boolean(region));
  if (regions.length === 0) return [];
  const width = (
    overviewWidth
    - FLOOR_INSET_X * 2
    - ROOM_GAP * Math.max(0, regions.length - 1)
  ) / regions.length;

  return regions.map((region, index) => {
    const visualIndex = reverseFlow ? regions.length - index - 1 : index;
    return {
      id: region.id,
      kind: 'room',
      position: {
        x: FLOOR_INSET_X + visualIndex * (width + ROOM_GAP),
        y: FLOOR_ROOM_TOP,
      },
      width,
      height: FLOOR_ROOM_HEIGHT,
      regionId: region.id,
      regionIds: [region.id],
      parentId: floor.id,
      draggable: false,
    };
  });
}

function absoluteRectanglesById(
  nodes: readonly ArchitectureLayoutNode[],
): ReadonlyMap<string, OrthogonalRectangle> {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const positions = new Map<string, { x: number; y: number }>();

  const positionOf = (node: ArchitectureLayoutNode): { x: number; y: number } => {
    const cached = positions.get(node.id);
    if (cached) return cached;
    const parent = node.parentId ? nodesById.get(node.parentId) : undefined;
    const parentPosition = parent ? positionOf(parent) : { x: 0, y: 0 };
    const position = {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y,
    };
    positions.set(node.id, position);
    return position;
  };

  return new Map(nodes.map(node => {
    const position = positionOf(node);
    return [node.id, {
      id: node.id,
      x: position.x,
      y: position.y,
      width: node.width,
      height: node.height,
    }];
  }));
}

function createLayoutEdge(
  source: ArchitectureLayoutNode,
  target: ArchitectureLayoutNode,
  rectangles: ReadonlyMap<string, OrthogonalRectangle>,
  obstacles: readonly OrthogonalRectangle[],
  relation: OrthogonalRelation,
  index: number,
  options: {
    preferredAxis?: 'horizontal' | 'vertical';
    trunk?: { axis: 'x' | 'y'; coordinate: number };
    label?: string;
  } = {},
): ArchitectureLayoutEdge {
  const sourceRectangle = rectangles.get(source.id);
  const targetRectangle = rectangles.get(target.id);
  if (!sourceRectangle || !targetRectangle) {
    throw new Error(`Missing pipeline geometry for ${source.id} -> ${target.id}.`);
  }
  const id = `edge:architecture:${relation}:${source.id}:${target.id}`;
  const route = routeOrthogonalEdge({
    id,
    source: sourceRectangle,
    target: targetRectangle,
    obstacles,
    relation,
    preferredAxis: options.preferredAxis,
    trunk: options.trunk,
    channelIndex: index,
  });
  return {
    id,
    source: source.id,
    target: target.id,
    kind: relation,
    sourceHandle: route.sourceHandle,
    targetHandle: route.targetHandle,
    marker: route.marker,
    waypoints: route.waypoints,
    label: options.label,
    animated: false,
  };
}

function overviewEdges(
  model: ArchitectureViewModel,
  nodes: readonly ArchitectureLayoutNode[],
  overviewWidth: number,
): ArchitectureLayoutEdge[] {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const rectangles = absoluteRectanglesById(nodes);
  const obstacles = nodes
    .filter(node => ['room', 'foyer', 'annex'].includes(node.kind))
    .map(node => rectangles.get(node.id))
    .filter((rectangle): rectangle is OrthogonalRectangle => Boolean(rectangle));
  const rooms = model.regions
    .filter(region => region.kind === 'room')
    .sort((left, right) => left.order - right.order)
    .map(region => nodeById.get(region.id))
    .filter((node): node is ArchitectureLayoutNode => Boolean(node));
  const foyer = model.mode === 'lifecycle'
    ? nodes.find(node => node.kind === 'foyer')
    : undefined;
  const ordered = foyer ? [foyer, ...rooms] : rooms;
  const edges = ordered.slice(1).map((target, index) => {
    const source = ordered[index];
    const sameFloor = source.parentId !== undefined && source.parentId === target.parentId;
    return createLayoutEdge(
      source,
      target,
      rectangles,
      obstacles,
      'flow',
      index,
      {
        preferredAxis: sameFloor ? 'horizontal' : 'vertical',
        trunk: !sameFloor && source.kind === 'room' && target.kind === 'room'
          ? { axis: 'x', coordinate: overviewWidth / 2 }
          : undefined,
      },
    );
  });

  if (model.mode === 'module') {
    const source = nodeById.get('region:module:security-governance');
    const target = nodeById.get('region:module:boundaries-evolution');
    if (source && target) {
      const sourceRectangle = rectangles.get(source.id);
      if (!sourceRectangle) throw new Error(`Missing governance geometry for ${source.id}.`);
      edges.push(createLayoutEdge(
        source,
        target,
        rectangles,
        obstacles,
        'governance',
        0,
        {
          preferredAxis: 'vertical',
          trunk: {
            axis: 'x',
            coordinate: sourceRectangle.x + sourceRectangle.width / 2,
          },
          label: '治理约束',
        },
      ));
    }
  }

  return edges;
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
  const regionsById = new Map(model.regions.map(region => [region.id, region]));
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
    // Alternate progression direction so the final room on one floor meets
    // the first room on the next at a compact vertical riser.
    nodes.push(...overviewRoomNodes(floor, regionsById, overviewWidth, floor.order % 2 === 0));
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
    edges: overviewEdges(model, nodes, overviewWidth),
    bounds: { x: 0, y: 0, width: overviewWidth, height: y },
  };
}

function laneId(regionId: string, track: ArchitectureTrack): string {
  return `lane:${regionId}:${track}`;
}

function sourceEdgeRelation(edge: DocEdge): OrthogonalRelation {
  if (edge.type === 'reference') return 'resource';
  if (edge.type === 'track' || edge.type === 'expansion') return 'dependency';
  return 'flow';
}

function focusedEdges(
  model: ArchitectureViewModel,
  nodes: readonly ArchitectureLayoutNode[],
): ArchitectureLayoutEdge[] {
  const visibleNodes = nodes.filter(node => node.kind === 'content');
  const visibleNodeById = new Map(visibleNodes.map(node => [node.id, node]));
  const rectangles = absoluteRectanglesById(nodes);
  const obstacles = visibleNodes
    .map(node => rectangles.get(node.id))
    .filter((rectangle): rectangle is OrthogonalRectangle => Boolean(rectangle));

  return model.sourceEdges
    .filter(edge => visibleNodeById.has(edge.source) && visibleNodeById.has(edge.target))
    .map((edge, index) => {
      const source = visibleNodeById.get(edge.source)!;
      const target = visibleNodeById.get(edge.target)!;
      const relation = sourceEdgeRelation(edge);
      const layoutEdge = createLayoutEdge(
        source,
        target,
        rectangles,
        obstacles,
        relation,
        index % 7,
        {
          preferredAxis: source.parentId !== target.parentId ? 'horizontal' : undefined,
          label: edge.label,
        },
      );
      return { ...layoutEdge, id: `edge:focus:${edge.id}` };
    });
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
    const columns = summary.count >= 17 ? 4 : summary.count >= 9 ? 3 : summary.count >= 5 ? 2 : 1;
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
    edges: focusedEdges(model, nodes),
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
