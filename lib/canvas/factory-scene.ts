import type {
  ArchitectureLayoutEdge,
  ArchitectureLayoutNode,
  ArchitectureLayoutResult,
} from './layout-engine';
import {
  routeOrthogonalEdge,
  segmentIntersectsRectangleInterior,
  type OrthogonalHandleId,
  type OrthogonalPoint,
  type OrthogonalRectangle,
} from './orthogonal-router';

export interface FactoryViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface FactorySceneNode extends ArchitectureLayoutNode {
  absolutePosition: OrthogonalPoint;
}

export interface FactorySceneEdge extends ArchitectureLayoutEdge {
  path: string;
  length: number;
  labelPoint: OrthogonalPoint;
}

export interface FactoryScene {
  nodes: FactorySceneNode[];
  edges: FactorySceneEdge[];
  bounds: ArchitectureLayoutResult['bounds'];
}

export type FactoryNodePositions = Record<string, OrthogonalPoint>;

export interface FactorySpatialIndex {
  cellSize: number;
  nodeCells: ReadonlyMap<string, ReadonlySet<string>>;
  edgeCells: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface FactorySpatialQuery {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

const OBSTACLE_KINDS = new Set<ArchitectureLayoutNode['kind']>([
  'room',
  'foyer',
  'annex',
  'content',
]);

function cellKeysForBounds(
  bounds: { left: number; top: number; right: number; bottom: number },
  cellSize: number,
): string[] {
  const startX = Math.floor(bounds.left / cellSize);
  const endX = Math.floor(bounds.right / cellSize);
  const startY = Math.floor(bounds.top / cellSize);
  const endY = Math.floor(bounds.bottom / cellSize);
  const keys: string[] = [];
  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) keys.push(`${x}:${y}`);
  }
  return keys;
}

function addToCells(cells: Map<string, Set<string>>, keys: readonly string[], id: string): void {
  for (const key of keys) {
    const values = cells.get(key) ?? new Set<string>();
    values.add(id);
    cells.set(key, values);
  }
}

export function createFactorySpatialIndex(
  nodes: readonly FactorySceneNode[],
  edges: readonly FactorySceneEdge[],
  cellSize = 320,
): FactorySpatialIndex {
  if (!Number.isFinite(cellSize) || cellSize < 64) throw new Error('Factory spatial index cell size is invalid.');
  const nodeCells = new Map<string, Set<string>>();
  const edgeCells = new Map<string, Set<string>>();
  for (const node of nodes) {
    addToCells(nodeCells, cellKeysForBounds({
      left: node.absolutePosition.x,
      top: node.absolutePosition.y,
      right: node.absolutePosition.x + node.width,
      bottom: node.absolutePosition.y + node.height,
    }, cellSize), node.id);
  }
  for (const edge of edges) {
    const xs = edge.waypoints.map(point => point.x);
    const ys = edge.waypoints.map(point => point.y);
    addToCells(edgeCells, cellKeysForBounds({
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    }, cellSize), edge.id);
  }
  return { cellSize, nodeCells, edgeCells };
}

export function queryFactorySpatialIndex(
  index: FactorySpatialIndex,
  bounds: { left: number; top: number; right: number; bottom: number },
): FactorySpatialQuery {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  for (const key of cellKeysForBounds(bounds, index.cellSize)) {
    for (const id of index.nodeCells.get(key) ?? []) nodeIds.add(id);
    for (const id of index.edgeCells.get(key) ?? []) edgeIds.add(id);
  }
  return { nodeIds, edgeIds };
}

