'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Background,
  BackgroundVariant,
  Controls,
  getViewportForBounds,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import {
  ArrowLeft,
  Download,
  FileText,
  Home,
  ImageDown,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
} from 'lucide-react';
import type {
  CanvasState,
  CanvasView,
  DocCanvas as DocCanvasType,
  DocEdge,
  DocNode,
} from '@/lib/parser/types';
import type { WritePolicy } from '@/lib/server/write-guard';
import { formatDisplayDate, formatDisplayInteger } from '@/lib/shared/display-format';
import {
  buildArchitectureViewModel,
  type ArchitectureRegion,
  type ArchitectureViewModel,
} from '@/lib/canvas/architecture-view-model';
import {
  computeArchitectureLayout,
  type ArchitectureLayoutNode,
} from '@/lib/canvas/layout-engine';
import {
  createCanvasState,
  getCanvasStateLocalStorageKey,
  getLegacyCanvasStateLocalStorageKey,
  resetCanvasState,
  restoreCanvasState,
} from '@/lib/canvas/canvas-state';
import {
  removeDocNodeFromView,
  updateDocNodeAfterSave,
} from '@/lib/canvas/doc-node-state';
import { isPngPaintSurfaceReady, selectPngPixelRatio } from '@/lib/canvas/png-export';
import {
  ArchitectureCapNode,
  ArchitectureFloorNode,
  ArchitectureLaneNode,
  ArchitectureResourceNode,
  ArchitectureRoomGroupNode,
  type ArchitectureCapData,
  type ArchitectureFloorData,
  type ArchitectureRoomPreview,
} from './ArchitectureNodes';
import { MobileArchitectureView, type MobileArchitectureFloor } from './MobileArchitectureView';
import { CardNode } from './CardNode';
import { NodeDetailSheet } from './NodeDetailSheet';
import { SaveIndicator } from './SaveIndicator';
import { SearchPanel } from './SearchPanel';

const nodeTypes = {
  architectureCap: ArchitectureCapNode,
  architectureFloor: ArchitectureFloorNode,
  architectureLane: ArchitectureLaneNode,
  architectureResource: ArchitectureResourceNode,
  architectureRoomGroup: ArchitectureRoomGroupNode,
  cardNode: CardNode,
};

interface Props {
  document: DocCanvasType;
  writePolicy: WritePolicy;
}

type FileBackedDocument = DocCanvasType & {
  _file?: { mtime: string; path: string; bytes: number };
};

const NODE_COLORS: Record<DocNode['type'], string> = {
  document: '#355C45',
  section: '#4F5F9B',
  subsection: '#667568',
  track: '#147D78',
  step: '#2D6B47',
  tool: '#637064',
  prompt: '#4F5F9B',
  principle: '#A4493D',
};

function metadataString(node: DocNode, key: string): string | undefined {
  const value = node.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

async function responseMessage(resp: Response): Promise<string> {
  try {
    const data = await resp.json();
    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.message === 'string') return data.message;
    return JSON.stringify(data);
  } catch {
    return resp.text();
  }
}

function roomPreview(region: ArchitectureRegion): ArchitectureRoomPreview {
  const count = (track: 'vibe' | 'shared' | 'pro') =>
    region.trackSummaries.find(summary => summary.track === track)?.count ?? 0;
  return {
    id: region.id,
    eyebrow: region.stageNumber === undefined
      ? `MODULE ${String(region.order).padStart(2, '0')}`
      : `STAGE ${String(region.stageNumber).padStart(2, '0')}`,
    title: region.title,
    summary: region.summary,
    stageNumber: region.stageNumber,
    counts: {
      vibe: count('vibe'),
      shared: count('shared'),
      pro: count('pro'),
      resources: region.resources.count,
    },
  };
}

function docNodeData(node: DocNode) {
  const trackColor = node.track === 'vibe'
    ? '#147D78'
    : node.track === 'pro'
      ? '#9A5B12'
      : node.track === 'both'
        ? '#4F5F9B'
        : NODE_COLORS[node.type];
  return {
    docNodeId: node.id,
    title: node.title,
    summary: node.summary,
    type: node.type,
    level: node.level,
    track: node.track,
    stageNumber: node.stageNumber,
    toolReferences: node.toolReferences,
    promptTemplates: node.promptTemplates,
    contentBlocksCount: node.contentBlocks?.length || 0,
    color: trackColor,
  };
}

