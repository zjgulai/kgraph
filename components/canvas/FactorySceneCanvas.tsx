'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import type { ArchitectureLayoutEdge, ArchitectureLayoutNode, ArchitectureLayoutResult } from '@/lib/canvas/layout-engine';
import {
  connectedFactoryEdges,
  createFactorySpatialIndex,
  materializeFactoryScene,
  queryFactorySpatialIndex,
  type FactoryNodePositions,
  type FactorySceneEdge,
  type FactorySceneNode,
  type FactoryViewport,
} from '@/lib/canvas/factory-scene';

export interface FactorySceneCanvasHandle {
  fit: (animated?: boolean) => void;
  getViewport: () => FactoryViewport;
  setViewport: (viewport: FactoryViewport, animated?: boolean) => void;
  getNodePositions: () => FactoryNodePositions;
  getSceneElement: () => HTMLDivElement | null;
  resetNodePositions: () => void;
}

interface Props {
  layout: ArchitectureLayoutResult;
  viewKey: string;
  initialViewport?: FactoryViewport;
  initialNodePositions?: FactoryNodePositions;
  selectedSceneNodeId?: string | null;
  highlightedSceneNodeId?: string | null;
  renderNode: (node: FactorySceneNode) => ReactNode;
  getNodeLabel?: (node: FactorySceneNode) => string;
  onNodeActivate?: (node: FactorySceneNode) => void;
  onNodePositionsChange?: (positions: FactoryNodePositions) => void;
  onEdgeActivate?: (edge: FactorySceneEdge) => void;
  onViewportChange?: (viewport: FactoryViewport) => void;
  renderAll?: boolean;
  autoFitOnMount?: boolean;
  ariaLabel?: string;
  relationAriaLabel?: string;
  fitControlLabel?: string;
}

interface DragState {
  pointerId: number;
  nodeId: string;
  origin: { x: number; y: number };
  startClient: { x: number; y: number };
  moved: boolean;
}

