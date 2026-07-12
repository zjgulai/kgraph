import type { CanvasState, CanvasView } from '@/lib/parser/types';

export const CANVAS_LAYOUT_VERSION = 2 as const;
export const CANVAS_LAYOUT_MODE = 'architecture-house' as const;

const LOCAL_STORAGE_PREFIX = 'doccanvas:canvas-state:v2:';
const LEGACY_LOCAL_STORAGE_PREFIX = 'doccas-';
const MAX_NODE_POSITIONS = 5_000;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;

export interface CanvasStateIdentity {
  documentId: string;
  graphFingerprint: string;
}

type CanvasStateOverrides = Partial<Pick<
  CanvasState,
  'view' | 'viewport' | 'expandedNodes' | 'nodePositions' | 'lastSaved'
>>;

export interface LegacyCanvasState {
  documentId: string;
  viewport: { x: number; y: number; zoom: number };
  expandedNodes: string[];
  nodePositions: Record<string, { x: number; y: number }>;
  lastSaved?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isViewport(value: unknown): value is CanvasState['viewport'] {
  if (!isRecord(value)) return false;
  return isFiniteCoordinate(value.x)
    && isFiniteCoordinate(value.y)
    && isFiniteCoordinate(value.zoom)
    && value.zoom >= MIN_ZOOM
    && value.zoom <= MAX_ZOOM;
}

function isCanvasView(value: unknown): value is CanvasView {
  if (!isRecord(value)) return false;
  if (value.kind === 'overview') return true;
  return value.kind === 'focused-region'
    && typeof value.regionId === 'string'
    && value.regionId.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isNodePositions(value: unknown): value is CanvasState['nodePositions'] {
  if (!isRecord(value)) return false;
  const entries = Object.values(value);
  if (entries.length > MAX_NODE_POSITIONS) return false;
  return entries.every(position => isRecord(position)
    && isFiniteCoordinate(position.x)
    && isFiniteCoordinate(position.y));
}

function hasBaseStateShape(value: Record<string, unknown>): value is Record<string, unknown> & LegacyCanvasState {
  return typeof value.documentId === 'string'
    && value.documentId.length > 0
    && isViewport(value.viewport)
    && isStringArray(value.expandedNodes)
    && isNodePositions(value.nodePositions)
    && (value.lastSaved === undefined || typeof value.lastSaved === 'string');
}

export function createCanvasState(
  identity: CanvasStateIdentity,
  overrides: CanvasStateOverrides = {},
): CanvasState {
  return {
    documentId: identity.documentId,
    layoutVersion: CANVAS_LAYOUT_VERSION,
    layoutMode: CANVAS_LAYOUT_MODE,
    graphFingerprint: identity.graphFingerprint,
    view: overrides.view ?? { kind: 'overview' },
    viewport: overrides.viewport ?? { x: 0, y: 0, zoom: 1 },
    expandedNodes: overrides.expandedNodes ?? [],
    nodePositions: overrides.nodePositions ?? {},
    ...(overrides.lastSaved === undefined ? {} : { lastSaved: overrides.lastSaved }),
  };
}

export function resetCanvasState(identity: CanvasStateIdentity): CanvasState {
  return createCanvasState(identity);
}

export function isCanvasStateV2(value: unknown): value is CanvasState {
  if (!isRecord(value) || !hasBaseStateShape(value)) return false;
  return value.layoutVersion === CANVAS_LAYOUT_VERSION
    && value.layoutMode === CANVAS_LAYOUT_MODE
    && typeof value.graphFingerprint === 'string'
    && value.graphFingerprint.length > 0
    && isCanvasView(value.view);
}

export function isLegacyCanvasState(value: unknown): value is LegacyCanvasState {
  if (!isRecord(value) || !hasBaseStateShape(value)) return false;
  return value.layoutVersion === undefined
    && value.layoutMode === undefined
    && value.graphFingerprint === undefined
    && value.view === undefined;
}

export function matchesCanvasState(
  state: CanvasState,
  identity: CanvasStateIdentity,
): boolean {
  return state.layoutVersion === CANVAS_LAYOUT_VERSION
    && state.layoutMode === CANVAS_LAYOUT_MODE
    && state.documentId === identity.documentId
    && state.graphFingerprint === identity.graphFingerprint;
}

export function restoreCanvasState(
  value: unknown,
  identity: CanvasStateIdentity,
): CanvasState | null {
  return isCanvasStateV2(value) && matchesCanvasState(value, identity) ? value : null;
}

export function getCanvasStateLocalStorageKey(documentId: string): string {
  return `${LOCAL_STORAGE_PREFIX}${documentId}`;
}

export function getLegacyCanvasStateLocalStorageKey(documentId: string): string {
  return `${LEGACY_LOCAL_STORAGE_PREFIX}${documentId}`;
}
