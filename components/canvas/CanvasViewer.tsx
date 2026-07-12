'use client';
/**
 * CanvasViewer.tsx — Main React Flow wrapper component.
 *
 * Renders the parsed document graph as an interactive infinite canvas.
 * Supports: drag, zoom, node selection, expand/collapse branches, card detail view.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
  getNodesBounds,
  getViewportForBounds,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import { Download, FileText, Home, ImageDown, RotateCcw, Save, ShieldAlert } from 'lucide-react';
import type { DocCanvas as DocCanvasType, DocNode, CanvasState } from '@/lib/parser/types';
import { formatDisplayDate, formatDisplayInteger } from '@/lib/shared/display-format';
import {
  isDocNodeHiddenByTrack,
  removeDocNodeFromView,
  updateDocNodeAfterSave,
} from '@/lib/canvas/doc-node-state';
import { CardNode } from './CardNode';
import { NodeDetailSheet } from './NodeDetailSheet';
import { TrackToggle } from './TrackToggle';
import { SearchPanel } from './SearchPanel';
import { SaveIndicator } from './SaveIndicator';
import type { WritePolicy } from '@/lib/server/write-guard';

const nodeTypes = {
  cardNode: CardNode,
};

interface Props {
  document: DocCanvasType;
  writePolicy: WritePolicy;
}

const PNG_PIXEL_RATIO = 2;
const MAX_PNG_PIXELS = 64_000_000;

function docNodeToFlowNode(dn: DocNode): Node {
  const colors: Record<string, string> = {
    document: '#818cf8',
    section: '#6366f1',
    subsection: '#a78bfa',
    track: (dn.track === 'vibe' ? '#06b6d4' : '#f59e0b'),
    step: '#10b981',
    tool: '#8b5cf6',
    prompt: '#ec4899',
    principle: '#ef4444',
  };

  const width = dn.type === 'document' ? 380 : dn.type === 'section' ? 320 : dn.type === 'tool' || dn.type === 'prompt' ? 240 : 280;
  const height = dn.type === 'document' ? 160 : dn.level === 2 ? 140 : dn.level === 3 ? 100 : 80;

  return {
    id: dn.id,
    type: 'cardNode',
    position: dn.position,
    data: {
      title: dn.title,
      summary: dn.summary,
      type: dn.type,
      level: dn.level,
      track: dn.track,
      stageNumber: dn.stageNumber,
      toolReferences: dn.toolReferences,
      promptTemplates: dn.promptTemplates,
      contentBlocksCount: dn.contentBlocks?.length || 0,
      color: colors[dn.type] || '#71717a',
    },
    style: {
      width,
      height: Math.max(height, 60),
    },
  };
}

function docEdgeToFlowEdge(de: import('@/lib/parser/types').DocEdge): Edge {
  const trackColor = de.label?.includes('Vibe') ? '#06b6d4' : de.label?.includes('Pro') ? '#f59e0b' : '#f59e0b';
  const colors: Record<string, string> = {
    flow: '#6366f1',
    track: trackColor,
    reference: '#8b5cf6',
    expansion: '#10b981',
  };

  return {
    id: de.id,
    source: de.source,
    target: de.target,
    type: 'smoothstep',
    animated: de.animated,
    label: de.label,
    style: {
      stroke: colors[de.type] || '#71717a',
      strokeWidth: de.type === 'flow' ? 2 : de.type === 'track' ? 2 : 1.5,
      opacity: de.type === 'flow' ? 0.8 : de.type === 'track' ? 0.9 : 0.5,
    },
    labelStyle: {
      fill: '#a1a1aa',
      fontSize: 11,
      fontWeight: 500,
    },
    labelBgStyle: {
      fill: '#18181b',
      fillOpacity: 0.9,
    },
    labelBgPadding: [6, 3] as [number, number],
    labelBgBorderRadius: 4,
  };
}

function metadataString(node: DocNode, key: string): string | undefined {
  const value = node.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function isStageHeading(node: DocNode) {
  return node.metadata.isStageHeading === true;
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

export default function CanvasViewer({ document, writePolicy }: Props) {
  const [docNodes, setDocNodes] = useState<DocNode[]>(() => document.nodes);
  const [nodes, setNodes, onNodesChange] = useNodesState(document.nodes.map(docNodeToFlowNode));
  const [edges, setEdges, onEdgesChange] = useEdgesState(document.edges.map(docEdgeToFlowEdge));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeStage, setActiveStage] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState('');
  const [saveError, setSaveError] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const { fitView, getViewport, setViewport } = useReactFlow();
  const selectedNode = useMemo(
    () => docNodes.find(node => node.id === selectedNodeId) ?? null,
    [docNodes, selectedNodeId],
  );

  // Track toggle state — expanded by default
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(() => {
    const all = new Set<string>();
    for (let s = 1; s <= 8; s++) { all.add(`stage${s}-vibe`); all.add(`stage${s}-pro`); }
    return all;
  });
  const previousExpandedTracksRef = useRef(expandedTracks);

  // Restore canvas state from server + localStorage on mount
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      // Try server first
      try {
        const resp = await fetch(`/api/canvas-state?documentId=${document.id}`);
        if (resp.ok) {
          const state: CanvasState = await resp.json();
          if (state.nodePositions && Object.keys(state.nodePositions).length > 0) {
            if (cancelled) return;
            setNodes(prev => prev.map(n => ({
              ...n,
              position: state.nodePositions[n.id] || n.position,
            })));
            if (state.viewport) setViewport(state.viewport);
            return; // server state is more authoritative
          }
        }
      } catch { /* server unavailable — fall through to localStorage */ }

      // Fallback: localStorage
      try {
        const saved = localStorage.getItem(`doccas-${document.id}`);
        if (saved) {
          const state: CanvasState = JSON.parse(saved);
          if (state.nodePositions) {
            if (cancelled) return;
            setNodes(prev => prev.map(n => ({
              ...n,
              position: state.nodePositions[n.id] || n.position,
            })));
            if (state.viewport) setViewport(state.viewport);
          }
        }
      } catch {}
    };
    restore();
    return () => { cancelled = true; };
  }, [document.id, setNodes, setViewport]);

  // Reset canonical graph state only when the server-provided document changes.
  useEffect(() => {
    setDocNodes(document.nodes);
    setEdges(document.edges.map(docEdgeToFlowEdge));
    setSelectedNodeId(null);
    setDetailOpen(false);
  }, [document.id, document.nodes, document.edges, setEdges]);

  // Project canonical DocNodes into React Flow while preserving local positions/selection.
  useEffect(() => {
    setNodes(previous => {
      const priorById = new Map(previous.map(node => [node.id, node]));
      return docNodes.map(docNode => {
        const projected = docNodeToFlowNode(docNode);
        const prior = priorById.get(docNode.id);
        return prior ? {
          ...projected,
          position: prior.position,
          selected: prior.selected,
          hidden: prior.hidden,
        } : projected;
      });
    });
  }, [docNodes, setNodes]);

  // When expandedTracks changes, hide/show the corresponding track nodes AND their edges
  useEffect(() => {
    const hiddenNodeIds = new Set<string>();
    setNodes(prev => prev.map(n => {
      const dn = docNodes.find(d => d.id === n.id);
      if (!dn) return n;
      const hidden = isDocNodeHiddenByTrack(dn, expandedTracks);
      if (hidden) hiddenNodeIds.add(n.id);
      return { ...n, hidden };
    }));
    // Also hide edges connected to hidden track nodes
    setEdges(prev => prev.map(e => ({
      ...e,
      hidden: hiddenNodeIds.has(e.source) || hiddenNodeIds.has(e.target),
    })));
  }, [expandedTracks, docNodes, setNodes, setEdges]);

  // Re-fit only after an explicit track-toggle state change, never on mount or node saves.
  useEffect(() => {
    if (previousExpandedTracksRef.current === expandedTracks) return;
    previousExpandedTracksRef.current = expandedTracks;
    const timeout = setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 400);
    return () => clearTimeout(timeout);
  }, [expandedTracks, fitView]);

  // Node click handler — skip hidden nodes
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.hidden) return; // don't open detail for track-collapsed nodes
    const docNode = docNodes.find(n => n.id === node.id);
    if (docNode) {
      setSelectedNodeId(docNode.id);
      setDetailOpen(true);
    }
  }, [docNodes]);

  // Save canvas state with retry + localStorage fallback
  const saveCanvasState = useCallback(async () => {
    const state: CanvasState = {
      documentId: document.id,
      viewport: getViewport(),
      expandedNodes: nodes.filter(n => !n.hidden).map(n => n.id),
      nodePositions: Object.fromEntries(nodes.map(n => [n.id, n.position])),
      lastSaved: new Date().toISOString(),
    };

    // localStorage fallback — always succeeds
    try { localStorage.setItem(`doccas-${document.id}`, JSON.stringify(state)); } catch {}

    if (!writePolicy.writable) {
      setSaveStatus('saved');
      setLastSavedTime(new Date().toISOString());
      setSaveError('');
      return;
    }

    // Server persist with retry
    setSaveStatus('saving');
    let success = false;
    for (let attempt = 0; attempt < 3 && !success; attempt++) {
      try {
        const token = sessionStorage.getItem('doccanvas-admin-token') || '';
        const resp = await fetch('/api/canvas-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { 'X-DocCanvas-Token': token } : {}) },
          body: JSON.stringify(state),
        });
        if (!resp.ok) throw new Error(await resp.text());
        success = true;
      } catch (error) {
        if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        if (attempt === 2) setSaveError(error instanceof Error ? error.message : '保存失败。');
      }
    }
    if (success) {
      setSaveStatus('saved');
      setLastSavedTime(new Date().toISOString());
    } else {
      setSaveStatus('error');
      setSaveError('无法保存到服务器。状态已保存在浏览器本地。');
    }
  }, [document.id, getViewport, nodes, writePolicy.writable]);

  const exportMarkdown = useCallback(() => {
    window.location.href = `/api/export/markdown?documentId=${document.id}`;
  }, [document.id]);

  const exportPng = useCallback(async () => {
    setExportStatus('正在导出 PNG...');
    try {
      const viewportEl = window.document.querySelector('.react-flow__viewport') as HTMLElement | null;
      if (!viewportEl) throw new Error('未找到画布视图。');

      const visibleNodes = nodes.filter(n => !n.hidden);
      if (visibleNodes.length === 0) throw new Error('当前没有可导出的节点。');

      const bounds = getNodesBounds(visibleNodes);
      const imageWidth = Math.ceil(bounds.width + 240);
      const imageHeight = Math.ceil(bounds.height + 240);
      const renderedPixels = imageWidth * imageHeight * PNG_PIXEL_RATIO * PNG_PIXEL_RATIO;
      if (renderedPixels > MAX_PNG_PIXELS) {
        throw new Error('画布尺寸过大，请先折叠部分轨道后再导出。');
      }

      const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.1, 2, 0.08);
      const dataUrl = await toPng(viewportEl, {
        backgroundColor: '#0a0a0f',
        width: imageWidth,
        height: imageHeight,
        pixelRatio: PNG_PIXEL_RATIO,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      });
      const link = window.document.createElement('a');
      link.download = `${document.id}-canvas.png`;
      link.href = dataUrl;
      link.click();
      setExportStatus('PNG 已导出。');
      window.setTimeout(() => setExportStatus(''), 2200);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'PNG 导出未完成。');
    }
  }, [document.id, nodes]);

  const stageNodesByNumber = useMemo(() => {
    return docNodes.reduce<Record<number, DocNode>>((acc, node) => {
      if (isStageHeading(node) && node.stageNumber !== undefined) {
        acc[node.stageNumber] = node;
      }
      return acc;
    }, {});
  }, [docNodes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && detailOpen) { setDetailOpen(false); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        if (!detailOpen) { e.preventDefault(); saveCanvasState(); }
        return; // if detailOpen, let the browser handle textarea save
      }
      if (e.key === 'f' && !e.metaKey && !e.ctrlKey) { fitView({ padding: 0.3, duration: 300 }); return; }
      if (e.key === '0' && !e.metaKey) { fitView({ padding: 0.3, duration: 300 }); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [detailOpen, fitView, saveCanvasState]);

  // Window resize → re-fit
  useEffect(() => {
    const handler = () => { fitView({ padding: 0.3, duration: 200 }); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [fitView]);

  return (
    <div className="w-full h-[100dvh] bg-zinc-950">
      <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDragStop={saveCanvasState}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.1}
          maxZoom={2}
          defaultViewport={{ x: 200, y: 50, zoom: 0.6 }}
          snapToGrid
          snapGrid={[20, 20]}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#27272a" />
          <Controls className="!hidden sm:!flex !bg-zinc-900 !border-zinc-700 !text-zinc-300" />
          <MiniMap
            nodeStrokeWidth={2}
            nodeColor={(n) => (n.data as any)?.color || '#71717a'}
            maskColor="rgba(0,0,0,0.7)"
            className="!hidden sm:!block !bg-zinc-900 !border-zinc-700"
          />

          <Panel position="top-right" className="!top-auto !bottom-3 sm:!top-4 sm:!bottom-auto flex max-w-[calc(100vw-1rem)] flex-wrap items-center justify-end gap-2 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/92 p-2 shadow-xl backdrop-blur sm:overflow-visible">
            <Link href="/" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800" aria-label="返回工作台">
              <Home className="h-3.5 w-3.5" />
              工作台
            </Link>
            <button
              onClick={() => fitView({ padding: 0.3, duration: 300 })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
              aria-label="重置视图"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              视图
            </button>
            <button
              onClick={saveCanvasState}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
              aria-label="保存画布状态"
            >
              <Save className="h-3.5 w-3.5" />
              保存
            </button>
            <button
              onClick={exportPng}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
              aria-label="导出 PNG"
            >
              <ImageDown className="h-3.5 w-3.5" />
              PNG
            </button>
            <button
              onClick={exportMarkdown}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
              aria-label="导出 Markdown"
            >
              <Download className="h-3.5 w-3.5" />
              Markdown
            </button>
          </Panel>

          {/* Info panel */}
          <Panel position="top-left" className="max-w-[calc(100vw-2rem)] bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-lg px-4 py-3 text-sm sm:max-w-xs">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-3.5 w-3.5 text-indigo-300" />
              <span className="font-semibold text-zinc-200 truncate">{document.title}</span>
            </div>
            <div className="text-zinc-500 text-xs space-y-0.5">
              <div>{Object.keys(stageNodesByNumber).length} 个阶段 · {docNodes.length} 个节点 · {document.edges.filter(e => e.type === 'flow').length} 条主干连线</div>
              <div>轨道: Vibe / Pro · {document.edges.filter(e => e.type === 'expansion' || e.type === 'reference').length} 个工具引用</div>
              {(document as any)._file && (
                <div className="text-zinc-600 mt-1 pt-1 border-t border-zinc-800">
                  文件: {formatDisplayDate((document as any)._file.mtime)} · {formatDisplayInteger((document as any)._file.bytes)} 字符
                </div>
              )}
              <div className="text-zinc-600">
                <kbd className="text-[10px] px-1 py-0.5 rounded bg-zinc-800 font-mono">Ctrl+K</kbd> 搜索 · <kbd className="text-[10px] px-1 py-0.5 rounded bg-zinc-800 font-mono">0</kbd> 重置视图
              </div>
              {exportStatus && (
                <div className="mt-1 flex items-start gap-1.5 text-indigo-300">
                  <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{exportStatus}</span>
                </div>
              )}
            </div>
          </Panel>

          {/* Stage navigator */}
          <Panel position="top-center" className="hidden gap-1.5 sm:flex">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(stage => {
              const stageNode = stageNodesByNumber[stage];
              const hasContent = stageNode !== undefined;
              const labels: Record<number, string> = { [0]: '⓪', 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤', 6: '⑥', 7: '⑦', 8: '⑧' };
              return (
                <button
                  key={stage}
                  disabled={!hasContent}
                  onClick={() => {
                    if (stageNode) {
                      const targetNode = nodes.find(n => n.id === stageNode.id);
                      if (targetNode) {
                        setActiveStage(stage);
                        setNodes(nds => nds.map(n => ({ ...n, selected: n.id === targetNode.id })));
                        fitView({ nodes: [{ id: targetNode.id }], duration: 400, padding: 0.4 });
                      }
                    }
                  }}
                  className={`w-8 h-8 rounded-full text-xs font-medium transition-all
                    ${activeStage === stage
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30 scale-110'
                      : hasContent
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer'
                        : 'bg-zinc-900 text-zinc-700 cursor-default'}`}
                >
                  {labels[stage] || stage}
                </button>
              );
            })}
          </Panel>
          <Panel position="bottom-left" className="hidden sm:block">
            <TrackToggle
              nodes={docNodes}
              stageNodes={docNodes.filter(isStageHeading)}
              expandedTracks={expandedTracks}
              onToggleTrack={(trackId) => {
                if (trackId === 'all-expand') {
                  const all = new Set<string>();
                  for (let s = 1; s <= 8; s++) { all.add(`stage${s}-vibe`); all.add(`stage${s}-pro`); }
                  setExpandedTracks(all);
                } else if (trackId === 'all-collapse') {
                  setExpandedTracks(new Set());
                } else {
                  setExpandedTracks(prev => {
                    const next = new Set(prev);
                    next.has(trackId) ? next.delete(trackId) : next.add(trackId);
                    return next;
                  });
                }
              }}
            />
          </Panel>
        </ReactFlow>

      {selectedNode && (
        <NodeDetailSheet
          node={selectedNode}
          open={detailOpen}
          readOnly={!writePolicy.writable}
          onClose={() => setDetailOpen(false)}
          onMarkDeleted={async (nodeId: string) => {
            if (!writePolicy.writable) return;
            // Mark and hide from this view; preserve the Markdown section for recovery.
            const recoveryContent = `[SOFT-DELETED: ${selectedNode.title}]\n\n> 此节点已通过 DocCanvas 画布标记为删除。如需恢复，删除本段并重新加载画布。\n\n${selectedNode.content}`;
            const token = sessionStorage.getItem('doccanvas-admin-token') || '';
            const resp = await fetch('/api/documents', {
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
            if (!resp.ok) {
              const message = await responseMessage(resp);
              setSaveStatus('error');
              setSaveError(message);
              throw new Error(message);
            }
            setDocNodes(prev => removeDocNodeFromView(prev, nodeId));
            setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
            setSelectedNodeId(null);
            setSaveStatus('saved');
            setLastSavedTime(new Date().toISOString());
            setDetailOpen(false);
          }}
          onSave={async (heading: string, updatedContent: string) => {
            if (!writePolicy.writable) return;
            setSaveStatus('saving');
            const token = sessionStorage.getItem('doccanvas-admin-token') || '';
            const resp = await fetch('/api/documents', {
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
            if (!resp.ok) {
              const message = await responseMessage(resp);
              setSaveStatus('error');
              setSaveError(message);
              throw new Error(message);
            }
            const result = await resp.json().catch(() => ({}));

            setDocNodes(prev => updateDocNodeAfterSave(prev, {
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

      <SearchPanel
        nodes={docNodes}
        onNavigateToNode={(nodeId) => {
          const targetNode = nodes.find(n => n.id === nodeId);
          if (targetNode) {
            setNodes(nds => nds.map(n => ({ ...n, selected: n.id === nodeId })));
            fitView({ nodes: [{ id: nodeId }], duration: 400, padding: 0.4 });
            // Auto-open detail sheet for search results
            const docNode = docNodes.find(dn => dn.id === nodeId);
            if (docNode) { setSelectedNodeId(docNode.id); setDetailOpen(true); }
          }
        }}
      />

      <SaveIndicator
        status={saveStatus}
        lastSaved={lastSavedTime}
        errorMessage={saveError}
      />
    </div>
  );
}
