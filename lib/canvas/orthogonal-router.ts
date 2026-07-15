export interface OrthogonalPoint {
  x: number;
  y: number;
}

export interface OrthogonalRectangle extends OrthogonalPoint {
  id: string;
  width: number;
  height: number;
}

export type OrthogonalRelation = 'flow' | 'dependency' | 'governance' | 'resource';
export type OrthogonalHandleId =
  | 'top-in'
  | 'top-out'
  | 'right-in'
  | 'right-out'
  | 'bottom-in'
  | 'bottom-out'
  | 'left-in'
  | 'left-out';

export interface OrthogonalRouteInput {
  id: string;
  source: OrthogonalRectangle;
  target: OrthogonalRectangle;
  obstacles?: readonly OrthogonalRectangle[];
  relation: OrthogonalRelation;
  preferredAxis?: 'horizontal' | 'vertical';
  trunk?: { axis: 'x' | 'y'; coordinate: number };
  channelIndex?: number;
}

export interface OrthogonalRoute {
  id: string;
  relation: OrthogonalRelation;
  sourceHandle: OrthogonalHandleId;
  targetHandle: OrthogonalHandleId;
  marker: 'arrow-closed';
  waypoints: OrthogonalPoint[];
}

const ROUTE_CLEARANCE = 18;
const OBSTACLE_PADDING = 6;
const CHANNEL_STEP = 10;

