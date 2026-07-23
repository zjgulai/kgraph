'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toPng, toSvg } from 'html-to-image';
import {
  History,
  LayoutDashboard,
  ListPlus,
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
  type ArchitectureLayoutNode,
} from '@/lib/canvas/layout-engine';
import {
  createCanvasStateForSave,
  getCanvasStateLocalStorageKey,
  getLegacyCanvasStateLocalStorageKey,
  getPreviousCanvasStateLocalStorageKey,
  isCanvasStateV2,
  resetCanvasState,
  restoreCanvasState,
} from '@/lib/canvas/canvas-state';
import {
  removeDocNodeFromView,
} from '@/lib/canvas/doc-node-state';
import {
  buildDocumentPresentation,
  type NodePresentation,
  type RegionPresentation,
} from '@/lib/canvas/document-presentation';
import { cleanPresentationText, hasPresentationTextLeak } from '@/lib/canvas/presentation-text';
import {
  buildFactoryPresentationMap,
  type FactoryPresentation,
} from '@/lib/canvas/factory-presentation';
import {
  resolveSearchNavigationTarget,
  type SearchNavigationIndex,
  type SearchNavigationTarget,
} from '@/lib/canvas/search-navigation';
import { selectPngPixelRatio } from '@/lib/canvas/png-export';
import type { FactorySceneEdge, FactorySceneNode } from '@/lib/canvas/factory-scene';
import type { DocumentMutation } from '@/lib/canvas/document-mutation-types';
import {
  applyArchitectureSidecar,
  parsePresentationSidecar,
  type DocumentPresentationSidecar,
} from '@/lib/canvas/presentation-sidecar';
import {
  ArchitectureCapNode,
  ArchitectureFloorNode,
  ArchitectureLaneNode,
  ArchitectureResourceNode,
  ArchitectureRoomNode,
  ArchitectureRoomGroupNode,
  type ArchitectureCapData,
  type ArchitectureFloorData,
  type ArchitectureLaneData,
  type ArchitectureResourceData,
  type ArchitectureRoomData,
  type ArchitectureRoomGroupData,
  type ArchitectureRoomPreview,
} from './ArchitectureNodes';
import {
  FactorySceneCanvas,
  type FactorySceneCanvasHandle,
} from './FactorySceneCanvas';
import { MobileArchitectureView, type MobileArchitectureFloor } from './MobileArchitectureView';
import { CardNode } from './CardNode';
import { NodeDetailSheet } from './NodeDetailSheet';
import { SaveIndicator } from './SaveIndicator';
import { ExportIndicator, type ExportFeedbackStatus } from './ExportIndicator';
import { SearchPanel } from './SearchPanel';
import { ArchitectureRegionReader } from './ArchitectureRegionReader';
import { FactoryHeader } from './FactoryHeader';
import {
  type CanvasPresentationMode,
} from './CanvasPresentationSwitch';
import { CanvasToolbar } from './CanvasToolbar';
import { MobileCanvasNavigation } from './MobileCanvasNavigation';
import { FactoryRelationInspector } from './FactoryRelationInspector';
import { OwnerSessionControl } from './OwnerSessionControl';
import {
  FactoryOwnerInspector,
  type FactoryOwnerInspectorTab,
} from './FactoryOwnerInspector';
import { useFactoryLayout } from './useFactoryLayout';

interface FactoryProjectedNode {
  id: string;
  type: 'architectureCap' | 'architectureFloor' | 'architectureLane' | 'architectureResource' | 'architectureRoom' | 'architectureRoomGroup' | 'cardNode';
  data: Record<string, unknown>;
  selected: boolean;
}

interface Props {
  document: DocCanvasType;
  documentHash: string;
  presentation: DocumentPresentationSidecar;
  writePolicy: WritePolicy;
}

type FileBackedDocument = DocCanvasType & {
  _file?: { mtime: string; path: string; bytes: number };
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

function isParsedDocument(value: unknown): value is DocCanvasType {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DocCanvasType>;
  return typeof candidate.id === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.version === 'string'
    && Array.isArray(candidate.nodes)
    && Array.isArray(candidate.edges);
}

interface MutationResponse {
  document: DocCanvasType;
  presentation: DocumentPresentationSidecar;
  revision: number;
  mutationId: string;
}

function parseMutationResponse(value: unknown): MutationResponse | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (!isParsedDocument(candidate.document)) return null;
  if (typeof candidate.revision !== 'number' || typeof candidate.mutationId !== 'string') return null;
  try {
    return {
      document: candidate.document,
      presentation: parsePresentationSidecar(candidate.presentation),
      revision: candidate.revision,
      mutationId: candidate.mutationId,
    };
  } catch {
    return null;
  }
}

function assertExportTextSafe(root: HTMLElement): void {
  const textWalker = window.document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT);
  let textNode = textWalker.nextNode();
  while (textNode) {
    if (hasPresentationTextLeak(textNode.textContent ?? '')) {
      throw new Error('导出视图仍包含未清理的展示文本。');
    }
    textNode = textWalker.nextNode();
  }

  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const element of elements) {
    const values = [
      element.getAttribute('aria-label') ?? '',
      element.getAttribute('title') ?? '',
      element.getAttribute('alt') ?? '',
    ];
    if (values.some(hasPresentationTextLeak)) {
      throw new Error('导出视图仍包含未清理的展示文本。');
    }
  }
}

function roomPreview(
  region: ArchitectureRegion,
  selectedRegionId: string | null = null,
  presentation?: RegionPresentation,
  factory?: FactoryPresentation,
): ArchitectureRoomPreview {
  const count = (track: 'vibe' | 'shared' | 'pro') =>
    region.trackSummaries.find(summary => summary.track === track)?.count ?? 0;
  return {
    id: region.id,
    eyebrow: region.stageNumber === undefined
      ? `MODULE ${String(region.order).padStart(2, '0')}`
      : `STAGE ${String(region.stageNumber).padStart(2, '0')}`,
    title: presentation?.displayTitle ?? cleanPresentationText(region.title),
    summary: presentation?.displaySummary ?? cleanPresentationText(region.summary),
    selected: region.id === selectedRegionId,
    stageNumber: region.stageNumber,
    factory,
    counts: {
      vibe: count('vibe'),
      shared: count('shared'),
      pro: count('pro'),
      resources: region.resources.count,
    },
  };
}