interface PanState {
  pointerId: number;
  startClient: { x: number; y: number };
  startViewport: FactoryViewport;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const NODE_RENDER_LIMIT = 350;
const EDGE_RENDER_LIMIT = 700;
const ROUTE_THROTTLE_MS = 50;
const TRACE_CLEAR_DELAY_MS = 280;

interface RelationSvgPresentation {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
}

const RELATION_SVG_PRESENTATION: Record<ArchitectureLayoutEdge['kind'], RelationSvgPresentation> = {
  flow: {
    stroke: 'var(--factory-pipeline-main)',
    strokeWidth: 3,
  },
  dependency: {
    stroke: 'var(--factory-pipeline-dependency)',
    strokeWidth: 2,
    strokeDasharray: '8 6',
  },
  governance: {
    stroke: 'var(--factory-pipeline-governance)',
    strokeWidth: 2,
    strokeDasharray: '10 3 2 3',
  },
  resource: {
    stroke: 'var(--factory-pipeline-resource)',
    strokeWidth: 1.5,
  },
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function relationLabel(edge: Pick<ArchitectureLayoutEdge, 'kind' | 'label'>): string {
  if (edge.label) return edge.label;
  if (edge.kind === 'flow') return '主流程';
  if (edge.kind === 'governance') return '治理约束';
  if (edge.kind === 'resource') return '资源引用';
  return '工程依赖';
}

function markerId(kind: ArchitectureLayoutEdge['kind']): string {
  return `factory-marker-${kind}`;
}

function isStructuralNode(node: FactorySceneNode): boolean {
  return node.kind !== 'content' && node.kind !== 'resource';
}

function intersectsViewport(
  node: FactorySceneNode,
  viewport: FactoryViewport,
  width: number,
  height: number,
): boolean {
  const overscan = 240 / viewport.zoom;
  const left = -viewport.x / viewport.zoom - overscan;
  const top = -viewport.y / viewport.zoom - overscan;
  const right = left + width / viewport.zoom + overscan * 2;
  const bottom = top + height / viewport.zoom + overscan * 2;
  return node.absolutePosition.x + node.width >= left
    && node.absolutePosition.x <= right
    && node.absolutePosition.y + node.height >= top
    && node.absolutePosition.y <= bottom;
}

function edgeIntersectsViewport(
  edge: FactorySceneEdge,
  viewport: FactoryViewport,
  width: number,
  height: number,
): boolean {
  const overscan = 180 / viewport.zoom;
  const left = -viewport.x / viewport.zoom - overscan;
  const top = -viewport.y / viewport.zoom - overscan;
  const right = left + width / viewport.zoom + overscan * 2;
  const bottom = top + height / viewport.zoom + overscan * 2;
  const pointIsVisible = (point: { x: number; y: number }) => (
    point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
  );
  if (edge.waypoints.some(pointIsVisible)) return true;

  for (let index = 1; index < edge.waypoints.length; index += 1) {
    const start = edge.waypoints[index - 1];
    const end = edge.waypoints[index];
    const segmentLeft = Math.min(start.x, end.x);
    const segmentRight = Math.max(start.x, end.x);
    const segmentTop = Math.min(start.y, end.y);
    const segmentBottom = Math.max(start.y, end.y);
    if (
      segmentRight >= left
      && segmentLeft <= right
      && segmentBottom >= top
      && segmentTop <= bottom
    ) return true;
  }

  return false;
}

export const FactorySceneCanvas = forwardRef<FactorySceneCanvasHandle, Props>(function FactorySceneCanvas({
  layout,
  viewKey,
  initialViewport,
  initialNodePositions,
  selectedSceneNodeId,
  highlightedSceneNodeId,
  renderNode,
  getNodeLabel,
  onNodeActivate,
  onNodePositionsChange,
  onEdgeActivate,
  onViewportChange,
  renderAll = false,
  autoFitOnMount = true,
  ariaLabel = '产品工厂关系画布',
  relationAriaLabel = '生产关系',
  fitControlLabel = '适应建筑',
}, forwardedRef) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<FactoryViewport>(initialViewport ?? { x: 0, y: 0, zoom: 1 });
  const positionsRef = useRef<FactoryNodePositions>(initialNodePositions ?? {});
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const routeTimerRef = useRef<number | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const traceTimerRef = useRef<number | null>(null);
  const traceGenerationRef = useRef(0);
  const previousViewKeyRef = useRef(viewKey);
  const pendingAutoFitRef = useRef(autoFitOnMount && !initialViewport);
  const [viewport, setViewportState] = useState<FactoryViewport>(viewportRef.current);
  const [positions, setPositions] = useState<FactoryNodePositions>(positionsRef.current);
  const [routedPositions, setRoutedPositions] = useState<FactoryNodePositions>(positionsRef.current);
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [trace, setTrace] = useState<{ generation: number; edgeIds: Set<string> }>({
    generation: 0,
    edgeIds: new Set(),
  });
  const [cameraAnimating, setCameraAnimating] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const sceneResult = useMemo(() => {
    const startedAt = performance.now();
    const value = materializeFactoryScene(layout, routedPositions, positions);
    return { value, durationMs: performance.now() - startedAt };
  }, [layout, positions, routedPositions]);
  const scene = sceneResult.value;
  const sceneNodeById = useMemo(() => new Map(scene.nodes.map(node => [node.id, node])), [scene.nodes]);
  const sceneEdgeById = useMemo(() => new Map(scene.edges.map(edge => [edge.id, edge])), [scene.edges]);
  const spatialIndex = useMemo(
    () => createFactorySpatialIndex(scene.nodes, scene.edges),
    [scene.edges, scene.nodes],
  );

  const applyViewport = useCallback((next: FactoryViewport, animated = false) => {
    const normalized = {
      x: Number.isFinite(next.x) ? next.x : 0,
      y: Number.isFinite(next.y) ? next.y : 0,
      zoom: clamp(Number.isFinite(next.zoom) ? next.zoom : 1, MIN_ZOOM, MAX_ZOOM),
    };
    viewportRef.current = normalized;
    setViewportState(normalized);
    onViewportChange?.(normalized);
    if (cameraTimerRef.current !== null) window.clearTimeout(cameraTimerRef.current);
    setCameraAnimating(animated && !reducedMotion);
    if (animated && !reducedMotion) {
      cameraTimerRef.current = window.setTimeout(() => setCameraAnimating(false), 240);
    }
  }, [onViewportChange, reducedMotion]);

  const fit = useCallback((animated = true) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || scene.bounds.width <= 0 || scene.bounds.height <= 0) return;
    const padding = layout.view === 'overview' ? 36 : 52;
    const zoom = clamp(Math.min(
      (rect.width - padding * 2) / scene.bounds.width,
      (rect.height - padding * 2) / scene.bounds.height,
    ), MIN_ZOOM, MAX_ZOOM);
    applyViewport({
      x: (rect.width - scene.bounds.width * zoom) / 2 - scene.bounds.x * zoom,
      y: (rect.height - scene.bounds.height * zoom) / 2 - scene.bounds.y * zoom,
      zoom,
    }, animated);
  }, [applyViewport, layout.view, scene.bounds]);

