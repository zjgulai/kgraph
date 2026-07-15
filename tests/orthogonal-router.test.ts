import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeOrthogonalWaypoints,
  routeOrthogonalEdge,
  segmentIntersectsRectangleInterior,
  type OrthogonalPoint,
  type OrthogonalRectangle,
} from '../lib/canvas/orthogonal-router';

function assertOrthogonal(points: readonly OrthogonalPoint[]): void {
  assert.ok(points.length >= 2);
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const point = points[index];
    assert.notDeepEqual(point, previous, `zero-length segment at ${index}`);
    assert.ok(
      point.x === previous.x || point.y === previous.y,
      `diagonal segment ${JSON.stringify(previous)} -> ${JSON.stringify(point)}`,
    );
  }

  for (let index = 2; index < points.length; index++) {
    const a = points[index - 2];
    const b = points[index - 1];
    const c = points[index];
    if (a.x === b.x && b.x === c.x) {
      assert.ok((b.y - a.y) * (c.y - b.y) > 0, `vertical backtrack at ${index - 1}`);
    }
    if (a.y === b.y && b.y === c.y) {
      assert.ok((b.x - a.x) * (c.x - b.x) > 0, `horizontal backtrack at ${index - 1}`);
    }
  }
}

function assertAvoids(points: readonly OrthogonalPoint[], obstacles: readonly OrthogonalRectangle[]): void {
  for (let index = 1; index < points.length; index++) {
    for (const obstacle of obstacles) {
      assert.equal(
        segmentIntersectsRectangleInterior(points[index - 1], points[index], obstacle),
        false,
        `segment crosses ${obstacle.id}`,
      );
    }
  }
}

test('router creates a directed horizontal route with explicit handles and marker', () => {
  const route = routeOrthogonalEdge({
    id: 'horizontal',
    source: { id: 'source', x: 0, y: 0, width: 160, height: 100 },
    target: { id: 'target', x: 260, y: 0, width: 160, height: 100 },
    relation: 'flow',
  });

  assert.equal(route.sourceHandle, 'right-out');
  assert.equal(route.targetHandle, 'left-in');
  assert.equal(route.marker, 'arrow-closed');
  assert.equal(route.relation, 'flow');
  assertOrthogonal(route.waypoints);
});
test('router uses a stable trunk and avoids room rectangles on cross-floor routes', () => {
  const obstacle = { id: 'middle-room', x: 360, y: 180, width: 240, height: 150 };
  const input = {
    id: 'vertical-trunk',
    source: { id: 'source', x: 80, y: 420, width: 240, height: 150 },
    target: { id: 'target', x: 700, y: 20, width: 240, height: 150 },
    obstacles: [obstacle],
    relation: 'dependency' as const,
    preferredAxis: 'vertical' as const,
    trunk: { axis: 'x' as const, coordinate: 650 },
    channelIndex: 2,
  };
  const first = routeOrthogonalEdge(input);
  const second = routeOrthogonalEdge(input);

  assert.deepEqual(first, second);
  assert.equal(first.sourceHandle, 'top-out');
  assert.equal(first.targetHandle, 'bottom-in');
  assertOrthogonal(first.waypoints);
  assertAvoids(first.waypoints, [obstacle]);
});

test('waypoint normalization removes duplicate, collinear, and reversing segments', () => {
  const normalized = normalizeOrthogonalWaypoints([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 40 },
    { x: 20, y: 80 },
  ]);

  assert.deepEqual(normalized, [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 80 },
  ]);
  assertOrthogonal(normalized);
});