function docNodeData(node: DocNode, presentation: NodePresentation) {
  return {
    docNodeId: node.id,
    displayTitle: presentation.displayTitle,
    displaySummary: presentation.displaySummary,
    sourceLabel: presentation.sourceLabel,
    type: node.type,
    level: node.level,
    track: node.track,
    stageNumber: node.stageNumber,
    toolReferences: node.toolReferences,
    promptTemplates: node.promptTemplates,
    contentBlocksCount: node.contentBlocks?.length || 0,
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

function waitForPaint(frames = 2): Promise<void> {
  return new Promise(resolve => {
    const next = (remaining: number) => window.requestAnimationFrame(() => {
      if (remaining <= 1) resolve();
      else next(remaining - 1);
    });
    next(frames);
  });
}

export default function CanvasViewer({ document, documentHash, presentation, writePolicy }: Props) {
  const [docNodes, setDocNodes] = useState<DocNode[]>(() => document.nodes);
  const [docEdges, setDocEdges] = useState<DocEdge[]>(() => document.edges);
  const [documentTitle, setDocumentTitle] = useState(document.title);
  const [documentVersion, setDocumentVersion] = useState(document.version);
  const [baseDocumentHash, setBaseDocumentHash] = useState(documentHash);
  const [presentationSidecar, setPresentationSidecar] = useState(presentation);
  const [canvasView, setCanvasView] = useState<CanvasView>({ kind: 'overview' });
  const [presentationMode, setPresentationMode] = useState<CanvasPresentationMode>('map');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<FactorySceneEdge | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [dismissedReaderRegionId, setDismissedReaderRegionId] = useState<string | null>(null);
  const [highlightedSearchNodeId, setHighlightedSearchNodeId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState('');
  const [saveError, setSaveError] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const [exportingFullScene, setExportingFullScene] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{
    status: ExportFeedbackStatus;
    message: string;
  }>({ status: 'idle', message: '' });
  const [layoutProfile, setLayoutProfile] = useState<'desktop' | 'tablet'>('desktop');
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [ownerAuthenticated, setOwnerAuthenticated] = useState(writePolicy.mode === 'dev');
  const [ownerInspectorTab, setOwnerInspectorTab] = useState<FactoryOwnerInspectorTab | null>(null);
  const [restoredState, setRestoredState] = useState<CanvasState | null>(null);
  const [searchRequest, setSearchRequest] = useState(0);
  const [searchContext, setSearchContext] = useState<SearchNavigationTarget | null>(null);
  const [searchNotice, setSearchNotice] = useState('');
  const autoFitRef = useRef(true);
  const restoredViewportRef = useRef(false);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const sceneCanvasRef = useRef<FactorySceneCanvasHandle>(null);
  const restoreGenerationRef = useRef(0);
  const exportInFlightRef = useRef(false);
  const exportFeedbackTimerRef = useRef<number | null>(null);

  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(defaultExpandedTracks);
  const presentationFingerprintRef = useRef<string | null>(null);
  const incomingDocumentKeyRef = useRef(`${document.id}:${documentHash}:${presentation.revision}`);
  const handleOwnerAuthenticatedChange = useCallback((authenticated: boolean) => {
    setOwnerAuthenticated(authenticated);
    if (!authenticated) setOwnerInspectorTab(null);
  }, []);
  const editorWritable = !isMobileViewport && (
    writePolicy.mode === 'dev' || (writePolicy.mode === 'owner' && ownerAuthenticated)
  );
  const canPersistServerView = !isMobileViewport && (
    writePolicy.mode === 'dev' || (writePolicy.mode === 'owner' && ownerAuthenticated)
  );

  const rawArchitectureModel = useMemo(() => buildArchitectureViewModel({
    id: document.id,
    title: documentTitle,
    version: documentVersion,
    nodes: docNodes,
    edges: docEdges,
  }), [document.id, documentTitle, documentVersion, docEdges, docNodes]);
  const architectureModel = useMemo(
    () => applyArchitectureSidecar(rawArchitectureModel, presentationSidecar),
    [presentationSidecar, rawArchitectureModel],
  );
  const factoryPresentationByRegionId = useMemo(
    () => buildFactoryPresentationMap(architectureModel, presentationSidecar),
    [architectureModel, presentationSidecar],
  );

  const showExportFeedback = useCallback((
    status: ExportFeedbackStatus,
    message: string,
    hideAfterMs?: number,
  ) => {
    if (exportFeedbackTimerRef.current !== null) {
      window.clearTimeout(exportFeedbackTimerRef.current);
      exportFeedbackTimerRef.current = null;
    }
    setExportFeedback({ status, message });
    if (hideAfterMs) {
      exportFeedbackTimerRef.current = window.setTimeout(() => {
        setExportFeedback({ status: 'idle', message: '' });
        exportFeedbackTimerRef.current = null;
      }, hideAfterMs);
    }
  }, []);

  useEffect(() => () => {
    if (exportFeedbackTimerRef.current !== null) {
      window.clearTimeout(exportFeedbackTimerRef.current);
    }
  }, []);
  const displayDocumentVersion = cleanPresentationText(documentVersion);
  const documentPresentation = useMemo(() => buildDocumentPresentation(
    { nodes: docNodes },
    {
      regions: architectureModel.regions.map(region => ({
        id: region.id,
        title: region.title,
        summary: region.summary,
        sourceTitle: region.sourceTitle,
        headingNodeIds: region.headingNodeIds,
        nodeIds: region.nodeIds,
      })),
      nodeRegionId: architectureModel.nodeRegionId,
      nodeCopyById: new Map(Object.entries(architectureModel.nodePresentationCopy)),
    },
  ), [architectureModel, docNodes]);
  const presentationByNodeId = documentPresentation.presentationByNodeId;
  const regionPresentationById = documentPresentation.regionPresentationById;
  const roofRegion = architectureModel.regions.find(region => region.kind === 'roof');
  const displayArchitectureTitle = roofRegion
    ? regionPresentationById.get(roofRegion.id)?.displayTitle ?? architectureModel.title
    : architectureModel.title;
  const presentationRecord = useMemo(() => Object.fromEntries(
    [...presentationByNodeId].map(([nodeId, presentation]) => [nodeId, {
      displayTitle: presentation.displayTitle,
      displaySummary: presentation.displaySummary,
      sourceLabel: presentation.sourceLabel,
    }]),
  ), [presentationByNodeId]);
  const layoutModel = useMemo(
    () => filterFocusedTracks(architectureModel, canvasView, expandedTracks),
    [architectureModel, canvasView, expandedTracks],
  );
  const layout = useFactoryLayout(layoutModel, canvasView, layoutProfile);
  const regionById = useMemo(
    () => new Map(architectureModel.regions.map(region => [region.id, region])),
    [architectureModel.regions],
  );
  const nodeById = useMemo(() => new Map(docNodes.map(node => [node.id, node])), [docNodes]);
  const searchNavigationIndex = useMemo<SearchNavigationIndex>(() => ({
    nodeIds: new Set(nodeById.keys()),
    nodeRegionId: architectureModel.nodeRegionId,
    regionKindById: Object.fromEntries(architectureModel.regions.map(region => [region.id, region.kind])),
  }), [architectureModel.nodeRegionId, architectureModel.regions, nodeById]);
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const selectedNodeModuleId = selectedNodeId
    ? architectureModel.nodeRegionId[selectedNodeId]
    : undefined;
  const selectedNodePresentation = selectedNodeId
    ? presentationByNodeId.get(selectedNodeId) ?? null
    : null;
  const selectedRegion = selectedRegionId ? regionById.get(selectedRegionId) : undefined;
  const selectedRegionFactory = selectedRegionId
    ? factoryPresentationByRegionId.get(selectedRegionId)
    : undefined;
  const focusedRegion = canvasView.kind === 'focused-region'
    ? regionById.get(canvasView.regionId)
    : undefined;
  const identity = useMemo(() => ({
    documentId: document.id,
    graphFingerprint: architectureModel.graphFingerprint,
  }), [architectureModel.graphFingerprint, document.id]);

  useEffect(() => {
    const previous = presentationFingerprintRef.current;
    presentationFingerprintRef.current = architectureModel.graphFingerprint;
    if (!previous || previous === architectureModel.graphFingerprint) return;
    if (selectedRegionId && !regionById.has(selectedRegionId)) {
      setSelectedRegionId(null);
      setOwnerInspectorTab(null);
    }
    if (highlightedSearchNodeId && !nodeById.has(highlightedSearchNodeId)) {
      setHighlightedSearchNodeId(null);
    }
  }, [architectureModel.graphFingerprint, highlightedSearchNodeId, nodeById, regionById, selectedRegionId]);

  useEffect(() => {
    if (searchContext && !nodeById.has(searchContext.nodeId)) {
      setSearchNotice('搜索目标内容已变化，请重新搜索。');
    }
  }, [nodeById, searchContext]);

  const selectRegion = useCallback((regionId: string) => {
    if (exportInFlightRef.current) return;
    const region = regionById.get(regionId);
    if (!region || region.kind === 'roof') return;
    restoreGenerationRef.current += 1;
    setSelectedRegionId(regionId);
    setOwnerInspectorTab(null);
    setDismissedReaderRegionId(null);
    setHighlightedSearchNodeId(null);
    setActiveStage(region.stageNumber ?? null);
    setDetailOpen(false);
  }, [regionById]);

  const openRegion = useCallback((regionId: string) => {
    if (exportInFlightRef.current) return;
    const region = regionById.get(regionId);
    if (!region || region.kind === 'roof') return;
    const highlightedRegionId = highlightedSearchNodeId
      ? architectureModel.nodeRegionId[highlightedSearchNodeId]
      : undefined;
    if (highlightedRegionId !== regionId) setHighlightedSearchNodeId(null);
    restoreGenerationRef.current += 1;
    setSelectedRegionId(regionId);
    setDismissedReaderRegionId(null);
    setCanvasView({ kind: 'focused-region', regionId });
    setActiveStage(region.stageNumber ?? null);
    setDetailOpen(false);
    autoFitRef.current = true;
    restoredViewportRef.current = true;
  }, [architectureModel.nodeRegionId, highlightedSearchNodeId, regionById]);

  const returnToOverview = useCallback(() => {
    if (exportInFlightRef.current) return;
    restoreGenerationRef.current += 1;
    setCanvasView({ kind: 'overview' });
    setDismissedReaderRegionId(null);
    setActiveStage(null);
    setDetailOpen(false);
    autoFitRef.current = true;
    restoredViewportRef.current = true;
  }, []);

  const projectedNodes = useMemo<FactoryProjectedNode[]>(() => {
    return layout.nodes.map((layoutNode: ArchitectureLayoutNode): FactoryProjectedNode => {
      const base = {
        id: layoutNode.id,
        selected: layoutNode.kind === 'content' && layoutNode.nodeId === highlightedSearchNodeId,
      };

      if (layoutNode.kind === 'floor') {
        const floor = architectureModel.floors.find(candidate => candidate.id === layoutNode.id);
        const data: ArchitectureFloorData = {
          floorLabel: floor?.label ?? 'ARCHITECTURE FLOOR',
          title: architectureModel.mode === 'lifecycle' ? '产品生命周期层' : '产品能力模块层',
          mode: architectureModel.mode,
        };
        return { ...base, type: 'architectureFloor', data: data as unknown as Record<string, unknown> };
      }

      if (layoutNode.kind === 'room') {
        const region = layoutNode.regionId ? regionById.get(layoutNode.regionId) : undefined;
        const presentation = region ? regionPresentationById.get(region.id) : undefined;
        const factory = region ? factoryPresentationByRegionId.get(region.id) : undefined;
        if (!region || !factory) {
          return { ...base, type: 'architectureResource', data: { title: '房间不可用', count: 0, previews: [] } };
        }
        const data: ArchitectureRoomData = {
          ...roomPreview(region, selectedRegionId, presentation),
          roomIndex: region.stageNumber ?? region.order,
          factory,
          onSelectRoom: selectRegion,
        };
        return { ...base, type: 'architectureRoom', data: data as unknown as Record<string, unknown> };
      }

      if (layoutNode.kind === 'roof' || layoutNode.kind === 'foyer' || layoutNode.kind === 'foundation' || layoutNode.kind === 'annex') {
        const region = layoutNode.regionId ? regionById.get(layoutNode.regionId) : undefined;
        const presentation = region ? regionPresentationById.get(region.id) : undefined;
        const chips = region
          ? region.previewNodeIds
            .map(nodeId => presentationByNodeId.get(nodeId)?.displayTitle)
            .filter((title): title is string => Boolean(title))
          : [];
        const rootSummary = architectureModel.rootNodeId
          ? presentationByNodeId.get(architectureModel.rootNodeId)?.displaySummary ?? ''
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
          title: presentation?.displayTitle ?? (kind === 'foundation' ? '共享基础与治理' : '附属模块'),
          summary: kind === 'roof'
            ? rootSummary || presentation?.displaySummary || displayDocumentVersion
            : presentation?.displaySummary ?? '',
          chips,
          selected: region?.id === selectedRegionId,
          roomId: region && kind !== 'roof' ? region.id : undefined,
          onSelectRoom: selectRegion,
        };
        return { ...base, type: 'architectureCap', data: data as unknown as Record<string, unknown> };
      }

      if (layoutNode.kind === 'group') {
        const region = layoutNode.regionId ? regionById.get(layoutNode.regionId) : undefined;
        const presentation = region ? regionPresentationById.get(region.id) : undefined;
        return {
          ...base,
          type: 'architectureRoomGroup',
          data: {
            eyebrow: region ? roomPreview(region, selectedRegionId, presentation).eyebrow : 'FOCUSED ROOM',
            title: presentation?.displayTitle ?? '聚焦房间',
            summary: presentation?.displaySummary ?? '',
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
            previews: region?.resources.previews.map(preview => (
              presentationByNodeId.get(preview.id)?.displayTitle ?? cleanPresentationText(preview.title)
            )) ?? [],
          },
        };
      }

      const docNode = layoutNode.nodeId ? nodeById.get(layoutNode.nodeId) : undefined;
      const presentation = layoutNode.nodeId ? presentationByNodeId.get(layoutNode.nodeId) : undefined;
      if (!docNode || !presentation) {
        return { ...base, type: 'architectureResource', data: { title: '内容不可用', count: 0, previews: [] } };
      }
      return { ...base, type: 'cardNode', data: docNodeData(docNode, presentation) };
    });
  }, [architectureModel, displayDocumentVersion, factoryPresentationByRegionId, highlightedSearchNodeId, layout.nodes, nodeById, presentationByNodeId, regionById, regionPresentationById, selectRegion, selectedRegionId]);

  const projectedNodeById = useMemo(
    () => new Map(projectedNodes.map(node => [node.id, node])),
    [projectedNodes],
  );

  const renderFactorySceneNode = useCallback((sceneNode: FactorySceneNode): ReactNode => {
    const projected = projectedNodeById.get(sceneNode.id);
    if (!projected) return null;
    if (projected.type === 'architectureFloor') {
      return <ArchitectureFloorNode data={projected.data as unknown as ArchitectureFloorData} />;
    }
    if (projected.type === 'architectureRoom') {
      return <ArchitectureRoomNode data={projected.data as unknown as ArchitectureRoomData} />;
    }
    if (projected.type === 'architectureCap') {
      return <ArchitectureCapNode data={projected.data as unknown as ArchitectureCapData} />;
    }
    if (projected.type === 'architectureLane') {
      return <ArchitectureLaneNode data={projected.data as unknown as ArchitectureLaneData} />;
    }
    if (projected.type === 'architectureRoomGroup') {
      return <ArchitectureRoomGroupNode data={projected.data as unknown as ArchitectureRoomGroupData} />;
    }
    if (projected.type === 'architectureResource') {
      return <ArchitectureResourceNode data={projected.data as unknown as ArchitectureResourceData} />;
    }
    return <CardNode data={projected.data as unknown as Parameters<typeof CardNode>[0]['data']} selected={projected.selected} />;
  }, [projectedNodeById]);

  const factorySceneNodeLabel = useCallback((sceneNode: FactorySceneNode): string => {
    if (sceneNode.nodeId) {
      return presentationByNodeId.get(sceneNode.nodeId)?.displayTitle ?? '内容节点';
    }
    if (sceneNode.regionId) {
      return regionPresentationById.get(sceneNode.regionId)?.displayTitle
        ?? regionById.get(sceneNode.regionId)?.title
        ?? '建筑模块';
    }
    if (sceneNode.kind === 'floor') return '建筑楼层';
    if (sceneNode.kind === 'lane') return '内容轨道';
    return '建筑节点';
  }, [presentationByNodeId, regionById, regionPresentationById]);

  const matchingRestoredState = useMemo(() => {
    const restored = restoredState ? restoreCanvasState(restoredState, identity) : null;
    return restored && sameCanvasView(restored.view, canvasView) ? restored : null;
  }, [canvasView, identity, restoredState]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (matchingRestoredState?.lastSaved && !restoredViewportRef.current) {
        restoredViewportRef.current = true;
        sceneCanvasRef.current?.setViewport(matchingRestoredState.viewport, false);
        return;
      }
      if (autoFitRef.current) sceneCanvasRef.current?.fit(true);
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [canvasView, layout.bounds.height, layout.bounds.width, matchingRestoredState]);

  useEffect(() => {
    const updateProfile = () => {
      const width = window.innerWidth;
      setLayoutProfile(width >= 768 && width <= 1279 ? 'tablet' : 'desktop');
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
          const previousKey = getPreviousCanvasStateLocalStorageKey(document.id);
          const previousRaw = localStorage.getItem(previousKey);
          const previousValue: unknown = previousRaw ? JSON.parse(previousRaw) : null;
          state = restoreCanvasState(previousValue, identity);
          if (state && isCanvasStateV2(previousValue)) {
            localStorage.setItem(getCanvasStateLocalStorageKey(document.id), JSON.stringify(state));
            localStorage.removeItem(previousKey);
          }
        } catch {
          state = null;
        }
      }
      if (!state) {
        try {
          const response = await fetch(`/api/canvas-state?documentId=${document.id}`);
          if (response.ok) {
            const stored: unknown = await response.json();
            state = restoreCanvasState(stored, identity);
            if (state && isCanvasStateV2(stored)) {
              localStorage.setItem(getCanvasStateLocalStorageKey(document.id), JSON.stringify(state));
            }
          }
        } catch {
          state = null;
        }
      }
      // A save can occur while the server GET is in flight. Re-read local v3
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
      if (state.expandedNodes.includes('tracks:v3') || state.expandedNodes.includes('tracks:v2')) {
        setExpandedTracks(new Set(state.expandedNodes.filter(value => /^stage[1-8]-(?:vibe|pro)$/.test(value))));
      }
      setCanvasView(state.view);
      setSelectedRegionId(state.selectedModuleId
        ?? (state.view.kind === 'focused-region' ? state.view.regionId : null));
      setDismissedReaderRegionId(null);
      setActiveStage(state.view.kind === 'focused-region' ? regionById.get(state.view.regionId)?.stageNumber ?? null : null);
      setLastSavedTime(state.lastSaved ?? '');
    };
    restore();
    return () => { cancelled = true; };
  }, [document.id, identity, regionById]);

  useEffect(() => {
    const incomingKey = `${document.id}:${documentHash}:${presentation.revision}`;
    if (incomingDocumentKeyRef.current === incomingKey) return;
    incomingDocumentKeyRef.current = incomingKey;
    setDocNodes(document.nodes);
    setDocEdges(document.edges);
    setDocumentTitle(document.title);
    setDocumentVersion(document.version);
    setBaseDocumentHash(documentHash);
    setPresentationSidecar(presentation);
    setSelectedNodeId(null);
    setSelectedRegionId(null);
    setDismissedReaderRegionId(null);
    setHighlightedSearchNodeId(null);
    setDetailOpen(false);
    setOwnerInspectorTab(null);
  }, [document.edges, document.id, document.nodes, document.title, document.version, documentHash, presentation]);

  const saveCanvasState = useCallback(async () => {
    restoreGenerationRef.current += 1;
    const now = new Date().toISOString();
    const state = createCanvasStateForSave(identity, {
      view: canvasView,
      selectedModuleId: selectedRegionId ?? undefined,
      viewport: sceneCanvasRef.current?.getViewport() ?? { x: 0, y: 0, zoom: 1 },
      expandedNodes: ['tracks:v3', ...[...expandedTracks].sort()],
      nodePositions: canvasView.kind === 'focused-region'
        ? sceneCanvasRef.current?.getNodePositions() ?? {}
        : {},
      savedAt: now,
      viewportCanRestore: window.innerWidth >= 768,
    });
    setRestoredState(state);
    try {
      localStorage.setItem(getCanvasStateLocalStorageKey(document.id), JSON.stringify(state));
      localStorage.removeItem(getLegacyCanvasStateLocalStorageKey(document.id));
      localStorage.removeItem(getPreviousCanvasStateLocalStorageKey(document.id));
    } catch {}

    if (!canPersistServerView) {
      setSaveStatus('saved');
      setLastSavedTime(now);
      setSaveError('');
      return;
    }

    setSaveStatus('saving');
    let success = false;
    for (let attempt = 0; attempt < 3 && !success; attempt++) {
      try {
        const response = await fetch('/api/canvas-state', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
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
  }, [canPersistServerView, canvasView, document.id, expandedTracks, identity, selectedRegionId]);

  const resetAutoLayout = useCallback(async () => {
    restoreGenerationRef.current += 1;
    const reset = resetCanvasState(identity);
    try {
      localStorage.setItem(getCanvasStateLocalStorageKey(document.id), JSON.stringify(reset));
      localStorage.removeItem(getLegacyCanvasStateLocalStorageKey(document.id));
      localStorage.removeItem(getPreviousCanvasStateLocalStorageKey(document.id));
    } catch {}
    setRestoredState(null);
    restoredViewportRef.current = true;
    autoFitRef.current = true;
    setCanvasView({ kind: 'overview' });
    setActiveStage(null);
    setSelectedRegionId(null);
    setDismissedReaderRegionId(null);
    setHighlightedSearchNodeId(null);
    setExpandedTracks(defaultExpandedTracks());
    sceneCanvasRef.current?.resetNodePositions();
    if (canPersistServerView) {
      try {
        const response = await fetch('/api/canvas-state', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reset),
        });
        if (!response.ok) throw new Error(await response.text());
      } catch {
        setSaveStatus('error');
        setSaveError('自动布局已在本地重置，但服务器状态未更新。');
      }
    }
  }, [canPersistServerView, document.id, identity]);

  const fitCanvas = useCallback(() => {
    autoFitRef.current = true;
    sceneCanvasRef.current?.fit(true);
  }, []);

  const handleSceneViewportChange = useCallback(() => {
    autoFitRef.current = false;
  }, []);

  const fitCanvasFromUser = useCallback(() => {
    restoreGenerationRef.current += 1;
    fitCanvas();
  }, [fitCanvas]);

  const exportMarkdown = useCallback(async () => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setExportStatus('正在导出 Markdown...');
    showExportFeedback('working', '正在导出 Markdown...');
    let objectUrl = '';
    try {
      const response = await fetch(`/api/export/markdown?documentId=${document.id}`);
      if (!response.ok) throw new Error(`导出接口返回 ${response.status}`);
      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.download = `${document.id}.md`;
      link.href = objectUrl;
      link.click();
      link.remove();
      setExportStatus('Markdown 已导出。');
      showExportFeedback('success', 'Markdown 已导出。', 3200);
      window.setTimeout(() => setExportStatus(''), 2200);
    } catch (error) {
      const reason = error instanceof Error ? cleanPresentationText(error.message) : '';
      const message = `Markdown 导出未完成${reason ? `：${reason}` : '。'}`;
      setExportStatus(message);
      showExportFeedback('error', message, 5200);
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      exportInFlightRef.current = false;
    }
  }, [document.id, showExportFeedback]);

  const exportPng = useCallback(async () => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setExportStatus('正在导出当前视口 PNG...');
    showExportFeedback('working', '正在导出当前视口 PNG...');
    try {
      const viewportElement = window.document.querySelector<HTMLElement>('.desktop-architecture-canvas .factory-scene-canvas');
      if (!viewportElement?.querySelector('.factory-scene-node')) throw new Error('当前视口尚未完成绘制。');
      assertExportTextSafe(viewportElement);
      const rect = viewportElement.getBoundingClientRect();
      const imageWidth = Math.ceil(rect.width);
      const imageHeight = Math.ceil(rect.height);
      const pixelRatio = selectPngPixelRatio(imageWidth, imageHeight);
      if (pixelRatio === null) throw new Error('当前视口超过安全导出预算。');
      const dataUrl = await toPng(viewportElement, {
        backgroundColor: window.getComputedStyle(viewportElement).backgroundColor,
        width: imageWidth,
        height: imageHeight,
        pixelRatio,
        filter: node => !(node instanceof HTMLElement)
          || (!node.classList.contains('factory-scene-controls') && !node.classList.contains('factory-scene-minimap')),
      });
      const link = window.document.createElement('a');
      link.download = `${document.id}-viewport.png`;
      link.href = dataUrl;
      link.click();
      link.remove();
      setExportStatus('当前视口 PNG 已导出。');
      showExportFeedback('success', '当前视口 PNG 已导出。', 3200);
      window.setTimeout(() => setExportStatus(''), 2200);
    } catch (error) {
      const reason = error instanceof Error ? cleanPresentationText(error.message) : '';
      const message = `PNG 导出未完成${reason ? `：${reason}` : '。'}`;
      setExportStatus(message);
      showExportFeedback('error', message, 5200);
    } finally {
      exportInFlightRef.current = false;
    }
  }, [document.id, showExportFeedback]);

  const exportSvg = useCallback(async () => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    setExportStatus('正在导出完整场景 SVG...');
    showExportFeedback('working', '正在导出完整场景 SVG...');
    try {
      setExportingFullScene(true);
      await waitForPaint();
      const sceneElement = sceneCanvasRef.current?.getSceneElement();
      if (!sceneElement?.querySelector('.factory-scene-node')) throw new Error('完整场景尚未完成绘制。');
      assertExportTextSafe(sceneElement);
      const dataUrl = await toSvg(sceneElement, {
        width: Math.ceil(layout.bounds.width),
        height: Math.ceil(layout.bounds.height),
        style: {
          width: `${Math.ceil(layout.bounds.width)}px`,
          height: `${Math.ceil(layout.bounds.height)}px`,
          transform: 'none',
          transformOrigin: '0 0',
        },
      });
      const link = window.document.createElement('a');
      link.download = `${document.id}-${layout.view}.svg`;
      link.href = dataUrl;
      link.click();
      link.remove();
      setExportStatus('完整场景 SVG 已导出。');
      showExportFeedback('success', '完整场景 SVG 已导出。', 3200);
      window.setTimeout(() => setExportStatus(''), 2200);
    } catch (error) {
      const reason = error instanceof Error ? cleanPresentationText(error.message) : '';
      const message = `SVG 导出未完成${reason ? `：${reason}` : '。'}`;
      setExportStatus(message);
      showExportFeedback('error', message, 5200);
    } finally {
      setExportingFullScene(false);
      exportInFlightRef.current = false;
    }
  }, [document.id, layout.bounds.height, layout.bounds.width, layout.view, showExportFeedback]);

  const openDocNode = useCallback((nodeId: string) => {
    const node = nodeById.get(nodeId);
    if (!node) return;
    setSelectedNodeId(nodeId);
    setDetailOpen(true);
  }, [nodeById]);

  const replaceParsedDocument = useCallback((nextDocument: DocCanvasType, hiddenNodeId?: string) => {
    setDocumentTitle(nextDocument.title);
    setDocumentVersion(nextDocument.version);
    setDocNodes(hiddenNodeId
      ? removeDocNodeFromView(nextDocument.nodes, hiddenNodeId)
      : nextDocument.nodes);
    setDocEdges(hiddenNodeId
      ? nextDocument.edges.filter(edge => edge.source !== hiddenNodeId && edge.target !== hiddenNodeId)
      : nextDocument.edges);
    setSelectedNodeId(null);
    setDetailOpen(false);
  }, []);

  const commitDocumentMutation = useCallback(async (operation: DocumentMutation): Promise<MutationResponse> => {
    if (!editorWritable) throw new Error('Owner 编辑会话未解锁，或当前设备仅允许只读。');
    setSaveStatus('saving');
    setSaveError('');
    const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}/mutations`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: presentationSidecar.revision,
        baseDocumentHash,
        operation,
      }),
    });
    if (!response.ok) {
      const message = await responseMessage(response);
      const readable = response.status === 409
        ? `版本冲突：${message}`
        : message;
      setSaveStatus('error');
      setSaveError(readable);
      throw new Error(readable);
    }
    const result = parseMutationResponse(await response.json().catch(() => null));
    if (!result) {
      const message = '服务端写入完成，但返回的修订结果不完整。请重新加载后再编辑。';
      setSaveStatus('error');
      setSaveError(message);
      throw new Error(message);
    }
    replaceParsedDocument(result.document);
    setPresentationSidecar(result.presentation);
    setBaseDocumentHash(result.presentation.documentHash);
    setSaveStatus('saved');
    setLastSavedTime(result.presentation.updatedAt);
    return result;
  }, [baseDocumentHash, document.id, editorWritable, presentationSidecar.revision, replaceParsedDocument]);

  const restoreDocumentRevision = useCallback(async (revisionId: string): Promise<void> => {
    if (!editorWritable) throw new Error('Owner 编辑会话未解锁，或当前设备仅允许只读。');
    setSaveStatus('saving');
    setSaveError('');
    const response = await fetch(
      `/api/documents/${encodeURIComponent(document.id)}/revisions/${encodeURIComponent(revisionId)}/restore`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseRevision: presentationSidecar.revision,
          baseDocumentHash,
        }),
      },
    );
    if (!response.ok) {
      const message = await responseMessage(response);
      const readable = response.status === 409 ? `版本冲突：${message}` : message;
      setSaveStatus('error');
      setSaveError(readable);
      throw new Error(readable);
    }
    const result = parseMutationResponse(await response.json().catch(() => null));
    if (!result) throw new Error('恢复成功，但服务端未返回完整修订结果。');
    replaceParsedDocument(result.document);
    setPresentationSidecar(result.presentation);
    setBaseDocumentHash(result.presentation.documentHash);
    setSaveStatus('saved');
    setLastSavedTime(result.presentation.updatedAt);
  }, [baseDocumentHash, document.id, editorWritable, presentationSidecar.revision, replaceParsedDocument]);

  const navigateToSearchResult = useCallback((target: SearchNavigationTarget) => {
    setSearchContext(target);
    const resolution = resolveSearchNavigationTarget(target, searchNavigationIndex);
    if (resolution.kind === 'stale') {
      setSearchNotice('搜索目标内容已变化，请重新搜索。');
      return;
    }

    setSearchNotice('');
    setHighlightedSearchNodeId(target.nodeId);
    if (resolution.kind === 'standalone-node') {
      setCanvasView({ kind: 'overview' });
      setSelectedRegionId(null);
      openDocNode(target.nodeId);
      return;
    }

    const region = regionById.get(resolution.regionId);
    const node = nodeById.get(target.nodeId);
    if (!region || !node) {
      setSearchNotice('搜索目标内容已变化，请重新搜索。');
      return;
    }
    if (region.stageNumber && (node.track === 'vibe' || node.track === 'pro')) {
      const trackId = `stage${region.stageNumber}-${node.track}`;
      setExpandedTracks(previous => new Set(previous).add(trackId));
    }

    restoreGenerationRef.current += 1;
    setCanvasView({ kind: 'focused-region', regionId: resolution.regionId });
    setSelectedRegionId(resolution.regionId);
    setDismissedReaderRegionId(null);
    setActiveStage(region.stageNumber ?? null);
    setHighlightedSearchNodeId(target.nodeId);
    openDocNode(target.nodeId);
    autoFitRef.current = true;
    restoredViewportRef.current = true;
  }, [nodeById, openDocNode, regionById, searchNavigationIndex]);

  const stageRegions = useMemo(() => architectureModel.regions
    .filter(region => region.stageNumber !== undefined)
    .sort((left, right) => (left.stageNumber ?? 0) - (right.stageNumber ?? 0)), [architectureModel.regions]);
  const fileMetadata = (document as FileBackedDocument)._file;
  const selectedRegionPresentation = selectedRegion
    ? documentPresentation.regionPresentationById.get(selectedRegion.id)
    : undefined;
  const showRegionReader = canvasView.kind === 'overview'
    && Boolean(selectedRegion && selectedRegionPresentation)
    && dismissedReaderRegionId !== selectedRegion?.id
    && ownerInspectorTab === null
    && !isMobileViewport;

  const mobileFloors = useMemo<MobileArchitectureFloor[]>(() => {
    const floors = architectureModel.floors.map(floor => ({
      id: floor.id,
      label: floor.label,
      title: architectureModel.mode === 'lifecycle' ? '生命周期层' : '能力模块层',
      rooms: floor.regionIds
        .map(regionId => regionById.get(regionId))
        .filter((region): region is ArchitectureRegion => Boolean(region))
        .map(region => roomPreview(
          region,
          selectedRegionId,
          regionPresentationById.get(region.id),
          factoryPresentationByRegionId.get(region.id),
        )),
    }));
    const baseRegions = architectureModel.regions.filter(region =>
      region.kind === 'foyer' || region.kind === 'foundation' || region.kind === 'annex',
    );
    return baseRegions.length === 0 ? floors : [{
      id: 'mobile:foundation',
      label: 'GROUND / FOUNDATION',
      title: '入口、基础与附属',
      rooms: baseRegions.map(region => roomPreview(
        region,
        selectedRegionId,
        regionPresentationById.get(region.id),
        factoryPresentationByRegionId.get(region.id),
      )),
    }, ...floors];
  }, [architectureModel.floors, architectureModel.mode, architectureModel.regions, factoryPresentationByRegionId, regionById, regionPresentationById, selectedRegionId]);

  const mobileFocused = focusedRegion ? {
    room: roomPreview(
      focusedRegion,
      selectedRegionId,
      regionPresentationById.get(focusedRegion.id),
      factoryPresentationByRegionId.get(focusedRegion.id),
    ),
    searchQuery: searchContext?.regionId === focusedRegion.id ? searchContext.query : undefined,
    nodesByTrack: Object.fromEntries((['vibe', 'shared', 'pro'] as const).map(track => {
      const nodeIds = focusedRegion.trackSummaries.find(summary => summary.track === track)?.nodeIds ?? [];
      return [track, nodeIds.map(nodeId => nodeById.get(nodeId)).filter((node): node is DocNode => Boolean(node))];
    })) as Record<'vibe' | 'shared' | 'pro', DocNode[]>,
    resourceCount: focusedRegion.resources.count,
  } : undefined;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (exportInFlightRef.current) return;
      if (event.key === 'Escape' && detailOpen) return;
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
    let resizeTimer: number | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        if (autoFitRef.current) fitCanvas();
      }, 80);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    };
  }, [fitCanvas]);

  return (
    <>
      <div
        ref={canvasShellRef}
        className={`architecture-canvas-shell ${canvasView.kind === 'focused-region' ? 'is-focused-region' : ''} ${showRegionReader ? 'has-region-reader' : ''}${exportingFullScene ? ' is-exporting-full-scene' : ''}`}
        data-presentation={presentationMode}
      >
      <FactoryHeader
        title={displayArchitectureTitle}
        presentationMode={presentationMode}
        modeLabel={presentationMode === 'map'
          ? (architectureModel.mode === 'lifecycle' ? '生命周期地图' : '能力模块地图')
          : (architectureModel.mode === 'lifecycle' ? '生命周期建筑' : '能力模块建筑')}
        version={displayDocumentVersion}
        roomCount={architectureModel.regions.filter(region => region.kind === 'room').length}
        nodeCount={docNodes.length}
        fileMeta={fileMetadata
          ? `${formatDisplayDate(fileMetadata.mtime)} · ${formatDisplayInteger(fileMetadata.bytes)} 字符`
          : undefined}
        statusMessage={exportStatus || searchNotice || undefined}
        navigation={stageRegions.length > 0 ? (
          <nav className="architecture-stage-nav" aria-label="阶段导航">
            {stageRegions.map(region => (
              <button
                type="button"
                key={region.id}
                onClick={() => selectRegion(region.id)}
                className={activeStage === region.stageNumber ? 'is-active' : ''}
                aria-label={`选择阶段 ${region.stageNumber}`}
              >
                {region.stageNumber}
              </button>
            ))}
          </nav>
        ) : undefined}
        actions={(
          <CanvasToolbar
            presentationMode={presentationMode}
            onPresentationChange={setPresentationMode}
            showOverviewAction={canvasView.kind === 'focused-region'}
            activeStage={activeStage}
            isTrackExpanded={track => Boolean(activeStage && expandedTracks.has(`stage${activeStage}-${track}`))}
            onToggleTrack={track => {
              if (!activeStage) return;
              const trackId = `stage${activeStage}-${track}`;
              setExpandedTracks(previous => {
                restoreGenerationRef.current += 1;
                const next = new Set(previous);
                next.has(trackId) ? next.delete(trackId) : next.add(trackId);
                return next;
              });
            }}
            onReturnToOverview={returnToOverview}
            onSearch={() => setSearchRequest(value => value + 1)}
            onFit={fitCanvasFromUser}
            onResetLayout={resetAutoLayout}
            onSaveView={saveCanvasState}
            onExportPng={exportPng}
            onExportSvg={exportSvg}
            onExportMarkdown={exportMarkdown}
            exportWorking={exportFeedback.status === 'working'}
            ownerControl={(
              <OwnerSessionControl
                writePolicy={writePolicy}
                onAuthenticatedChange={handleOwnerAuthenticatedChange}
              />
            )}
          />
        )}
      />

      <div className="desktop-architecture-canvas" aria-hidden={isMobileViewport}>
        <FactorySceneCanvas
          ref={sceneCanvasRef}
          layout={layout}
          presentationMode={presentationMode}
          ariaLabel={presentationMode === 'map' ? '知识地图关系画布' : '产品工厂关系画布'}
          relationAriaLabel={presentationMode === 'map' ? '知识关系' : '生产关系'}
          fitControlLabel={presentationMode === 'map' ? '适应地图' : '适应建筑'}
          viewKey={`${document.id}:${architectureModel.graphFingerprint}:${canvasView.kind === 'overview' ? 'overview' : canvasView.regionId}:${layoutProfile}:${[...expandedTracks].sort().join(',')}`}
          initialViewport={matchingRestoredState?.viewport}
          initialNodePositions={matchingRestoredState?.nodePositions}
          selectedSceneNodeId={selectedNodeId ?? selectedRegionId}
          highlightedSceneNodeId={highlightedSearchNodeId}
          renderNode={renderFactorySceneNode}
          getNodeLabel={factorySceneNodeLabel}
          onViewportChange={handleSceneViewportChange}
          onNodeActivate={node => {
            if (node.nodeId) openDocNode(node.nodeId);
          }}
          onNodePositionsChange={() => saveCanvasState()}
          onEdgeActivate={edge => setSelectedRelation(edge)}
          renderAll={exportingFullScene}
        />
        {editorWritable && selectedRegion?.kind === 'room' && selectedRegionFactory && (
          <>
            <nav className="factory-module-actions" aria-label={`${selectedRegion.title} 模块操作`}>
              <span>OWNER / MODULE</span>
              <button type="button" onClick={() => setOwnerInspectorTab('module')}><LayoutDashboard aria-hidden="true" />编辑模块</button>
              <button type="button" onClick={() => setOwnerInspectorTab('nodes')}><ListPlus aria-hidden="true" />新增与排序</button>
              <button type="button" onClick={() => setOwnerInspectorTab('history')}><History aria-hidden="true" />查看历史</button>
            </nav>
            {ownerInspectorTab && (
              <FactoryOwnerInspector
                key={`${selectedRegion.id}:${ownerInspectorTab}`}
                documentId={document.id}
                region={selectedRegion}
                profile={presentationSidecar.modules[selectedRegion.id]}
                factory={selectedRegionFactory}
                nodes={docNodes}
                presentationByNodeId={presentationRecord}
                initialTab={ownerInspectorTab}
                onMutation={commitDocumentMutation}
                onRestoreRevision={restoreDocumentRevision}
                onOpenNode={openDocNode}
                onClose={() => setOwnerInspectorTab(null)}
              />
            )}
          </>
        )}
      </div>

      {showRegionReader && selectedRegion && selectedRegionPresentation && (
        <>
          {layoutProfile === 'tablet' && (
            <button
              type="button"
              className="architecture-region-reader__backdrop"
              onClick={() => setDismissedReaderRegionId(selectedRegion.id)}
              aria-label="关闭房间速读"
            />
          )}
          <ArchitectureRegionReader
            region={{
              id: selectedRegion.id,
              eyebrow: roomPreview(selectedRegion, selectedRegionId, selectedRegionPresentation).eyebrow,
              title: selectedRegionPresentation.displayTitle,
              summary: selectedRegionPresentation.displaySummary,
              sourceLabels: [...selectedRegionPresentation.sourceLabels],
              previewNodeIds: selectedRegion.previewNodeIds,
            }}
            presentations={presentationRecord}
            highlightedNodeId={highlightedSearchNodeId ?? undefined}
            onEnterRoom={openRegion}
            onOpenNode={openDocNode}
            onClose={() => setDismissedReaderRegionId(selectedRegion.id)}
          />
        </>
      )}

      {selectedRelation && (
        <FactoryRelationInspector
          edge={selectedRelation}
          sourceLabel={regionPresentationById.get(selectedRelation.source)?.displayTitle
            ?? presentationByNodeId.get(selectedRelation.source)?.displayTitle
            ?? '来源节点'}
          targetLabel={regionPresentationById.get(selectedRelation.target)?.displayTitle
            ?? presentationByNodeId.get(selectedRelation.target)?.displayTitle
            ?? '目标节点'}
          onClose={() => setSelectedRelation(null)}
        />
      )}

      <MobileCanvasNavigation
        exportWorking={exportFeedback.status === 'working'}
        onSearch={() => setSearchRequest(value => value + 1)}
        onSaveView={saveCanvasState}
        onExportPng={exportPng}
        onExportMarkdown={exportMarkdown}
      />
      <MobileArchitectureView
        documentTitle={displayArchitectureTitle}
        version={displayDocumentVersion}
        floors={mobileFloors}
        relations={layout.edges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          kind: edge.kind,
          label: edge.label,
        }))}
        focused={mobileFocused}
        presentationByNodeId={presentationRecord}
        highlightedNodeId={highlightedSearchNodeId ?? undefined}
        onOpenRoom={openRegion}
        onBack={returnToOverview}
        onOpenNode={openDocNode}
      />

      {detailOpen && selectedNode && selectedNodePresentation && (
        <NodeDetailSheet
          node={selectedNode}
          presentation={selectedNodePresentation}
          displayMarkdownBlocks={documentPresentation.getDisplayMarkdown(selectedNode.id)}
          open={detailOpen}
          readOnly={!editorWritable}
          searchOrigin={selectedNodeId === searchContext?.nodeId
            ? { query: searchContext.query, sourceLabel: searchContext.sourceLabel }
            : undefined}
          onClose={() => setDetailOpen(false)}
          onMarkDeleted={async nodeId => {
            const sectionHash = metadataString(selectedNode, 'sectionHash');
            if (!editorWritable || !selectedNodeModuleId || !sectionHash) {
              throw new Error('当前节点没有可验证的模块或 section hash，无法安全删除。');
            }
            await commitDocumentMutation({
              type: 'softDeleteNode',
              moduleId: selectedNodeModuleId,
              nodeId,
              sectionHash,
            });
            setDetailOpen(false);
          }}
          onSave={async (heading, updatedContent, nodeType) => {
            const sectionHash = metadataString(selectedNode, 'sectionHash');
            if (!editorWritable || !sectionHash) {
              throw new Error('当前节点没有可验证的 section hash，无法安全保存。');
            }
            await commitDocumentMutation({
              type: 'updateNode',
              nodeId: selectedNode.id,
              sectionHash,
              title: heading,
              content: updatedContent,
              nodeType,
            });
            setDetailOpen(false);
          }}
        />
      )}

      <SearchPanel
        presentations={documentPresentation}
        regionIdByNodeId={architectureModel.nodeRegionId}
        onNavigateToResult={navigateToSearchResult}
        resumeContext={searchContext}
        openRequest={searchRequest}
      />
      <SaveIndicator status={saveStatus} lastSaved={lastSavedTime} errorMessage={saveError} />
      <ExportIndicator status={exportFeedback.status} message={exportFeedback.message} />
      </div>

    </>
  );
}