function filterFocusedTracks(
  model: ArchitectureViewModel,
  view: CanvasView,
  expandedTracks: Set<string>,
): ArchitectureViewModel {
  if (view.kind !== 'focused-region') return model;
  const region = model.regions.find(candidate => candidate.id === view.regionId);
  if (!region || region.stageNumber === undefined || region.stageNumber < 1) return model;
  const filteredRegion: ArchitectureRegion = {
    ...region,
    trackSummaries: region.trackSummaries.map(summary => {
      if (summary.track === 'shared') return summary;
      const key = `stage${region.stageNumber}-${summary.track}`;
      return expandedTracks.has(key)
        ? summary
        : { ...summary, nodeIds: [], previewNodeIds: [], count: 0 };
    }),
  };
  return {
    ...model,
    regions: model.regions.map(candidate => candidate.id === filteredRegion.id ? filteredRegion : candidate),
  };
}

function sameCanvasView(left: CanvasView, right: CanvasView): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === 'overview' || left.regionId === (right as { regionId: string }).regionId;
}

function defaultExpandedTracks(): Set<string> {
  const tracks = new Set<string>();
  for (let stage = 1; stage <= 8; stage++) {
    tracks.add(`stage${stage}-vibe`);
    tracks.add(`stage${stage}-pro`);
  }
  return tracks;
}