function finitePoint(point: OrthogonalPoint | undefined): point is OrthogonalPoint {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function resolveFactorySceneNodes(
  nodes: readonly ArchitectureLayoutNode[],
  positions: FactoryNodePositions = {},
): FactorySceneNode[] {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const resolved = new Map<string, OrthogonalPoint>();
  const resolving = new Set<string>();

  const resolvePosition = (node: ArchitectureLayoutNode): OrthogonalPoint => {
    const override = positions[node.id];
    if (finitePoint(override) && node.draggable) return { ...override };
    const cached = resolved.get(node.id);
    if (cached) return cached;
    if (resolving.has(node.id)) throw new Error(`Factory scene parent cycle at ${node.id}.`);
    resolving.add(node.id);
    const parent = node.parentId ? nodeById.get(node.parentId) : undefined;
    if (node.parentId && !parent) throw new Error(`Factory scene parent not found: ${node.parentId}.`);
    const parentPosition = parent ? resolvePosition(parent) : { x: 0, y: 0 };
    const position = {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y,
    };
    resolving.delete(node.id);
    resolved.set(node.id, position);
    return position;
  };

  return nodes.map(node => ({ ...node, absolutePosition: resolvePosition(node) }));
}

export function sceneNodeRectangle(node: FactorySceneNode): OrthogonalRectangle {
  return {
    id: node.id,
    x: node.absolutePosition.x,
    y: node.absolutePosition.y,
    width: node.width,
    height: node.height,
  };
}

export function waypointPath(points: readonly OrthogonalPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`).join(' ');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function polylineLength(points: readonly OrthogonalPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.abs(points[index].x - points[index - 1].x)
      + Math.abs(points[index].y - points[index - 1].y);
  }
  return length;
}

export function pointAlongPolyline(
  points: readonly OrthogonalPoint[],
  fraction = 0.5,
): OrthogonalPoint {
  if (points.length < 2) throw new Error('A pipeline requires at least two waypoints.');
  const length = polylineLength(points);
  if (length <= 0) throw new Error('A pipeline requires a positive length.');
  let remaining = length * Math.max(0, Math.min(1, fraction));
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    if (remaining <= segmentLength) {
      const ratio = segmentLength === 0 ? 0 : remaining / segmentLength;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }
    remaining -= segmentLength;
  }
  return { ...points[points.length - 1] };
}

function portPoint(rectangle: OrthogonalRectangle, handle: OrthogonalHandleId): OrthogonalPoint {
  if (handle.startsWith('top-')) return { x: rectangle.x + rectangle.width / 2, y: rectangle.y };
  if (handle.startsWith('bottom-')) return { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height };
  if (handle.startsWith('left-')) return { x: rectangle.x, y: rectangle.y + rectangle.height / 2 };
  return { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height / 2 };
}

function withLiveEndpoints(
  edge: ArchitectureLayoutEdge,
  waypoints: readonly OrthogonalPoint[],
  rectangles: ReadonlyMap<string, OrthogonalRectangle>,
): OrthogonalPoint[] {
  const source = rectangles.get(edge.source);
  const target = rectangles.get(edge.target);
  if (!source || !target || waypoints.length < 2) return [...waypoints];
  const next = waypoints.map(point => ({ ...point }));
  next[0] = portPoint(source, edge.sourceHandle as OrthogonalHandleId);
  next[next.length - 1] = portPoint(target, edge.targetHandle as OrthogonalHandleId);
  if (next.length > 2) {
    if (edge.sourceHandle.startsWith('left-') || edge.sourceHandle.startsWith('right-')) next[1].y = next[0].y;
    else next[1].x = next[0].x;
    const beforeTarget = next[next.length - 2];
    if (edge.targetHandle.startsWith('left-') || edge.targetHandle.startsWith('right-')) beforeTarget.y = next[next.length - 1].y;
    else beforeTarget.x = next[next.length - 1].x;
  }
  return next;
}

function edgeTouchesMovedObstacle(
  edge: ArchitectureLayoutEdge,
  movedRectangles: readonly OrthogonalRectangle[],
): boolean {
  if (movedRectangles.some(rectangle => rectangle.id === edge.source || rectangle.id === edge.target)) return true;
  for (let index = 1; index < edge.waypoints.length; index += 1) {
    if (movedRectangles.some(rectangle => (
      segmentIntersectsRectangleInterior(edge.waypoints[index - 1], edge.waypoints[index], rectangle)
    ))) return true;
  }
  return false;
}

export function materializeFactoryScene(
  layout: ArchitectureLayoutResult,
  routedPositions: FactoryNodePositions = {},
  livePositions: FactoryNodePositions = routedPositions,
): FactoryScene {
  const routedNodes = resolveFactorySceneNodes(layout.nodes, routedPositions);
  const liveNodes = resolveFactorySceneNodes(layout.nodes, livePositions);
  const routedRectangles = new Map(routedNodes.map(node => [node.id, sceneNodeRectangle(node)]));
  const liveRectangles = new Map(liveNodes.map(node => [node.id, sceneNodeRectangle(node)]));
  const movedIds = new Set(Object.keys(routedPositions));
  const movedRectangles = routedNodes
    .filter(node => movedIds.has(node.id))
    .map(sceneNodeRectangle);
  const obstacles = routedNodes
    .filter(node => OBSTACLE_KINDS.has(node.kind))
    .map(sceneNodeRectangle);

  const edges = layout.edges.map((edge, index): FactorySceneEdge => {
    let waypoints = edge.waypoints;
    if (movedRectangles.length > 0 && edgeTouchesMovedObstacle(edge, movedRectangles)) {
      const source = routedRectangles.get(edge.source);
      const target = routedRectangles.get(edge.target);
      if (source && target) {
        const route = routeOrthogonalEdge({
          id: edge.id,
          source,
          target,
          obstacles,
          relation: edge.kind,
          channelIndex: index % 9,
        });
        waypoints = route.waypoints;
      }
    }
    waypoints = withLiveEndpoints(edge, waypoints, liveRectangles);
    const length = polylineLength(waypoints);
    if (length <= 0) throw new Error(`Factory pipeline ${edge.id} has no visible body.`);
    return {
      ...edge,
      waypoints,
      path: waypointPath(waypoints),
      length,
      labelPoint: pointAlongPolyline(waypoints),
    };
  });

  return { nodes: liveNodes, edges, bounds: layout.bounds };
}

export function connectedFactoryEdges(
  nodeId: string,
  edges: readonly Pick<ArchitectureLayoutEdge, 'id' | 'source' | 'target'>[],
): Set<string> {
  const incoming = new Map<string, Array<{ edgeId: string; nodeId: string }>>();
  const outgoing = new Map<string, Array<{ edgeId: string; nodeId: string }>>();
  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), { edgeId: edge.id, nodeId: edge.target }]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), { edgeId: edge.id, nodeId: edge.source }]);
  }
  const result = new Set<string>();
  const walk = (start: string, graph: ReadonlyMap<string, Array<{ edgeId: string; nodeId: string }>>) => {
    const visited = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift()!;
      for (const relation of graph.get(current) ?? []) {
        result.add(relation.edgeId);
        if (!visited.has(relation.nodeId)) {
          visited.add(relation.nodeId);
          queue.push(relation.nodeId);
        }
      }
    }
  };
  walk(nodeId, outgoing);
  walk(nodeId, incoming);
  return result;
}
