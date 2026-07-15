import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANVAS_LAYOUT_MODE,
  CANVAS_LAYOUT_VERSION,
  createCanvasState,
  createCanvasStateForSave,
  getCanvasStateLocalStorageKey,
  getLegacyCanvasStateLocalStorageKey,
  getPreviousCanvasStateLocalStorageKey,
  isCanvasStateV3,
  matchesCanvasState,
  resetCanvasState,
  restoreCanvasState,
} from '../lib/canvas/canvas-state';

const identity = {
  documentId: 'vibe-track',
  graphFingerprint: 'sha256:graph-v2',
};

function populatedState() {
  return createCanvasState(identity, {
    view: { kind: 'focused-region', regionId: 'stage-3' },
    viewport: { x: 120, y: -80, zoom: 0.75 },
    expandedNodes: ['stage-3'],
    nodePositions: { 'stage-3': { x: 40, y: 60 } },
    lastSaved: '2026-07-12T12:00:00.000Z',
  });
}

test('creates a deterministic empty factory-scene v3 state', () => {
  assert.deepEqual(createCanvasState(identity), {
    documentId: 'vibe-track',
    layoutVersion: 3,
    layoutMode: 'factory-scene',
    graphFingerprint: 'sha256:graph-v2',
    view: { kind: 'overview' },
    viewport: { x: 0, y: 0, zoom: 1 },
    expandedNodes: [],
    nodePositions: {},
  });
  assert.equal(CANVAS_LAYOUT_VERSION, 3);
  assert.equal(CANVAS_LAYOUT_MODE, 'factory-scene');
});

test('mobile saves never persist the hidden desktop viewport for later restoration', () => {
  const mobileState = createCanvasStateForSave(identity, {
    view: { kind: 'focused-region', regionId: 'stage-5' },
    viewport: { x: -10_000, y: 0, zoom: 0.2 },
    expandedNodes: ['tracks:v3'],
    nodePositions: {},
    savedAt: '2026-07-15T09:00:00.000Z',
    viewportCanRestore: false,
  });

  assert.deepEqual(mobileState.viewport, { x: 0, y: 0, zoom: 1 });
  assert.equal(mobileState.lastSaved, undefined);
  assert.deepEqual(mobileState.view, { kind: 'focused-region', regionId: 'stage-5' });

  const desktopState = createCanvasStateForSave(identity, {
    view: { kind: 'overview' },
    viewport: { x: 120, y: -80, zoom: 0.75 },
    expandedNodes: ['tracks:v3'],
    nodePositions: {},
    savedAt: '2026-07-15T09:00:00.000Z',
    viewportCanRestore: true,
  });

  assert.deepEqual(desktopState.viewport, { x: 120, y: -80, zoom: 0.75 });
  assert.equal(desktopState.lastSaved, '2026-07-15T09:00:00.000Z');
});

test('uses a versioned localStorage key and identifies the old key only for cleanup', () => {
  assert.equal(
    getCanvasStateLocalStorageKey('vibe-track'),
    'doccanvas:factory-scene:v3:vibe-track',
  );
  assert.equal(getPreviousCanvasStateLocalStorageKey('vibe-track'), 'doccanvas:canvas-state:v2:vibe-track');
  assert.equal(getLegacyCanvasStateLocalStorageKey('vibe-track'), 'doccas-vibe-track');
});

test('validates the complete v3 state and rejects legacy or malformed payloads', () => {
  assert.equal(isCanvasStateV3(populatedState()), true);
  assert.equal(isCanvasStateV3({
    documentId: 'vibe-track',
    viewport: { x: 0, y: 0, zoom: 1 },
    expandedNodes: [],
    nodePositions: {},
  }), false);
  assert.equal(isCanvasStateV3({
    ...populatedState(),
    nodePositions: { node: { x: Number.POSITIVE_INFINITY, y: 0 } },
  }), false);
  assert.equal(isCanvasStateV3({
    ...populatedState(),
    view: { kind: 'focused-region', regionId: '' },
  }), false);
});

test('restores only an exact document, layout, and graph match', () => {
  const state = populatedState();
  assert.equal(matchesCanvasState(state, identity), true);
  assert.deepEqual(restoreCanvasState(state, identity), state);

  assert.equal(restoreCanvasState(state, { ...identity, documentId: 'v2-pro' }), null);
  assert.equal(restoreCanvasState(state, { ...identity, graphFingerprint: 'sha256:new-graph' }), null);
  assert.equal(restoreCanvasState({ ...state, layoutVersion: 1 }, identity), null);
  assert.equal(restoreCanvasState({ ...state, layoutMode: 'legacy-flow' }, identity), null);
});

test('v2 state migrates viewport, module and expansion but discards old node coordinates', () => {
  const previous = {
    ...populatedState(),
    layoutVersion: 2 as const,
    layoutMode: 'architecture-house' as const,
    nodePositions: { 'legacy-node': { x: 500, y: 500 } },
  };
  assert.deepEqual(restoreCanvasState(previous, identity), {
    ...populatedState(),
    layoutVersion: 3,
    layoutMode: 'factory-scene',
    selectedModuleId: 'stage-3',
    nodePositions: {},
  });

  const legacy = {
    documentId: 'vibe-track',
    viewport: { x: 999, y: 999, zoom: 0.1 },
    expandedNodes: ['legacy-node'],
    nodePositions: { 'legacy-node': { x: 500, y: 500 } },
    lastSaved: '2026-07-10T00:00:00.000Z',
  };

  assert.equal(restoreCanvasState(legacy, identity), null);
  assert.deepEqual(resetCanvasState(identity), createCanvasState(identity));
});