export default function CanvasViewer({ document, writePolicy }: Props) {
  const [docNodes, setDocNodes] = useState<DocNode[]>(() => document.nodes);
  const [docEdges, setDocEdges] = useState<DocEdge[]>(() => document.edges);
  const [canvasView, setCanvasView] = useState<CanvasView>({ kind: 'overview' });
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState('');
  const [saveError, setSaveError] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const [layoutProfile, setLayoutProfile] = useState<'desktop' | 'tablet'>('desktop');
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [exportingPanorama, setExportingPanorama] = useState(false);
  const [restoredState, setRestoredState] = useState<CanvasState | null>(null);
  const [searchRequest, setSearchRequest] = useState(0);
  const { fitView, getNodesBounds, getViewport, setViewport } = useReactFlow();
  const autoFitRef = useRef(true);
  const restoredViewportRef = useRef(false);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const restoreGenerationRef = useRef(0);
  const exportInFlightRef = useRef(false);

  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(defaultExpandedTracks);

  const architectureModel = useMemo(() => buildArchitectureViewModel({
    id: document.id,
    title: document.title,
    version: document.version,
    nodes: docNodes,
    edges: docEdges,
  }), [document.id, document.title, document.version, docEdges, docNodes]);
  const layoutModel = useMemo(
    () => filterFocusedTracks(architectureModel, canvasView, expandedTracks),
    [architectureModel, canvasView, expandedTracks],
  );
  const layout = useMemo(
    () => computeArchitectureLayout(layoutModel, {
      view: canvasView,
      profile: exportingPanorama ? 'desktop' : layoutProfile,
    }),
    [canvasView, exportingPanorama, layoutModel, layoutProfile],
  );
  const regionById = useMemo(
    () => new Map(architectureModel.regions.map(region => [region.id, region])),
    [architectureModel.regions],
  );
  const nodeById = useMemo(() => new Map(docNodes.map(node => [node.id, node])), [docNodes]);
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const focusedRegion = canvasView.kind === 'focused-region'
    ? regionById.get(canvasView.regionId)
    : undefined;
  const identity = useMemo(() => ({
    documentId: document.id,
    graphFingerprint: architectureModel.graphFingerprint,
  }), [architectureModel.graphFingerprint, document.id]);

  const openRegion = useCallback((regionId: string) => {
    if (exportInFlightRef.current) return;
    const region = regionById.get(regionId);
    if (!region || region.kind === 'roof') return;
    restoreGenerationRef.current += 1;
    setCanvasView({ kind: 'focused-region', regionId });
    setActiveStage(region.stageNumber ?? null);
    setDetailOpen(false);
    autoFitRef.current = true;
    restoredViewportRef.current = true;
  }, [regionById]);

  const returnToOverview = useCallback(() => {
    if (exportInFlightRef.current) return;
    restoreGenerationRef.current += 1;
    setCanvasView({ kind: 'overview' });
    setActiveStage(null);
    setDetailOpen(false);
    autoFitRef.current = true;
    restoredViewportRef.current = true;
  }, []);

  const projectedNodes = useMemo<Node[]>(() => {
    return layout.nodes.map((layoutNode: ArchitectureLayoutNode): Node => {
      const base = {
        id: layoutNode.id,
        position: layoutNode.position,
        draggable: layoutNode.draggable,
        selectable: layoutNode.kind === 'content',
        zIndex: layoutNode.kind === 'group' ? 0 : layoutNode.kind === 'lane' ? 1 : 2,
        style: { width: layoutNode.width, height: layoutNode.height },
        ...(layoutNode.parentId ? { parentId: layoutNode.parentId, extent: 'parent' as const } : {}),
      };

      if (layoutNode.kind === 'floor') {
        const floor = architectureModel.floors.find(candidate => candidate.id === layoutNode.id);
        const rooms = (layoutNode.regionIds ?? [])
          .map(regionId => regionById.get(regionId))
          .filter((region): region is ArchitectureRegion => Boolean(region))
          .map(roomPreview);
        const data: ArchitectureFloorData = {
          floorLabel: floor?.label ?? 'ARCHITECTURE FLOOR',
          title: architectureModel.mode === 'lifecycle' ? '产品生命周期层' : '产品能力模块层',
          rooms,
          mode: architectureModel.mode,
          onOpenRoom: openRegion,
        };
        return { ...base, type: 'architectureFloor', data: data as unknown as Record<string, unknown> };
      }

      if (layoutNode.kind === 'roof' || layoutNode.kind === 'foyer' || layoutNode.kind === 'foundation' || layoutNode.kind === 'annex') {
        const region = layoutNode.regionId ? regionById.get(layoutNode.regionId) : undefined;
        const chips = region
          ? region.previewNodeIds.map(nodeId => nodeById.get(nodeId)?.title).filter((title): title is string => Boolean(title))
          : [];
        const rootSummary = architectureModel.rootNodeId
          ? nodeById.get(architectureModel.rootNodeId)?.summary ?? ''
          : '';
        const kind = layoutNode.kind;
        const data: ArchitectureCapData = {
          kind,
          eyebrow: kind === 'roof'
            ? 'PRODUCT FACTORY / ARCHITECTURE'
            : kind === 'foyer'
              ? 'ENTRY / STAGE 00'
              : kind === 'foundation'
                ? 'FOUNDATION / GOVERNANCE'
                : 'ANNEX / REFERENCES',
          title: region?.title ?? (kind === 'foundation' ? '共享基础与治理' : '附属模块'),
          summary: kind === 'roof' ? rootSummary || document.version : region?.summary ?? '',
          chips,
          roomId: region && kind !== 'roof' ? region.id : undefined,
          onOpenRoom: openRegion,
        };
        return { ...base, type: 'architectureCap', data: data as unknown as Record<string, unknown> };
      }

      if (layoutNode.kind === 'group') {
        const region = layoutNode.regionId ? regionById.get(layoutNode.regionId) : undefined;
        return {
          ...base,
          type: 'architectureRoomGroup',
          data: {
            eyebrow: region ? roomPreview(region).eyebrow : 'FOCUSED ROOM',
            title: region?.title ?? '聚焦房间',
            summary: region?.summary ?? '',
            resourceCount: region?.resources.count ?? 0,
          },
        };
      }

      if (layoutNode.kind === 'lane') {
        const region = layoutNode.regionId ? regionById.get(layoutNode.regionId) : undefined;
        const summary = region?.trackSummaries.find(candidate => candidate.track === layoutNode.track);
        return {
          ...base,
          type: 'architectureLane',
          data: {
            track: layoutNode.track ?? 'shared',
            title: layoutNode.track === 'vibe' ? '快速产品路径' : layoutNode.track === 'pro' ? '工程化路径' : '共享核心',
            count: summary?.count ?? 0,
          },
        };
      }

      if (layoutNode.kind === 'resource') {
        const region = layoutNode.regionId ? regionById.get(layoutNode.regionId) : undefined;
        return {
          ...base,
          type: 'architectureResource',
          data: {
            title: '工具、Prompt 与引用',
            count: region?.resources.count ?? 0,
            previews: region?.resources.previews.map(preview => preview.title) ?? [],
          },
        };
      }

      const docNode = layoutNode.nodeId ? nodeById.get(layoutNode.nodeId) : undefined;
      if (!docNode) {
        return { ...base, type: 'architectureResource', data: { title: '内容不可用', count: 0, previews: [] } };
      }
      return { ...base, type: 'cardNode', data: docNodeData(docNode) };
    });
  }, [architectureModel, document.version, layout.nodes, nodeById, openRegion, regionById]);

  const projectedEdges = useMemo<Edge[]>(() => layout.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: 'top-out',
    targetHandle: 'bottom-in',
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#355C45', strokeWidth: 2, opacity: 0.66 },
  })), [layout.edges]);

  useEffect(() => {
    const matchingRestoredState = restoredState
      ? restoreCanvasState(restoredState, identity)
      : null;
    const positions = matchingRestoredState && sameCanvasView(matchingRestoredState.view, canvasView)
      ? matchingRestoredState.nodePositions
      : {};
    setNodes(projectedNodes.map(node => ({
      ...node,
      position: node.draggable && positions[node.id] ? positions[node.id] : node.position,
    })));
    setEdges(projectedEdges);

    const timeout = window.setTimeout(() => {
      if (
        matchingRestoredState?.lastSaved
        && !restoredViewportRef.current
        && sameCanvasView(matchingRestoredState.view, canvasView)
      ) {
        restoredViewportRef.current = true;
        setViewport(matchingRestoredState.viewport);
        return;
      }
      if (autoFitRef.current) fitView({ padding: canvasView.kind === 'overview' ? 0.08 : 0.12, duration: 420 });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [canvasView, fitView, identity, projectedEdges, projectedNodes, restoredState, setEdges, setNodes, setViewport]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    const updateProfile = () => {
      const width = window.innerWidth;
      setLayoutProfile(width >= 768 && width <= 1100 ? 'tablet' : 'desktop');
      setIsMobileViewport(width < 768);
    };
    updateProfile();
    window.addEventListener('resize', updateProfile);
    return () => window.removeEventListener('resize', updateProfile);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const generation = ++restoreGenerationRef.current;
    restoredViewportRef.current = false;
    setRestoredState(null);
    const restore = async () => {
      let state: CanvasState | null = null;
      try {
        const raw = localStorage.getItem(getCanvasStateLocalStorageKey(document.id));
        state = raw ? restoreCanvasState(JSON.parse(raw), identity) : null;
      } catch {
        state = null;
      }
      if (!state) {
        try {
          const response = await fetch(`/api/canvas-state?documentId=${document.id}`);
          if (response.ok) state = restoreCanvasState(await response.json(), identity);
        } catch {
          state = null;
        }
      }
      // A save can occur while the server GET is in flight. Re-read local v2
      // state before applying the response so the newest browser action wins.
      try {
        const freshRaw = localStorage.getItem(getCanvasStateLocalStorageKey(document.id));
        const freshLocal = freshRaw ? restoreCanvasState(JSON.parse(freshRaw), identity) : null;
        if (freshLocal) state = freshLocal;
      } catch {}
      try { localStorage.removeItem(getLegacyCanvasStateLocalStorageKey(document.id)); } catch {}
      if (cancelled || generation !== restoreGenerationRef.current || !state) return;
      if (state.view.kind === 'focused-region' && !regionById.has(state.view.regionId)) return;
      setRestoredState(state);
      if (state.expandedNodes.includes('tracks:v2')) {
        setExpandedTracks(new Set(state.expandedNodes.filter(value => /^stage[1-8]-(?:vibe|pro)$/.test(value))));
      }
      setCanvasView(state.view);
      setActiveStage(state.view.kind === 'focused-region' ? regionById.get(state.view.regionId)?.stageNumber ?? null : null);
      setLastSavedTime(state.lastSaved ?? '');
    };
    restore();
    return () => { cancelled = true; };
  }, [document.id, identity, regionById]);

  useEffect(() => {
    setDocNodes(document.nodes);
    setDocEdges(document.edges);
    setSelectedNodeId(null);
    setDetailOpen(false);
  }, [document.edges, document.id, document.nodes]);

  const saveCanvasState = useCallback(async () => {
    restoreGenerationRef.current += 1;
    const now = new Date().toISOString();
    const state = createCanvasState(identity, {
      view: canvasView,
      viewport: getViewport(),
      expandedNodes: ['tracks:v2', ...[...expandedTracks].sort()],
      nodePositions: canvasView.kind === 'focused-region'
        ? Object.fromEntries(nodes.filter(node => node.draggable).map(node => [node.id, node.position]))
        : {},
      lastSaved: now,
    });
    setRestoredState(state);
    try {
      localStorage.setItem(getCanvasStateLocalStorageKey(document.id), JSON.stringify(state));
      localStorage.removeItem(getLegacyCanvasStateLocalStorageKey(document.id));
    } catch {}

    if (!writePolicy.writable) {
      setSaveStatus('saved');
      setLastSavedTime(now);
      setSaveError('');
      return;
    }

    setSaveStatus('saving');
    let success = false;
    for (let attempt = 0; attempt < 3 && !success; attempt++) {
      try {
        const token = sessionStorage.getItem('doccanvas-admin-token') || '';
        const response = await fetch('/api/canvas-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'X-DocCanvas-Token': token } : {}) },
          body: JSON.stringify(state),
        });
        if (!response.ok) throw new Error(await response.text());
        success = true;
      } catch (error) {
        if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 500 * (attempt + 1)));
        if (attempt === 2) setSaveError(error instanceof Error ? error.message : '保存失败。');
      }
    }
    if (success) {
      setSaveStatus('saved');
      setLastSavedTime(now);
      setSaveError('');
    } else {
      setSaveStatus('error');
      setSaveError('无法保存到服务器。状态已保存在浏览器本地。');
    }
  }, [canvasView, document.id, expandedTracks, getViewport, identity, nodes, writePolicy.writable]);

  const resetAutoLayout = useCallback(async () => {
    restoreGenerationRef.current += 1;
    const reset = resetCanvasState(identity);
    try {
      localStorage.setItem(getCanvasStateLocalStorageKey(document.id), JSON.stringify(reset));
      localStorage.removeItem(getLegacyCanvasStateLocalStorageKey(document.id));
    } catch {}
    setRestoredState(null);
    restoredViewportRef.current = true;
    autoFitRef.current = true;
    setCanvasView({ kind: 'overview' });
    setActiveStage(null);
    setExpandedTracks(defaultExpandedTracks());
    if (writePolicy.writable) {
      try {
        const token = sessionStorage.getItem('doccanvas-admin-token') || '';
        const response = await fetch('/api/canvas-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'X-DocCanvas-Token': token } : {}) },
          body: JSON.stringify(reset),
        });
        if (!response.ok) throw new Error(await response.text());
      } catch {
        setSaveStatus('error');
        setSaveError('自动布局已在本地重置，但服务器状态未更新。');
      }
    }
  }, [document.id, identity, writePolicy.writable]);

  const fitCanvas = useCallback(() => {
    autoFitRef.current = true;
    fitView({ padding: canvasView.kind === 'overview' ? 0.08 : 0.12, duration: 360 });
  }, [canvasView.kind, fitView]);

  const fitCanvasFromUser = useCallback(() => {
    restoreGenerationRef.current += 1;
    fitCanvas();
  }, [fitCanvas]);

  const exportMarkdown = useCallback(() => {
    window.location.href = `/api/export/markdown?documentId=${document.id}`;
  }, [document.id]);

  const exportPng = useCallback(async () => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    restoreGenerationRef.current += 1;
    setExportStatus('正在导出暖白全景 PNG...');
    const originalView = canvasView;
    const expectedLayout = computeArchitectureLayout(architectureModel, {
      view: { kind: 'overview' },
      profile: 'desktop',
    });
    try {
      setExportingPanorama(true);
      if (originalView.kind === 'focused-region') {
        setCanvasView({ kind: 'overview' });
      }
      const viewportElement = window.document.querySelector('.desktop-architecture-canvas .react-flow__viewport') as HTMLElement | null;
      if (!viewportElement) throw new Error('未找到桌面全景视图。');
      const desktopCanvas = viewportElement.closest<HTMLElement>('.desktop-architecture-canvas');
      if (!desktopCanvas) throw new Error('未找到桌面全景容器。');
      const paintSurfaceReady = () => {
        const sampleNode = viewportElement.querySelector<HTMLElement>('.react-flow__node[data-id]');
        if (!sampleNode) return false;
        const canvasRect = desktopCanvas.getBoundingClientRect();
        const viewportRect = viewportElement.getBoundingClientRect();
        const nodeRect = sampleNode.getBoundingClientRect();
        return isPngPaintSurfaceReady({
          shellExporting: canvasShellRef.current?.classList.contains('is-exporting-panorama') === true,
          canvasDisplay: window.getComputedStyle(desktopCanvas).display,
          canvasVisibility: window.getComputedStyle(desktopCanvas).visibility,
          viewportVisibility: window.getComputedStyle(viewportElement).visibility,
          nodeVisibility: window.getComputedStyle(sampleNode).visibility,
          canvasWidth: canvasRect.width,
          canvasHeight: canvasRect.height,
          viewportWidth: viewportRect.width,
          viewportHeight: viewportRect.height,
          nodeWidth: nodeRect.width,
          nodeHeight: nodeRect.height,
        });
      };
      const waitForPaintTick = () => new Promise<void>(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          resolve();
        };
        const timeout = window.setTimeout(finish, 50);
        window.requestAnimationFrame(finish);
      });
      let projectionReady = false;
      const projectionDeadline = window.performance.now() + 3_000;
      const projectionMatches = () => {
        const currentById = new Map(nodesRef.current.map(node => [node.id, node]));
        const modelMatches = nodesRef.current.length === expectedLayout.nodes.length
          && expectedLayout.nodes.every(expected => {
            const current = currentById.get(expected.id);
            return current
              && current.position.x === expected.position.x
              && current.position.y === expected.position.y
              && current.style?.width === expected.width
              && current.style?.height === expected.height;
          });
        if (!modelMatches) return false;
        const domIds = new Set(Array.from(
          viewportElement.querySelectorAll<HTMLElement>('.react-flow__node[data-id]'),
        ).map(element => element.dataset.id));
        const domEdgeIds = new Set(Array.from(
          viewportElement.querySelectorAll<HTMLElement>('.react-flow__edge[data-id]'),
        ).map(element => element.dataset.id));
        return domIds.size === expectedLayout.nodes.length
          && domEdgeIds.size === expectedLayout.edges.length
          && expectedLayout.nodes.every(node => domIds.has(node.id))
          && expectedLayout.edges.every(edge => domEdgeIds.has(edge.id))
          && paintSurfaceReady();
      };
      for (let attempt = 0; attempt < 120 && window.performance.now() < projectionDeadline; attempt++) {
        await waitForPaintTick();
        if (projectionMatches()) {
          await waitForPaintTick();
          if (projectionMatches()) {
            projectionReady = true;
            break;
          }
        }
      }
      if (!projectionReady) throw new Error('建筑全景投影未在时限内稳定。');
      const visibleNodes = nodesRef.current.filter(node => !node.hidden);
      if (visibleNodes.length === 0) throw new Error('当前没有可导出的节点。');
      const bounds = getNodesBounds(visibleNodes);
      const imageWidth = Math.ceil(bounds.width + 240);
      const imageHeight = Math.ceil(bounds.height + 240);
      const pixelRatio = selectPngPixelRatio(imageWidth, imageHeight);
      if (pixelRatio === null) throw new Error('建筑全景尺寸超过安全导出预算。');
      const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.1, 2, 0.08);
      const dataUrl = await toPng(viewportElement, {
        backgroundColor: '#F8FBF0',
        width: imageWidth,
        height: imageHeight,
        pixelRatio,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          visibility: 'visible',
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      });
      const link = window.document.createElement('a');
      link.download = `${document.id}-architecture.png`;
      link.href = dataUrl;
      link.click();
      setExportStatus('PNG 已导出。');
      window.setTimeout(() => setExportStatus(''), 2200);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'PNG 导出未完成。');
    } finally {
      exportInFlightRef.current = false;
      setExportingPanorama(false);
      if (originalView.kind === 'focused-region') {
        setCanvasView(originalView);
      }
      autoFitRef.current = true;
    }
  }, [architectureModel, canvasView, document.id]);

  const openDocNode = useCallback((nodeId: string) => {
    const node = nodeById.get(nodeId);
    if (!node) return;
    setSelectedNodeId(nodeId);
    setDetailOpen(true);
  }, [nodeById]);

  const navigateToNode = useCallback((nodeId: string) => {
    const regionId = architectureModel.nodeRegionId[nodeId];
    if (regionId) openRegion(regionId);
    openDocNode(nodeId);
  }, [architectureModel.nodeRegionId, openDocNode, openRegion]);

  const stageRegions = useMemo(() => architectureModel.regions
    .filter(region => region.stageNumber !== undefined)
    .sort((left, right) => (left.stageNumber ?? 0) - (right.stageNumber ?? 0)), [architectureModel.regions]);
  const fileMetadata = (document as FileBackedDocument)._file;

  const mobileFloors = useMemo<MobileArchitectureFloor[]>(() => {
    const floors = architectureModel.floors.map(floor => ({
      id: floor.id,
      label: floor.label,
      title: architectureModel.mode === 'lifecycle' ? '生命周期层' : '能力模块层',
      rooms: floor.regionIds
        .map(regionId => regionById.get(regionId))
        .filter((region): region is ArchitectureRegion => Boolean(region))
        .map(roomPreview),
    }));
    const baseRegions = architectureModel.regions.filter(region =>
      region.kind === 'foyer' || region.kind === 'foundation' || region.kind === 'annex',
    );
    return baseRegions.length === 0 ? floors : [{
      id: 'mobile:foundation',
      label: 'GROUND / FOUNDATION',
      title: '入口、基础与附属',
      rooms: baseRegions.map(roomPreview),
    }, ...floors];
  }, [architectureModel.floors, architectureModel.mode, architectureModel.regions, regionById]);

  const mobileFocused = focusedRegion ? {
    room: roomPreview(focusedRegion),
    nodesByTrack: Object.fromEntries((['vibe', 'shared', 'pro'] as const).map(track => {
      const nodeIds = focusedRegion.trackSummaries.find(summary => summary.track === track)?.nodeIds ?? [];
      return [track, nodeIds.map(nodeId => nodeById.get(nodeId)).filter((node): node is DocNode => Boolean(node))];
    })) as Record<'vibe' | 'shared' | 'pro', DocNode[]>,
    resourceCount: focusedRegion.resources.count,
  } : undefined;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (exportInFlightRef.current) return;
      if (event.key === 'Escape' && detailOpen) { setDetailOpen(false); return; }
      if (event.key === 'Escape' && canvasView.kind === 'focused-region') { returnToOverview(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        if (!detailOpen) { event.preventDefault(); saveCanvasState(); }
        return;
      }
      if ((event.key === 'f' || event.key === '0') && !event.metaKey && !event.ctrlKey) fitCanvasFromUser();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canvasView.kind, detailOpen, fitCanvasFromUser, returnToOverview, saveCanvasState]);

  useEffect(() => {
    const element = canvasShellRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (autoFitRef.current) window.setTimeout(() => fitCanvas(), 80);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitCanvas]);

  return (
    <>
      <div
        ref={canvasShellRef}
        inert={exportingPanorama}
        className={`architecture-canvas-shell ${canvasView.kind === 'focused-region' ? 'is-focused-region' : ''} ${exportingPanorama ? 'is-exporting-panorama' : ''}`}
      >
      <header className="architecture-desktop-header">
        <div className="architecture-desktop-header__identity">
          <FileText aria-hidden="true" />
          <span>
            <strong>{document.title}</strong>
            <small>
              {architectureModel.mode === 'lifecycle' ? '生命周期建筑' : '模块建筑'} · {architectureModel.regions.filter(region => region.kind === 'room').length} 个房间 · {docNodes.length} 个源节点
              {fileMetadata ? ` · ${formatDisplayDate(fileMetadata.mtime)} · ${formatDisplayInteger(fileMetadata.bytes)} 字符` : ''}
            </small>
          </span>
          {exportStatus && <em className="architecture-export-status"><ShieldAlert aria-hidden="true" />{exportStatus}</em>}
        </div>

        {stageRegions.length > 0 && (
          <nav className="architecture-stage-nav" aria-label="阶段导航">
            {stageRegions.map(region => (
              <button
                type="button"
                key={region.id}
                onClick={() => openRegion(region.id)}
                className={activeStage === region.stageNumber ? 'is-active' : ''}
                aria-label={`进入阶段 ${region.stageNumber}`}
              >
                {region.stageNumber}
              </button>
            ))}
          </nav>
        )}

        <nav className="architecture-toolbar" aria-label="画布工具栏">
          <Link href="/" aria-label="返回工作台" title="返回工作台"><Home aria-hidden="true" />工作台</Link>
          {canvasView.kind === 'focused-region' && (
            <button type="button" title="返回全景" onClick={returnToOverview}><ArrowLeft aria-hidden="true" />全景</button>
          )}
          {activeStage && (
            <>
              {(['vibe', 'pro'] as const).map(track => {
                const trackId = `stage${activeStage}-${track}`;
                const expanded = expandedTracks.has(trackId);
                return (
                  <button
                    type="button"
                    key={track}
                    className={`architecture-toolbar__track architecture-toolbar__track--${track} ${expanded ? 'is-active' : ''}`}
                    aria-pressed={expanded}
                    title={`${expanded ? '收起' : '展开'} ${track === 'vibe' ? 'Vibe' : 'Pro'} 轨道`}
                    onClick={() => setExpandedTracks(previous => {
                      restoreGenerationRef.current += 1;
                      const next = new Set(previous);
                      next.has(trackId) ? next.delete(trackId) : next.add(trackId);
                      return next;
                    })}
                  >
                    {track === 'vibe' ? 'Vibe' : 'Pro'}
                  </button>
                );
              })}
            </>
          )}
          <button type="button" title="搜索" onClick={() => setSearchRequest(value => value + 1)}><Search aria-hidden="true" />搜索</button>
          <button type="button" title="适应画布" onClick={fitCanvasFromUser}><RotateCcw aria-hidden="true" />适应</button>
          <button type="button" title="重置自动布局" onClick={resetAutoLayout}><RotateCcw aria-hidden="true" />重置</button>
          <button type="button" title="保存画布状态" onClick={saveCanvasState}><Save aria-hidden="true" />保存</button>
          <button type="button" title="导出建筑全景 PNG" disabled={exportingPanorama} onClick={exportPng}><ImageDown aria-hidden="true" />PNG</button>
          <button type="button" title="导出 Markdown" className="architecture-toolbar__primary" onClick={exportMarkdown}><Download aria-hidden="true" />Markdown</button>
        </nav>
      </header>

      <div className="desktop-architecture-canvas" aria-hidden={isMobileViewport || exportingPanorama}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_event, node) => {
            const docNodeId = typeof node.data?.docNodeId === 'string' ? node.data.docNodeId : undefined;
            if (docNodeId) openDocNode(docNodeId);
          }}
          onNodeDragStop={saveCanvasState}
          onMoveStart={event => {
            if (event) {
              restoreGenerationRef.current += 1;
              autoFitRef.current = false;
            }
          }}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.08 }}
          minZoom={0.2}
          maxZoom={2.5}
          defaultViewport={{ x: 80, y: 40, zoom: 0.6 }}
          snapToGrid
          snapGrid={[16, 16]}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#DDE7D8" />
          <Controls
            className="!hidden sm:!flex"
            onZoomIn={() => { restoreGenerationRef.current += 1; }}
            onZoomOut={() => { restoreGenerationRef.current += 1; }}
            onFitView={() => { restoreGenerationRef.current += 1; }}
          />
          <MiniMap
            nodeStrokeWidth={1.5}
            nodeColor={node => {
              const track = node.data?.track;
              if (track === 'vibe') return '#147D78';
              if (track === 'pro') return '#9A5B12';
              if (track === 'shared') return '#4F5F9B';
              return '#91A28B';
            }}
            maskColor="rgba(248,251,240,0.74)"
            className="!hidden sm:!block"
          />

        </ReactFlow>
      </div>

      <div className="mobile-canvas-toolbar">
        <Link href="/" aria-label="返回工作台"><Home aria-hidden="true" /></Link>
        <button type="button" onClick={() => setSearchRequest(value => value + 1)} aria-label="搜索"><Search aria-hidden="true" /></button>
        <button type="button" onClick={saveCanvasState} aria-label="保存画布状态"><Save aria-hidden="true" /></button>
        <button type="button" disabled={exportingPanorama} onClick={exportPng} aria-label="导出 PNG"><ImageDown aria-hidden="true" /></button>
        <button type="button" onClick={exportMarkdown} aria-label="导出 Markdown"><Download aria-hidden="true" /></button>
      </div>
      <MobileArchitectureView
        documentTitle={document.title}
        version={document.version}
        floors={mobileFloors}
        focused={mobileFocused}
        onOpenRoom={openRegion}
        onBack={returnToOverview}
        onOpenNode={openDocNode}
      />

      {selectedNode && (
        <NodeDetailSheet
          node={selectedNode}
          open={detailOpen}
          readOnly={!writePolicy.writable}
          onClose={() => setDetailOpen(false)}
          onMarkDeleted={async nodeId => {
            if (!writePolicy.writable) return;
            const recoveryContent = `[SOFT-DELETED: ${selectedNode.title}]\n\n> 此节点已通过 DocCanvas 画布标记为删除。如需恢复，删除本段并重新加载画布。\n\n${selectedNode.content}`;
            const token = sessionStorage.getItem('doccanvas-admin-token') || '';
            const response = await fetch('/api/documents', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', ...(token ? { 'X-DocCanvas-Token': token } : {}) },
              body: JSON.stringify({
                documentId: document.id,
                nodeId,
                originalHeading: selectedNode.title,
                hash: metadataString(selectedNode, 'sectionHash'),
                heading: selectedNode.title,
                content: recoveryContent,
              }),
            });
            if (!response.ok) {
              const message = await responseMessage(response);
              setSaveStatus('error');
              setSaveError(message);
              throw new Error(message);
            }
            setDocNodes(previous => removeDocNodeFromView(previous, nodeId));
            setDocEdges(previous => previous.filter(edge => edge.source !== nodeId && edge.target !== nodeId));
            setSelectedNodeId(null);
            setSaveStatus('saved');
            setLastSavedTime(new Date().toISOString());
            setDetailOpen(false);
          }}
          onSave={async (heading, updatedContent) => {
            if (!writePolicy.writable) return;
            setSaveStatus('saving');
            const token = sessionStorage.getItem('doccanvas-admin-token') || '';
            const response = await fetch('/api/documents', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', ...(token ? { 'X-DocCanvas-Token': token } : {}) },
              body: JSON.stringify({
                documentId: document.id,
                nodeId: selectedNode.id,
                originalHeading: selectedNode.title,
                hash: metadataString(selectedNode, 'sectionHash'),
                heading,
                content: updatedContent,
              }),
            });
            if (!response.ok) {
              const message = await responseMessage(response);
              setSaveStatus('error');
              setSaveError(message);
              throw new Error(message);
            }
            const result = await response.json().catch(() => ({}));
            setDocNodes(previous => updateDocNodeAfterSave(previous, {
              id: selectedNode.id,
              title: heading,
              content: updatedContent,
              hash: typeof result.hash === 'string' ? result.hash : undefined,
            }));
            setSaveStatus('saved');
            setLastSavedTime(new Date().toISOString());
            setDetailOpen(false);
          }}
        />
      )}

      <SearchPanel nodes={docNodes} onNavigateToNode={navigateToNode} openRequest={searchRequest} />
      <SaveIndicator status={saveStatus} lastSaved={lastSavedTime} errorMessage={saveError} />
      </div>

      {exportingPanorama && (
        <div className="architecture-export-overlay" role="status" aria-live="polite">
          <span><ImageDown aria-hidden="true" /><strong>正在生成建筑全景</strong></span>
        </div>
      )}
    </>
  );
}
