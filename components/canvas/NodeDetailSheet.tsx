'use client';
/**
 * NodeDetailSheet.tsx — Slide-out detail panel for editing a node's content.
 *
 * Supports: view full markdown content, edit title/content, copy Codex prompts,
 *           view tool references, and mark a section for deletion without erasing it.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, Copy, Trash2, Code2, MessageSquare, Wrench, AlertTriangle, Lock } from 'lucide-react';
import type { DocNode } from '@/lib/parser/types';

interface Props {
  node: DocNode;
  open: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSave?: (heading: string, content: string) => void | Promise<void>;
  onMarkDeleted?: (nodeId: string) => void | Promise<void>;
}

export function NodeDetailSheet({ node, open, readOnly = false, onClose, onSave, onMarkDeleted }: Props) {
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
    if (readOnly) return;
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
  }, [content, onSave, readOnly, title]);

  const handleMarkDeleted = useCallback(async () => {
    if (readOnly) return;
    setBusy(true);
    setActionError('');
    try {
      await onMarkDeleted?.(node.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '标记失败，请重试。');
      setBusy(false);
    }
  }, [node.id, onMarkDeleted, readOnly]);

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

  const trackChipClass = node.track === 'vibe'
    ? 'bg-[#E5F3F0] text-[#147D78]'
    : node.track === 'pro'
      ? 'bg-[#F8EEDC] text-[#9A5B12]'
      : 'bg-[#ECEEF7] text-[#4F5F9B]';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <button className="absolute inset-0 h-full w-full cursor-default bg-[#182019]/25" onClick={onClose} aria-label="关闭节点详情" />

      {/* Sheet — slides from right on desktop, from bottom on mobile */}
      <div className="relative mt-auto max-h-[90vh] w-full overflow-y-auto rounded-t-xl border-l border-t border-[#D5DFD0] bg-white shadow-[-12px_0_36px_rgba(24,32,25,0.12)] animate-in slide-in-from-right slide-in-from-bottom duration-200 sm:mt-0 sm:max-h-full sm:max-w-xl sm:rounded-none sm:border-b-0 sm:border-t-0 sm:slide-in-from-bottom-0 sm:slide-in-from-right">
        {/* Header */}
        <div className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-[#D5DFD0] bg-white px-5 py-2">
          <div className="flex items-center gap-2 min-w-0">
            {node.stageNumber !== undefined && node.stageNumber >= 0 && (
              <span className="rounded border border-[#D5DFD0] bg-[#F8FBF2] px-2 py-0.5 font-mono text-xs text-[#526053]">§{node.stageNumber}</span>
            )}
            <span className="rounded bg-[#EEF2EA] px-2 py-0.5 text-xs text-[#526053]">{node.type}</span>
            {node.track && <span className={`rounded px-2 py-0.5 text-xs font-semibold ${trackChipClass}`}>{node.track === 'both' ? 'Shared' : node.track}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={busy || readOnly}
              className={`min-h-11 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${saved ? 'bg-[#EAF3E8] text-[#2D6B47]' : 'bg-[#EEF2EA] text-[#526053] hover:bg-[#E2E9DD] hover:text-[#182019]'}`}
            >
              {readOnly ? <Lock className="w-3.5 h-3.5 inline mr-1" /> : <Save className="w-3.5 h-3.5 inline mr-1" />}
              {readOnly ? '只读' : busy ? '保存中' : saved ? '已保存' : '保存'}
            </button>
            <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-md text-[#637064] hover:bg-[#F0F5EB] hover:text-[#182019]" aria-label="关闭节点详情">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Title (editable) */}
          <input
            value={title}
            readOnly={readOnly}
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-11 w-full border-none bg-transparent text-lg font-semibold text-[#182019] outline-none placeholder:text-[#637064] focus:ring-0 read-only:cursor-default"
          />
          {actionError && (
            <div className="rounded-md border border-[#E5C4BD] bg-[#FFF4F1] px-3 py-2 text-xs text-[#A23E3E]">
              {actionError}
            </div>
          )}

          {/* Full content (editable) */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#637064]">内容 (Markdown)</label>
            <textarea
              value={content}
              readOnly={readOnly}
              onChange={(e) => handleContentChange(e.target.value)}
              rows={textareaRows}
              className="w-full resize-y rounded-md border border-[#C8D3C3] bg-[#F8FBF2] px-3 py-2.5 font-mono text-sm leading-relaxed text-[#263128] placeholder:text-[#637064] focus:border-[#4F5F9B] focus:outline-none read-only:cursor-default read-only:bg-[#F3F6F0]"
            />
          </div>

          {/* Structured content blocks — rich preview of code/prompts/tables/lists */}
          {node.contentBlocks && node.contentBlocks.length > 0 && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#637064]">
                <Code2 className="w-3 h-3" /> 内容块 ({node.contentBlocks.length})
              </label>
              <div className="space-y-2">
                {node.contentBlocks.map((block, i) => (
                  <div key={i} className="overflow-hidden rounded-md border border-[#D5DFD0] bg-[#F8FBF2]">
                    {(block.type === 'code' || block.type === 'prompt') && (
                      <>
                        <div className="flex items-center justify-between border-b border-[#D5DFD0] bg-white px-3 py-1.5">
                          <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${block.type === 'prompt' ? 'bg-[#ECEEF7] text-[#4F5F9B]' : 'bg-[#EEF2EA] text-[#526053]'}`}>
                            {block.type === 'prompt' ? '提示词' : block.language || 'code'}
                          </span>
                          <button
                            onClick={() => handleCopy(block.content)}
                            className="flex h-11 w-11 items-center justify-center rounded text-[#637064] transition-colors hover:bg-[#F0F5EB] hover:text-[#182019]"
                            aria-label="复制内容块"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                        <pre className="max-h-36 overflow-x-auto overflow-y-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-[#3C493D]">
                          {block.content}
                        </pre>
                      </>
                    )}
                    {block.type === 'table' && (
                      <div className="overflow-x-auto whitespace-pre p-3 font-mono text-[11px] leading-relaxed text-[#3C493D]">
                        {block.content}
                      </div>
                    )}
                    {block.type === 'list' && (
                      <div className="whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-[#3C493D]">
                        {block.content}
                      </div>
                    )}
                    {block.type === 'paragraph' && block.content.length > 200 && (
                      <div className="max-h-20 overflow-y-auto p-3 text-[11px] leading-relaxed text-[#637064]">
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
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#637064]">
                <Wrench className="w-3 h-3" /> 工具引用 ({node.toolReferences.length})
              </label>
              <div className="flex flex-wrap gap-1.5">
                {node.toolReferences.map((ref, i) => (
                  <span key={i} className="rounded border border-[#D5DFD0] bg-[#F8FBF2] px-2 py-1 text-[11px] text-[#526053]">
                    {ref.replace(/\[KB: /, '').replace(/\]/g, '').slice(0, 40)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Codex prompt blocks */}
          {node.promptTemplates && node.promptTemplates.length > 0 && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#637064]">
                <MessageSquare className="w-3 h-3" /> Codex 提示词 ({node.promptTemplates.length})
              </label>
              <div className="space-y-2">
                {node.promptTemplates.map((prompt, i) => (
                  <div key={i} className="group relative overflow-hidden rounded-md border border-[#D5DFD0] bg-[#F8FBF2]">
                    <div className="absolute right-1.5 top-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        onClick={() => handleCopy(prompt)}
                        className="flex h-11 w-11 items-center justify-center rounded border border-[#D5DFD0] bg-white text-[#637064] hover:bg-[#F0F5EB] hover:text-[#182019]"
                        aria-label="复制 Codex 提示词"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <pre className="max-h-48 overflow-x-auto overflow-y-auto whitespace-pre-wrap p-3 pr-14 font-mono text-[11px] leading-relaxed text-[#3C493D]">
                      {prompt}
                    </pre>
                  </div>
                ))}
                {copied && (
                  <span className="text-xs font-medium text-[#2D6B47]">已复制到剪贴板</span>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#D5DFD0] pt-3">
            {readOnly ? (
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#637064]">
                <Lock className="h-3.5 w-3.5" /> 生产只读
              </div>
            ) : confirmMarkDeleted ? (
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-[#9A5B12]" />
                <span className="text-xs text-[#9A5B12]">
                  确认标记？
                  <span className="ml-1 text-[10px] text-[#637064]">仅从当前画布隐藏，Markdown 章节仍保留</span>
                </span>
                <button
                  onClick={handleMarkDeleted}
                  disabled={busy}
                  className="min-h-11 rounded bg-[#FAECE8] px-3 py-1 text-xs font-semibold text-[#A23E3E] hover:bg-[#F4DED8] disabled:cursor-not-allowed disabled:opacity-60"
                >{busy ? '处理中' : '确定'}</button>
                <button
                  onClick={() => setConfirmMarkDeleted(false)}
                  className="min-h-11 rounded bg-[#EEF2EA] px-3 py-1 text-xs font-semibold text-[#526053] hover:bg-[#E2E9DD]"
                >取消</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmMarkDeleted(true)}
                className="flex min-h-11 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-[#A23E3E] transition-colors hover:bg-[#FAECE8]"
              >
                <Trash2 className="w-3 h-3" /> 标记删除
              </button>
            )}
            <div className="flex items-center gap-2 text-xs text-[#637064]">
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