function samePoint(left: OrthogonalPoint, right: OrthogonalPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function isOrthogonal(left: OrthogonalPoint, right: OrthogonalPoint): boolean {
  return left.x === right.x || left.y === right.y;
}

export function normalizeOrthogonalWaypoints(
  points: readonly OrthogonalPoint[],
): OrthogonalPoint[] {
  const compact = points.reduce<OrthogonalPoint[]>((result, point) => {
    const normalized = { x: point.x, y: point.y };
    if (!result.length || !samePoint(result[result.length - 1], normalized)) result.push(normalized);
    return result;
  }, []);

  if (compact.length < 2) throw new Error('An orthogonal route requires two distinct waypoints.');
  for (let index = 1; index < compact.length; index++) {
    if (!isOrthogonal(compact[index - 1], compact[index])) {
      throw new Error(`Diagonal pipeline segment at waypoint ${index}.`);
    }
  }

  let changed = true;
  while (changed && compact.length > 2) {
    changed = false;
    for (let index = 1; index < compact.length - 1; index++) {
      const previous = compact[index - 1];
      const current = compact[index];
      const next = compact[index + 1];
      if (
        (previous.x === current.x && current.x === next.x)
        || (previous.y === current.y && current.y === next.y)
      ) {
        compact.splice(index, 1);
        changed = true;
        break;
      }
    }
  }

  return compact;
}

export function segmentIntersectsRectangleInterior(
  start: OrthogonalPoint,
  end: OrthogonalPoint,
  rectangle: OrthogonalRectangle,
): boolean {
  const left = rectangle.x;
  const right = rectangle.x + rectangle.width;
  const top = rectangle.y;
  const bottom = rectangle.y + rectangle.height;

  if (start.y === end.y) {
    const segmentLeft = Math.min(start.x, end.x);
    const segmentRight = Math.max(start.x, end.x);
    return start.y > top && start.y < bottom && segmentRight > left && segmentLeft < right;
  }
  if (start.x === end.x) {
    const segmentTop = Math.min(start.y, end.y);
    const segmentBottom = Math.max(start.y, end.y);
    return start.x > left && start.x < right && segmentBottom > top && segmentTop < bottom;
  }
  return true;
}

function expandRectangle(rectangle: OrthogonalRectangle): OrthogonalRectangle {
  return {
    ...rectangle,
    x: rectangle.x - OBSTACLE_PADDING,
    y: rectangle.y - OBSTACLE_PADDING,
    width: rectangle.width + OBSTACLE_PADDING * 2,
    height: rectangle.height + OBSTACLE_PADDING * 2,
  };
}

function routeIsClear(
  points: readonly OrthogonalPoint[],
  obstacles: readonly OrthogonalRectangle[],
): boolean {
  for (let index = 1; index < points.length; index++) {
    if (obstacles.some(obstacle => (
      segmentIntersectsRectangleInterior(points[index - 1], points[index], obstacle)
    ))) return false;
  }
  return true;
}

function rectangleCenter(rectangle: OrthogonalRectangle): OrthogonalPoint {
  return {
    x: rectangle.x + rectangle.width / 2,
    y: rectangle.y + rectangle.height / 2,
  };
}

function channelOffset(index: number): number {
  if (index <= 0) return 0;
  const magnitude = Math.ceil(index / 2) * CHANNEL_STEP;
  return index % 2 === 1 ? magnitude : -magnitude;
}

function chooseAxis(input: OrthogonalRouteInput): 'horizontal' | 'vertical' {
  if (input.preferredAxis) return input.preferredAxis;
  const source = rectangleCenter(input.source);
  const target = rectangleCenter(input.target);
  const horizontalGap = Math.max(
    0,
    input.target.x - (input.source.x + input.source.width),
    input.source.x - (input.target.x + input.target.width),
  );
  const verticalGap = Math.max(
    0,
    input.target.y - (input.source.y + input.source.height),
    input.source.y - (input.target.y + input.target.height),
  );
  if (horizontalGap > 0 && verticalGap === 0) return 'horizontal';
  if (verticalGap > 0 && horizontalGap === 0) return 'vertical';
  return Math.abs(target.x - source.x) >= Math.abs(target.y - source.y)
    ? 'horizontal'
    : 'vertical';
}

function candidateOuterCoordinates(
  preferred: number,
  minimum: number,
  maximum: number,
  offset: number,
): number[] {
  const candidates = [
    preferred + offset,
    minimum - ROUTE_CLEARANCE - Math.abs(offset),
    maximum + ROUTE_CLEARANCE + Math.abs(offset),
  ];
  return [...new Set(candidates)].sort((left, right) => {
    const distance = Math.abs(left - preferred) - Math.abs(right - preferred);
    return distance || left - right;
  });
}

function horizontalRoute(
  input: OrthogonalRouteInput,
  obstacles: readonly OrthogonalRectangle[],
  offset: number,
): { sourceHandle: OrthogonalHandleId; targetHandle: OrthogonalHandleId; points: OrthogonalPoint[] } {
  const sourceCenter = rectangleCenter(input.source);
  const targetCenter = rectangleCenter(input.target);
  const direction = targetCenter.x >= sourceCenter.x ? 1 : -1;
  const start = {
    x: direction > 0 ? input.source.x + input.source.width : input.source.x,
    y: sourceCenter.y,
  };
  const end = {
    x: direction > 0 ? input.target.x : input.target.x + input.target.width,
    y: targetCenter.y,
  };
  const sourceHandle: OrthogonalHandleId = direction > 0 ? 'right-out' : 'left-out';
  const targetHandle: OrthogonalHandleId = direction > 0 ? 'left-in' : 'right-in';
  const startLaneX = start.x + direction * ROUTE_CLEARANCE;
  const endLaneX = end.x - direction * ROUTE_CLEARANCE;
  const preferredY = input.trunk?.axis === 'y'
    ? input.trunk.coordinate
    : (start.y + end.y) / 2;

  const direct = normalizeOrthogonalWaypoints(
    start.y === end.y
      ? [start, end]
      : [start, { x: startLaneX, y: start.y }, { x: startLaneX, y: preferredY + offset }, {
        x: endLaneX,
        y: preferredY + offset,
      }, { x: endLaneX, y: end.y }, end],
  );
  if (routeIsClear(direct, obstacles)) return { sourceHandle, targetHandle, points: direct };

  const allRectangles = [input.source, input.target, ...obstacles];
  const minimumY = Math.min(...allRectangles.map(rectangle => rectangle.y));
  const maximumY = Math.max(...allRectangles.map(rectangle => rectangle.y + rectangle.height));
  for (const outerY of candidateOuterCoordinates(preferredY, minimumY, maximumY, offset)) {
    const candidate = normalizeOrthogonalWaypoints([
      start,
      { x: startLaneX, y: start.y },
      { x: startLaneX, y: outerY },
      { x: endLaneX, y: outerY },
      { x: endLaneX, y: end.y },
      end,
    ]);
    if (routeIsClear(candidate, obstacles)) return { sourceHandle, targetHandle, points: candidate };
  }

  throw new Error(`Unable to route horizontal pipeline ${input.id} without crossing a room.`);
}

function verticalRoute(
  input: OrthogonalRouteInput,
  obstacles: readonly OrthogonalRectangle[],
  offset: number,
): { sourceHandle: OrthogonalHandleId; targetHandle: OrthogonalHandleId; points: OrthogonalPoint[] } {
  const sourceCenter = rectangleCenter(input.source);
  const targetCenter = rectangleCenter(input.target);
  const direction = targetCenter.y >= sourceCenter.y ? 1 : -1;
  const start = {
    x: sourceCenter.x,
    y: direction > 0 ? input.source.y + input.source.height : input.source.y,
  };
  const end = {
    x: targetCenter.x,
    y: direction > 0 ? input.target.y : input.target.y + input.target.height,
  };
  const sourceHandle: OrthogonalHandleId = direction > 0 ? 'bottom-out' : 'top-out';
  const targetHandle: OrthogonalHandleId = direction > 0 ? 'top-in' : 'bottom-in';
  const startLaneY = start.y + direction * ROUTE_CLEARANCE;
  const endLaneY = end.y - direction * ROUTE_CLEARANCE;
  const preferredX = input.trunk?.axis === 'x'
    ? input.trunk.coordinate
    : (start.x + end.x) / 2;

  const direct = normalizeOrthogonalWaypoints(
    start.x === end.x
      ? [start, end]
      : [start, { x: start.x, y: startLaneY }, { x: preferredX + offset, y: startLaneY }, {
        x: preferredX + offset,
        y: endLaneY,
      }, { x: end.x, y: endLaneY }, end],
  );
  if (routeIsClear(direct, obstacles)) return { sourceHandle, targetHandle, points: direct };

  const allRectangles = [input.source, input.target, ...obstacles];
  const minimumX = Math.min(...allRectangles.map(rectangle => rectangle.x));
  const maximumX = Math.max(...allRectangles.map(rectangle => rectangle.x + rectangle.width));
  for (const outerX of candidateOuterCoordinates(preferredX, minimumX, maximumX, offset)) {
    const candidate = normalizeOrthogonalWaypoints([
      start,
      { x: start.x, y: startLaneY },
      { x: outerX, y: startLaneY },
      { x: outerX, y: endLaneY },
      { x: end.x, y: endLaneY },
      end,
    ]);
    if (routeIsClear(candidate, obstacles)) return { sourceHandle, targetHandle, points: candidate };
  }

  throw new Error(`Unable to route vertical pipeline ${input.id} without crossing a room.`);
}

export function routeOrthogonalEdge(input: OrthogonalRouteInput): OrthogonalRoute {
  if (input.source.id === input.target.id) {
    throw new Error(`Pipeline ${input.id} cannot connect a room to itself.`);
  }
  if (
    input.source.width <= 0
    || input.source.height <= 0
    || input.target.width <= 0
    || input.target.height <= 0
  ) {
    throw new Error(`Pipeline ${input.id} requires positive room dimensions.`);
  }

  const obstacles = (input.obstacles ?? [])
    .filter(obstacle => obstacle.id !== input.source.id && obstacle.id !== input.target.id)
    .map(expandRectangle);
  const offset = channelOffset(input.channelIndex ?? 0);
  const routed = chooseAxis(input) === 'horizontal'
    ? horizontalRoute(input, obstacles, offset)
    : verticalRoute(input, obstacles, offset);

  return {
    id: input.id,
    relation: input.relation,
    sourceHandle: routed.sourceHandle,
    targetHandle: routed.targetHandle,
    marker: 'arrow-closed',
    waypoints: routed.points,
  };
}
