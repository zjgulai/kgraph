import type { CanvasState, CanvasView } from '@/lib/parser/types';

export const CANVAS_LAYOUT_VERSION = 3 as const;
export const CANVAS_LAYOUT_MODE = 'factory-scene' as const;

const LOCAL_STORAGE_PREFIX = 'doccanvas:factory-scene:v3:';
const PREVIOUS_LOCAL_STORAGE_PREFIX = 'doccanvas:canvas-state:v2:';
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
  'view' | 'selectedModuleId' | 'viewport' | 'expandedNodes' | 'nodePositions' | 'lastSaved'
>>;

interface CanvasStateSaveOptions {
  view: CanvasView;
  selectedModuleId?: string;
  viewport: CanvasState['viewport'];
  expandedNodes: string[];
  nodePositions: CanvasState['nodePositions'];
  savedAt: string;
  viewportCanRestore: boolean;
}

export interface LegacyCanvasState {
  documentId: string;
  viewport: { x: number; y: number; zoom: number };
  expandedNodes: string[];
  nodePositions: Record<string, { x: number; y: number }>;
  lastSaved?: string;
}

export interface CanvasStateV2 extends LegacyCanvasState {
  layoutVersion: 2;
  layoutMode: 'architecture-house';
  graphFingerprint: string;
  view: CanvasView;
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
    ...(overrides.selectedModuleId ? { selectedModuleId: overrides.selectedModuleId } : {}),
    viewport: overrides.viewport ?? { x: 0, y: 0, zoom: 1 },
    expandedNodes: overrides.expandedNodes ?? [],
    nodePositions: overrides.nodePositions ?? {},
    ...(overrides.lastSaved === undefined ? {} : { lastSaved: overrides.lastSaved }),
  };
}

export function createCanvasStateForSave(
  identity: CanvasStateIdentity,
  options: CanvasStateSaveOptions,
): CanvasState {
  return createCanvasState(identity, {
    view: options.view,
    ...(options.selectedModuleId ? { selectedModuleId: options.selectedModuleId } : {}),
    viewport: options.viewportCanRestore ? options.viewport : { x: 0, y: 0, zoom: 1 },
    expandedNodes: options.expandedNodes,
    nodePositions: options.nodePositions,
    ...(options.viewportCanRestore ? { lastSaved: options.savedAt } : {}),
  });
}

export function resetCanvasState(identity: CanvasStateIdentity): CanvasState {
  return createCanvasState(identity);
}

export function isCanvasStateV3(value: unknown): value is CanvasState {
  if (!isRecord(value) || !hasBaseStateShape(value)) return false;
  return value.layoutVersion === CANVAS_LAYOUT_VERSION
    && value.layoutMode === CANVAS_LAYOUT_MODE
    && typeof value.graphFingerprint === 'string'
    && value.graphFingerprint.length > 0
    && (value.selectedModuleId === undefined || (typeof value.selectedModuleId === 'string' && value.selectedModuleId.length > 0))
    && isCanvasView(value.view);
}

export function isCanvasStateV2(value: unknown): value is CanvasStateV2 {
  if (!isRecord(value) || !hasBaseStateShape(value)) return false;
  return value.layoutVersion === 2
    && value.layoutMode === 'architecture-house'
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
  if (isCanvasStateV3(value)) return matchesCanvasState(value, identity) ? value : null;
  if (
    isCanvasStateV2(value)
    && value.documentId === identity.documentId
    && value.graphFingerprint === identity.graphFingerprint
  ) {
    return createCanvasState(identity, {
      view: value.view,
      selectedModuleId: value.view.kind === 'focused-region' ? value.view.regionId : undefined,
      viewport: value.viewport,
      expandedNodes: value.expandedNodes,
      nodePositions: {},
      ...(value.lastSaved ? { lastSaved: value.lastSaved } : {}),
    });
  }
  return null;
}

export function getCanvasStateLocalStorageKey(documentId: string): string {
  return `${LOCAL_STORAGE_PREFIX}${documentId}`;
}

export function getLegacyCanvasStateLocalStorageKey(documentId: string): string {
  return `${LEGACY_LOCAL_STORAGE_PREFIX}${documentId}`;
}

export function getPreviousCanvasStateLocalStorageKey(documentId: string): string {
  return `${PREVIOUS_LOCAL_STORAGE_PREFIX}${documentId}`;
}
