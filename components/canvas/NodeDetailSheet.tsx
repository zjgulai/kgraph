'use client';
/**
 * NodeDetailSheet.tsx — Slide-out detail panel for editing a node's content.
 *
 * Supports: view full markdown content, edit title/content, copy Codex prompts,
 *           view tool references, and mark a section for deletion without erasing it.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, Copy, Trash2, Code2, MessageSquare, Wrench, ExternalLink, AlertTriangle } from 'lucide-react';
import type { DocNode } from '@/lib/parser/types';

interface Props {
  node: DocNode;
  open: boolean;
  onClose: () => void;
  onSave?: (heading: string, content: string) => void | Promise<void>;
  onMarkDeleted?: (nodeId: string) => void | Promise<void>;
}

export function NodeDetailSheet({ node, open, onClose, onSave, onMarkDeleted }: Props) {
  const [content, setContent] = useState(node.content);
  const [title, setTitle] = useState(node.title);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmMarkDeleted, setConfirmMarkDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  // Undo stack for content edits — use useRef for handlers to avoid re-registering listeners
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const contentRef = useRef(content);
  contentRef.current = content;

  // Reset state when a different node is opened
  useEffect(() => {
    setContent(node.content);
    setTitle(node.title);
    setSaved(false);
    setActionError('');
    setConfirmMarkDeleted(false);
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, [node.id, node.content, node.title]);

  const handleContentChange = (newContent: string) => {
    undoStackRef.current = [...undoStackRef.current.slice(-49), contentRef.current];
    redoStackRef.current = [];
    setContent(newContent);
  };

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    redoStackRef.current = [...redoStackRef.current, contentRef.current];
    const prevContent = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setContent(prevContent);
  }, []);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    undoStackRef.current = [...undoStackRef.current, contentRef.current];
    const nextContent = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    setContent(nextContent);
  }, []);

  const handleSave = useCallback(async () => {
    setBusy(true);
    setActionError('');
    try {
      await onSave?.(title, content);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '保存失败，请重试。');
    } finally {
      setBusy(false);
    }
  }, [content, onSave, title]);

  const handleMarkDeleted = useCallback(async () => {
    setBusy(true);
    setActionError('');
    try {
      await onMarkDeleted?.(node.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '标记失败，请重试。');
      setBusy(false);
    }
  }, [node.id, onMarkDeleted]);

  // Keyboard shortcuts — stable handler, registered once
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); handleRedo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo, handleSave, open]);

  if (!open) return null;

  // Adaptive textarea height: min 12, max 30 lines, or content-based
  const textareaRows = Math.max(8, Math.min(30, content.split('\n').length + 2));

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const typeColors: Record<string, string> = {
    section: 'border-indigo-500', subsection: 'border-purple-500',
    track: node.track === 'vibe' ? 'border-cyan-500' : node.track === 'pro' ? 'border-amber-500' : 'border-indigo-500',
    tool: 'border-violet-500', prompt: 'border-pink-500',
    step: 'border-emerald-500', principle: 'border-red-500',
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet — slides from right on desktop, from bottom on mobile */}
      <div className={`relative w-full sm:max-w-xl max-h-[90vh] sm:max-h-full bg-zinc-900 border-l sm:border-b-0 border-t sm:border-t-0 sm:rounded-none rounded-t-2xl ${typeColors[node.type] || 'border-zinc-700'} overflow-y-auto animate-in slide-in-from-right sm:slide-in-from-right slide-in-from-bottom sm:slide-in-from-bottom-0 duration-200 mt-auto sm:mt-0`}>
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {node.stageNumber !== undefined && node.stageNumber >= 0 && (
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400">§{node.stageNumber}</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-500">{node.type}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={busy}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${saved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}`}
            >
              <Save className="w-3.5 h-3.5 inline mr-1" />
              {busy ? '保存中' : saved ? '已保存' : '保存'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Title (editable) */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent text-lg font-semibold text-zinc-100 border-none outline-none focus:ring-0 placeholder-zinc-600"
          />
          {actionError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {actionError}
            </div>
          )}

          {/* Full content (editable) */}
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">内容 (Markdown)</label>
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              rows={textareaRows}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-300 font-mono leading-relaxed resize-y focus:outline-none focus:border-zinc-600 placeholder-zinc-700"
            />
          </div>

          {/* Structured content blocks — rich preview of code/prompts/tables/lists */}
          {node.contentBlocks && node.contentBlocks.length > 0 && (
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1.5">
                <Code2 className="w-3 h-3" /> 内容块 ({node.contentBlocks.length})
              </label>
              <div className="space-y-2">
                {node.contentBlocks.map((block, i) => (
                  <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
                    {(block.type === 'code' || block.type === 'prompt') && (
                      <>
                        <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800">
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${block.type === 'prompt' ? 'bg-pink-900/30 text-pink-400' : 'bg-zinc-800 text-zinc-400'}`}>
                            {block.type === 'prompt' ? '✦ 提示词' : block.language || 'code'}
                          </span>
                          <button
                            onClick={() => handleCopy(block.content)}
                            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                        <pre className="p-3 text-[11px] text-zinc-400 font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-36 overflow-y-auto">
                          {block.content}
                        </pre>
                      </>
                    )}
                    {block.type === 'table' && (
                      <div className="p-3 text-[11px] text-zinc-400 font-mono leading-relaxed whitespace-pre overflow-x-auto">
                        {block.content}
                      </div>
                    )}
                    {block.type === 'list' && (
                      <div className="p-3 text-[11px] text-zinc-400 font-mono leading-relaxed whitespace-pre-wrap">
                        {block.content}
                      </div>
                    )}
                    {block.type === 'paragraph' && block.content.length > 200 && (
                      <div className="p-3 text-[11px] text-zinc-500 leading-relaxed max-h-20 overflow-y-auto">
                        {block.content.slice(0, 500)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tool references */}
          {node.toolReferences && node.toolReferences.length > 0 && (
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1.5">
                <Wrench className="w-3 h-3" /> 工具引用 ({node.toolReferences.length})
              </label>
              <div className="flex flex-wrap gap-1.5">
                {node.toolReferences.map((ref, i) => (
                  <span key={i} className="text-[11px] px-2 py-1 rounded-md bg-violet-900/30 text-violet-400 border border-violet-800/50">
                    {ref.replace(/\[KB: /, '').replace(/\]/g, '').slice(0, 40)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Codex prompt blocks */}
          {node.promptTemplates && node.promptTemplates.length > 0 && (
            <div>
              <label className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" /> Codex 提示词 ({node.promptTemplates.length})
              </label>
              <div className="space-y-2">
                {node.promptTemplates.map((prompt, i) => (
                  <div key={i} className="relative group bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopy(prompt)}
                        className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <pre className="p-3 text-[11px] text-zinc-400 font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
                      {prompt}
                    </pre>
                  </div>
                ))}
                {copied && (
                  <span className="text-xs text-emerald-400">✓ 已复制到剪贴板</span>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
            {confirmMarkDeleted ? (
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs text-amber-400">
                  确认标记？
                  <span className="ml-1 text-[10px] text-zinc-500">仅从当前画布隐藏，Markdown 章节仍保留</span>
                </span>
                <button
                  onClick={handleMarkDeleted}
                  disabled={busy}
                  className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >{busy ? '处理中' : '确定'}</button>
                <button
                  onClick={() => setConfirmMarkDeleted(false)}
                  className="px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                >取消</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmMarkDeleted(true)}
                className="px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-400/10 transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3 h-3" /> 标记删除
              </button>
            )}
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <span>ID: {node.id.slice(0, 20)}…</span>
              <span>|</span>
              <span>Level {node.level}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