  useImperativeHandle(forwardedRef, () => ({
    fit,
    getViewport: () => viewportRef.current,
    setViewport: applyViewport,
    getNodePositions: () => ({ ...positionsRef.current }),
    getSceneElement: () => sceneRef.current,
    resetNodePositions: () => {
      positionsRef.current = {};
      setPositions({});
      setRoutedPositions({});
    },
  }), [applyViewport, fit]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setReducedMotion(media.matches);
      if (!media.matches) return;
      if (traceTimerRef.current !== null) window.clearTimeout(traceTimerRef.current);
      traceTimerRef.current = null;
      setTrace(previous => ({ ...previous, edgeIds: new Set() }));
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    positionsRef.current = initialNodePositions ?? {};
    setPositions(initialNodePositions ?? {});
    setRoutedPositions(initialNodePositions ?? {});
  }, [initialNodePositions]);

  useEffect(() => {
    if (previousViewKeyRef.current === viewKey) return;
    previousViewKeyRef.current = viewKey;
    pendingAutoFitRef.current = false;
    positionsRef.current = {};
    setPositions({});
    setRoutedPositions({});
    const frame = window.requestAnimationFrame(() => fit(true));
    return () => window.cancelAnimationFrame(frame);
  }, [fit, viewKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setContainerSize({ width: rect.width, height: rect.height });
      if (pendingAutoFitRef.current && layout.nodes.length > 0) {
        pendingAutoFitRef.current = false;
        window.requestAnimationFrame(() => fit(false));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fit, layout.nodes.length, viewKey]);

  useEffect(() => () => {
    if (routeTimerRef.current !== null) window.clearTimeout(routeTimerRef.current);
    if (cameraTimerRef.current !== null) window.clearTimeout(cameraTimerRef.current);
    if (traceTimerRef.current !== null) window.clearTimeout(traceTimerRef.current);
  }, []);

  const activeNodeId = hoveredNodeId ?? highlightedSceneNodeId ?? selectedSceneNodeId ?? null;
  const connectedEdges = useMemo(
    () => activeNodeId ? connectedFactoryEdges(activeNodeId, scene.edges) : new Set<string>(),
    [activeNodeId, scene.edges],
  );
  const hasActiveRelation = connectedEdges.size > 0 || selectedEdgeId !== null;

  const triggerTrace = useCallback((edgeIds: Iterable<string>) => {
    const ids = new Set(edgeIds);
    if (ids.size === 0 || reducedMotion) return;
    if (traceTimerRef.current !== null) window.clearTimeout(traceTimerRef.current);
    const generation = traceGenerationRef.current + 1;
    traceGenerationRef.current = generation;
    setTrace({ generation, edgeIds: ids });
    traceTimerRef.current = window.setTimeout(() => {
      setTrace(previous => previous.generation === generation
        ? { generation, edgeIds: new Set() }
        : previous);
      traceTimerRef.current = null;
    }, TRACE_CLEAR_DELAY_MS);
  }, [reducedMotion]);

  useEffect(() => {
    const nodeId = highlightedSceneNodeId ?? selectedSceneNodeId;
    if (!nodeId) return;
    triggerTrace(connectedFactoryEdges(nodeId, scene.edges));
  }, [highlightedSceneNodeId, scene.edges, selectedSceneNodeId, triggerTrace]);

  const spatialCandidates = useMemo(() => {
    const overscan = 240 / viewport.zoom;
    const left = -viewport.x / viewport.zoom - overscan;
    const top = -viewport.y / viewport.zoom - overscan;
    return queryFactorySpatialIndex(spatialIndex, {
      left,
      top,
      right: left + containerSize.width / viewport.zoom + overscan * 2,
      bottom: top + containerSize.height / viewport.zoom + overscan * 2,
    });
  }, [containerSize.height, containerSize.width, spatialIndex, viewport]);

  const visibleNodes = useMemo(() => {
    if (renderAll) return scene.nodes;
    const candidates = scene.nodes.filter(node => {
      if (viewport.zoom < 0.45 && !isStructuralNode(node)) return false;
      return isStructuralNode(node) || (
        spatialCandidates.nodeIds.has(node.id)
        && intersectsViewport(node, viewport, containerSize.width, containerSize.height)
      );
    });
    if (candidates.length <= NODE_RENDER_LIMIT) return candidates;
    const structural = candidates.filter(isStructuralNode);
    const remaining = candidates.filter(node => !isStructuralNode(node)).slice(0, Math.max(0, NODE_RENDER_LIMIT - structural.length));
    return [...structural, ...remaining];
  }, [containerSize.height, containerSize.width, renderAll, scene.nodes, spatialCandidates.nodeIds, viewport]);

  const visibleEdges = useMemo(() => {
    if (renderAll) return scene.edges;
    return [...spatialCandidates.edgeIds]
      .map(edgeId => sceneEdgeById.get(edgeId))
      .filter((edge): edge is FactorySceneEdge => Boolean(edge))
      .filter(edge => edgeIntersectsViewport(edge, viewport, containerSize.width, containerSize.height))
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, EDGE_RENDER_LIMIT);
  }, [containerSize.height, containerSize.width, renderAll, scene.edges, sceneEdgeById, spatialCandidates.edgeIds, viewport]);

  const updateNodePosition = useCallback((nodeId: string, point: { x: number; y: number }) => {
    const next = { ...positionsRef.current, [nodeId]: point };
    positionsRef.current = next;
    setPositions(next);
    if (routeTimerRef.current === null) {
      routeTimerRef.current = window.setTimeout(() => {
        routeTimerRef.current = null;
        setRoutedPositions({ ...positionsRef.current });
      }, ROUTE_THROTTLE_MS);
    }
  }, []);

  const constrainedNodePosition = useCallback((nodeId: string, point: { x: number; y: number }) => {
    const node = scene.nodes.find(candidate => candidate.id === nodeId);
    if (!node) return point;
    const parent = node.parentId ? scene.nodes.find(candidate => candidate.id === node.parentId) : undefined;
    let candidate = { ...point };
    if (parent) {
      const padding = 12;
      candidate = {
        x: clamp(candidate.x, parent.absolutePosition.x + padding, parent.absolutePosition.x + parent.width - node.width - padding),
        y: clamp(candidate.y, parent.absolutePosition.y + padding, parent.absolutePosition.y + parent.height - node.height - padding),
      };
    }
    const overlapsPeer = scene.nodes.some(peer => {
      if (peer.id === node.id || !peer.draggable || peer.parentId !== node.parentId) return false;
      const gap = 8;
      return candidate.x < peer.absolutePosition.x + peer.width + gap
        && candidate.x + node.width + gap > peer.absolutePosition.x
        && candidate.y < peer.absolutePosition.y + peer.height + gap
        && candidate.y + node.height + gap > peer.absolutePosition.y;
    });
    return overlapsPeer ? node.absolutePosition : candidate;
  }, [scene.nodes]);

  const handleNodePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>, node: FactorySceneNode) => {
    if (!node.draggable || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      nodeId: node.id,
      origin: { ...node.absolutePosition },
      startClient: { x: event.clientX, y: event.clientY },
      moved: false,
    };
  }, []);

  const handleNodePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.startClient.x) / viewportRef.current.zoom;
    const dy = (event.clientY - drag.startClient.y) / viewportRef.current.zoom;
    drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 4;
    updateNodePosition(drag.nodeId, constrainedNodePosition(drag.nodeId, {
      x: Math.round((drag.origin.x + dx) / 8) * 8,
      y: Math.round((drag.origin.y + dy) / 8) * 8,
    }));
  }, [constrainedNodePosition, updateNodePosition]);

  const finishNodeDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>, node: FactorySceneNode) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setRoutedPositions({ ...positionsRef.current });
    onNodePositionsChange?.({ ...positionsRef.current });
    const edgeIds = scene.edges
      .filter(edge => edge.source === node.id || edge.target === node.id)
      .map(edge => edge.id);
    triggerTrace(edgeIds);
    if (!drag.moved) onNodeActivate?.(node);
  }, [onNodeActivate, onNodePositionsChange, scene.edges, triggerTrace]);

  const handlePanStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startViewport: viewportRef.current,
    };
  }, []);

  const handlePanMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    applyViewport({
      ...pan.startViewport,
      x: pan.startViewport.x + event.clientX - pan.startClient.x,
      y: pan.startViewport.y + event.clientY - pan.startClient.y,
    });
  }, [applyViewport]);

  const finishPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
  }, []);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const current = viewportRef.current;
    const factor = Math.exp(-event.deltaY * 0.0015);
    const zoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const sceneX = (localX - current.x) / current.zoom;
    const sceneY = (localY - current.y) / current.zoom;
    applyViewport({
      x: localX - sceneX * zoom,
      y: localY - sceneY * zoom,
      zoom,
    });
  }, [applyViewport]);

  const handleKeyboard = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === '0') {
      event.preventDefault();
      fit(true);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      applyViewport({ ...viewportRef.current, zoom: viewportRef.current.zoom * 1.15 }, true);
    } else if (event.key === '-') {
      event.preventDefault();
      applyViewport({ ...viewportRef.current, zoom: viewportRef.current.zoom / 1.15 }, true);
    }
  }, [applyViewport, fit]);

  const handleNodeKeyboard = useCallback((event: KeyboardEvent<HTMLDivElement>, node: FactorySceneNode) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onNodeActivate?.(node);
      return;
    }
    if (!['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(event.key)) return;
    const center = { x: node.absolutePosition.x + node.width / 2, y: node.absolutePosition.y + node.height / 2 };
    const candidates = visibleNodes
      .filter(candidate => candidate.id !== node.id && (candidate.kind === 'content' || candidate.kind === 'room'))
      .map(candidate => {
        const target = {
          x: candidate.absolutePosition.x + candidate.width / 2,
          y: candidate.absolutePosition.y + candidate.height / 2,
        };
        const dx = target.x - center.x;
        const dy = target.y - center.y;
        const eligible = event.key === 'ArrowUp' ? dy < 0
          : event.key === 'ArrowDown' ? dy > 0
            : event.key === 'ArrowLeft' ? dx < 0
              : dx > 0;
        const primary = event.key === 'ArrowUp' || event.key === 'ArrowDown' ? Math.abs(dy) : Math.abs(dx);
        const secondary = event.key === 'ArrowUp' || event.key === 'ArrowDown' ? Math.abs(dx) : Math.abs(dy);
        return { candidate, eligible, score: primary + secondary * 1.6 };
      })
      .filter(item => item.eligible)
      .sort((left, right) => left.score - right.score);
    const targetId = candidates[0]?.candidate.id;
    if (!targetId) return;
    event.preventDefault();
    const element = [...(containerRef.current?.querySelectorAll<HTMLElement>('[data-node-id]') ?? [])]
      .find(candidate => candidate.dataset.nodeId === targetId);
    element?.focus();
  }, [onNodeActivate, visibleNodes]);

  const minimapScale = Math.min(168 / Math.max(1, scene.bounds.width), 92 / Math.max(1, scene.bounds.height));
  const visibleWorld = {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: containerSize.width / viewport.zoom,
    height: containerSize.height / viewport.zoom,
  };

  return (
    <div
      ref={containerRef}
      className="factory-scene-canvas"
      data-layout-nodes={layout.nodes.length}
      data-layout-edges={layout.edges.length}
      data-scene-nodes={scene.nodes.length}
      data-scene-edges={scene.edges.length}
      data-render-mode={renderAll ? 'full-export' : 'virtualized'}
      data-scene-materialize-ms={sceneResult.durationMs.toFixed(3)}
      data-rendered-nodes={visibleNodes.length}
      data-rendered-edges={visibleEdges.length}
      tabIndex={0}
      role="region"
      aria-label={ariaLabel}
      onPointerDown={handlePanStart}
      onPointerMove={handlePanMove}
      onPointerUp={finishPan}
      onPointerCancel={finishPan}
      onWheel={handleWheel}
      onKeyDown={handleKeyboard}
    >
      <div className="factory-scene-canvas__grid" aria-hidden="true" />
      <div
        ref={sceneRef}
        className={`factory-scene-canvas__world${cameraAnimating ? ' is-camera-animating' : ''}${viewport.zoom < 0.45 ? ' is-cluster-zoom' : viewport.zoom < 0.8 ? ' is-summary-zoom' : ' is-detail-zoom'}`}
        data-scene-view={layout.view}
        style={{
          width: scene.bounds.width,
          height: scene.bounds.height,
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
        }}
      >
        <svg
          className="factory-scene-canvas__pipelines"
          width={scene.bounds.width}
          height={scene.bounds.height}
          viewBox={`${scene.bounds.x} ${scene.bounds.y} ${scene.bounds.width} ${scene.bounds.height}`}
          overflow="visible"
          aria-label={`${scene.edges.length} 条${relationAriaLabel}`}
        >
          <defs>
            {(['flow', 'dependency', 'governance', 'resource'] as const).map(kind => {
              const presentation = RELATION_SVG_PRESENTATION[kind];
              return (
                <marker
                  id={markerId(kind)}
                  key={kind}
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="5"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path
                    className={`factory-scene-marker factory-scene-marker--${kind}`}
                    d="M 0 0 L 10 5 L 0 10 Z"
                    fill={presentation.stroke}
                    stroke="none"
                  />
                </marker>
              );
            })}
          </defs>
          {visibleEdges.map(edge => {
            const connected = connectedEdges.has(edge.id) || selectedEdgeId === edge.id;
            const dimmed = hasActiveRelation && !connected;
            const presentation = RELATION_SVG_PRESENTATION[edge.kind];
            const label = relationLabel(edge);
            const sourceNode = sceneNodeById.get(edge.source);
            const targetNode = sceneNodeById.get(edge.target);
            const sourceLabel = sourceNode ? getNodeLabel?.(sourceNode) ?? '来源节点' : '来源节点';
            const targetLabel = targetNode ? getNodeLabel?.(targetNode) ?? '目标节点' : '目标节点';
            const activateEdge = () => {
              setSelectedEdgeId(edge.id);
              triggerTrace([edge.id]);
              onEdgeActivate?.(edge);
            };
            return (
              <g
                key={edge.id}
                className={`factory-scene-edge factory-scene-edge--${edge.kind}${connected ? ' is-connected' : ''}${dimmed ? ' is-dimmed' : ''}`}
                data-edge-id={edge.id}
              >
                <path
                  className="factory-scene-edge__line"
                  d={edge.path}
                  markerEnd={`url(#${markerId(edge.kind)})`}
                  fill="none"
                  stroke={presentation.stroke}
                  strokeWidth={presentation.strokeWidth}
                  strokeDasharray={presentation.strokeDasharray}
                  strokeLinecap="square"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  className="factory-scene-edge__hit"
                  d={edge.path}
                  fill="none"
                  stroke="var(--factory-ink)"
                  strokeOpacity="0.001"
                  strokeWidth="18"
                  pointerEvents="stroke"
                  data-has-area={(
                    Math.max(...edge.waypoints.map(point => point.x)) > Math.min(...edge.waypoints.map(point => point.x))
                    && Math.max(...edge.waypoints.map(point => point.y)) > Math.min(...edge.waypoints.map(point => point.y))
                  ) ? 'true' : 'false'}
                  tabIndex={0}
                  role="button"
                  aria-label={`${label}：从“${sourceLabel}”到“${targetLabel}”`}
                  onMouseEnter={() => {
                    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
                    setSelectedEdgeId(edge.id);
                    triggerTrace([edge.id]);
                  }}
                  onMouseLeave={() => {
                    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
                      setSelectedEdgeId(previous => previous === edge.id ? null : previous);
                    }
                  }}
                  onFocus={() => {
                    setSelectedEdgeId(edge.id);
                    triggerTrace([edge.id]);
                  }}
                  onBlur={() => setSelectedEdgeId(previous => previous === edge.id ? null : previous)}
                  onPointerUp={event => {
                    if (event.button === 0) activateEdge();
                  }}
                  onClick={event => {
                    if (event.detail === 0) activateEdge();
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      activateEdge();
                    }
                  }}
                />
                {edge.label ? (
                  <g className="factory-scene-edge__label" transform={`translate(${edge.labelPoint.x} ${edge.labelPoint.y})`}>
                    <rect
                      x="-34"
                      y="-10"
                      width="68"
                      height="20"
                      rx="3"
                      fill="color-mix(in srgb, var(--factory-surface) 94%, transparent)"
                      stroke="var(--factory-border)"
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="var(--factory-muted)"
                      fontFamily="var(--factory-font-mono)"
                      fontSize="10"
                      fontWeight="var(--factory-weight-semibold)"
                    >
                      {edge.label}
                    </text>
                  </g>
                ) : null}
                {!renderAll && !reducedMotion && trace.edgeIds.has(edge.id) ? (
                  <circle
                    key={`${trace.generation}:${edge.id}`}
                    className="factory-scene-edge__tracer"
                    r="4"
                    fill="var(--factory-surface-raised)"
                    stroke="var(--factory-green)"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  >
                    <animateMotion dur="260ms" repeatCount="1" fill="freeze" path={edge.path} />
                  </circle>
                ) : null}
              </g>
            );
          })}
        </svg>

        <div className="factory-scene-canvas__nodes">
          {visibleNodes.map(node => {
            const selected = selectedSceneNodeId === node.id || highlightedSceneNodeId === node.id;
            const nodeEdges = connectedFactoryEdges(node.id, scene.edges);
            const connected = activeNodeId === node.id || [...nodeEdges].some(edgeId => connectedEdges.has(edgeId));
            const dimmed = hasActiveRelation && !connected && !isStructuralNode(node);
            const keyboardReachable = node.kind === 'content' || node.kind === 'room';
            return (
              <div
                key={node.id}
                className={`factory-scene-node factory-scene-node--${node.kind}${node.draggable ? ' is-draggable' : ''}${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`}
                data-node-id={node.id}
                data-node-kind={node.kind}
                style={{
                  width: node.width,
                  height: node.height,
                  transform: `translate3d(${node.absolutePosition.x}px, ${node.absolutePosition.y}px, 0)`,
                  zIndex: node.kind === 'floor' || node.kind === 'group' ? 0 : node.kind === 'lane' ? 1 : node.kind === 'room' || node.kind === 'content' ? 3 : 2,
                }}
                tabIndex={keyboardReachable ? 0 : undefined}
                aria-label={keyboardReachable ? getNodeLabel?.(node) ?? '画布节点' : undefined}
                onPointerDown={event => handleNodePointerDown(event, node)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={event => finishNodeDrag(event, node)}
                onPointerCancel={event => finishNodeDrag(event, node)}
                onPointerEnter={event => {
                  if (event.pointerType !== 'mouse') return;
                  setHoveredNodeId(node.id);
                  triggerTrace(nodeEdges);
                }}
                onPointerLeave={event => {
                  if (event.pointerType === 'mouse') setHoveredNodeId(previous => previous === node.id ? null : previous);
                }}
                onFocus={() => {
                  setHoveredNodeId(node.id);
                  triggerTrace(nodeEdges);
                }}
                onBlur={() => setHoveredNodeId(previous => previous === node.id ? null : previous)}
                onDoubleClick={() => onNodeActivate?.(node)}
                onKeyDown={event => handleNodeKeyboard(event, node)}
              >
                {renderNode(node)}
              </div>
            );
          })}
        </div>
      </div>

      <nav className="factory-scene-controls" aria-label="画布缩放">
        <button type="button" onClick={() => applyViewport({ ...viewportRef.current, zoom: viewportRef.current.zoom / 1.15 }, true)} aria-label="缩小画布"><Minus aria-hidden="true" /></button>
        <button type="button" onClick={() => fit(true)} aria-label={fitControlLabel}><Scan aria-hidden="true" /></button>
        <button type="button" onClick={() => applyViewport({ ...viewportRef.current, zoom: viewportRef.current.zoom * 1.15 }, true)} aria-label="放大画布"><Plus aria-hidden="true" /></button>
      </nav>

      <div className="factory-scene-minimap" aria-hidden="true">
        <svg width="184" height="108" viewBox="0 0 184 108">
          <g transform={`translate(8 8) scale(${minimapScale})`}>
            {scene.nodes.filter(node => node.kind === 'room' || node.kind === 'content').slice(0, 350).map(node => (
              <rect key={node.id} x={node.absolutePosition.x} y={node.absolutePosition.y} width={node.width} height={node.height} rx="2" />
            ))}
            <rect
              className="factory-scene-minimap__viewport"
              x={visibleWorld.x}
              y={visibleWorld.y}
              width={visibleWorld.width}
              height={visibleWorld.height}
            />
          </g>
        </svg>
      </div>
    </div>
  );
});
