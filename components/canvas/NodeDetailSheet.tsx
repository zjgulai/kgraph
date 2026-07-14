'use client';
/**
 * NodeDetailSheet.tsx — productized Markdown reader with an explicit raw-source
 * edit mode for owners. Source bytes remain untouched for save and copy paths.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, Copy, Trash2, Code2, MessageSquare, Wrench, AlertTriangle, Lock } from 'lucide-react';
import { SafeMarkdown } from '@/components/canvas/SafeMarkdown';
import { cleanPresentationCode, cleanPresentationText } from '@/lib/canvas/presentation-text';
import type { NodePresentation, PresentationBadge } from '@/lib/canvas/document-presentation';
import type { MarkdownBlockNode } from '@/lib/markdown/presentation';
import type { DocNode } from '@/lib/parser/types';

interface Props {
  node: DocNode;
  presentation: NodePresentation;
  displayMarkdownBlocks: readonly MarkdownBlockNode[];
  open: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSave?: (heading: string, content: string) => void | Promise<void>;
  onMarkDeleted?: (nodeId: string) => void | Promise<void>;
}

function badgeClass(badge: PresentationBadge): string {
  if (badge.kind === 'track' && badge.label === 'Vibe') return 'bg-[#E5F3F0] text-[#147D78]';
  if (badge.kind === 'track' && badge.label === 'Pro') return 'bg-[#F8EEDC] text-[#9A5B12]';
  if (badge.kind === 'track') return 'bg-[#ECEEF7] text-[#4F5F9B]';
  return 'border border-[#D5DFD0] bg-[#F8FBF2] text-[#526053]';
}

function visibleCode(value: string): string {
  return cleanPresentationCode(value);
}

function visibleReference(value: string): string {
  return cleanPresentationText(value.replace(/\[KB:\s*/u, '').replace(/\]/gu, ''));
}

export function NodeDetailSheet({
  node,
  presentation,
  displayMarkdownBlocks,
  open,
  readOnly = false,
  onClose,
  onSave,
  onMarkDeleted,
}: Props) {
  const [activeTab, setActiveTab] = useState<'read' | 'edit'>('read');
  const [content, setContent] = useState(node.content);
  const [title, setTitle] = useState(node.title);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmMarkDeleted, setConfirmMarkDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    setContent(node.content);
    setTitle(node.title);
    setActiveTab('read');
    setSaved(false);
    setActionError('');
    setConfirmMarkDeleted(false);
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, [node.id, node.content, node.title]);

  useEffect(() => {
    if (readOnly) setActiveTab('read');
  }, [readOnly]);

  useEffect(() => {
    if (open) setActiveTab('read');
  }, [node.id, open]);

  const visibleTab = readOnly ? 'read' : activeTab;

  const handleContentChange = (newContent: string) => {
    undoStackRef.current = [...undoStackRef.current.slice(-49), contentRef.current];
    redoStackRef.current = [];
    setContent(newContent);
  };

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    redoStackRef.current = [...redoStackRef.current, contentRef.current];
    const previousContent = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setContent(previousContent);
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
    if (activeTab !== 'edit') return;
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
  }, [activeTab, content, onSave, readOnly, title]);

  const handleMarkDeleted = useCallback(async () => {
    if (readOnly) return;
    if (activeTab !== 'edit') return;
    setBusy(true);
    setActionError('');
    try {
      await onMarkDeleted?.(node.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '标记失败，请重试。');
      setBusy(false);
    }
  }, [activeTab, node.id, onMarkDeleted, readOnly]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!open || readOnly || activeTab !== 'edit') return;
      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && event.shiftKey) {
        event.preventDefault();
        handleRedo();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTab, handleRedo, handleSave, handleUndo, open, readOnly]);

  if (!open) return null;

  const textareaRows = Math.max(8, Math.min(30, content.split('\n').length + 2));

  const handleCopy = async (rawText: string) => {
    await navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyableBlocks = node.contentBlocks.filter(block => block.type === 'code' || block.type === 'prompt');

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button className="absolute inset-0 h-full w-full cursor-default bg-[#182019]/25" onClick={onClose} aria-label="关闭节点详情" />

      <section
        aria-label={presentation.accessibleLabel}
        className="relative mt-auto max-h-[90vh] w-full overflow-y-auto rounded-t-xl border-l border-t border-[#D5DFD0] bg-white shadow-[-12px_0_36px_rgba(24,32,25,0.12)] animate-in slide-in-from-right slide-in-from-bottom duration-200 sm:mt-0 sm:max-h-full sm:max-w-xl sm:rounded-none sm:border-b-0 sm:border-t-0 sm:slide-in-from-bottom-0 sm:slide-in-from-right"
      >
        <div className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-[#D5DFD0] bg-white px-5 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {presentation.badges.map(badge => (
              <span key={`${badge.kind}-${badge.label}`} className={`rounded px-2 py-0.5 text-xs font-semibold ${badgeClass(badge)}`}>
                {badge.label}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {readOnly ? (
              <span className="inline-flex min-h-11 items-center gap-1.5 px-2 text-xs font-semibold text-[#637064]">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />只读
              </span>
            ) : visibleTab === 'edit' ? (
              <button
                onClick={handleSave}
                disabled={busy || readOnly}
                className={`min-h-11 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${saved ? 'bg-[#EAF3E8] text-[#2D6B47]' : 'bg-[#EEF2EA] text-[#526053] hover:bg-[#E2E9DD] hover:text-[#182019]'}`}
              >
                <Save className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                {busy ? '保存中' : saved ? '已保存' : '保存'}
              </button>
            ) : null}
            <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-md text-[#637064] hover:bg-[#F0F5EB] hover:text-[#182019]" aria-label="关闭节点详情">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5 py-4">
          <header>
            <h2 className="text-xl font-semibold leading-snug text-[#182019]">{presentation.displayTitle}</h2>
            <p className="mt-1 text-xs text-[#637064]">来源章节：{presentation.sourceLabel}</p>
          </header>

          {!readOnly && (
            <div className="flex gap-1 rounded-lg border border-[#D5DFD0] bg-[#F8FBF2] p-1" role="tablist" aria-label="详情模式">
              <button
                type="button"
                role="tab"
                aria-selected={visibleTab === 'read'}
                onClick={() => setActiveTab('read')}
                className={`min-h-11 flex-1 rounded-md px-3 text-sm font-medium ${visibleTab === 'read' ? 'bg-white text-[#182019] shadow-sm' : 'text-[#637064] hover:text-[#182019]'}`}
              >
                阅读
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={visibleTab === 'edit'}
                onClick={() => setActiveTab('edit')}
                className={`min-h-11 flex-1 rounded-md px-3 text-sm font-medium ${visibleTab === 'edit' ? 'bg-white text-[#182019] shadow-sm' : 'text-[#637064] hover:text-[#182019]'}`}
              >
                编辑 Markdown
              </button>
            </div>
          )}

          {actionError && (
            <div className="rounded-md border border-[#E5C4BD] bg-[#FFF4F1] px-3 py-2 text-xs text-[#A23E3E]">
              {cleanPresentationText(actionError)}
            </div>
          )}

          {!readOnly && activeTab === 'edit' ? (
            <div className="space-y-4" role="tabpanel" aria-label="编辑 Markdown">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#637064]" htmlFor="node-source-title">原始章节标题</label>
                <input
                  id="node-source-title"
                  value={title}
                  readOnly={readOnly}
                  onChange={event => setTitle(event.target.value)}
                  className="min-h-11 w-full rounded-md border border-[#C8D3C3] bg-white px-3 text-sm font-semibold text-[#182019] outline-none focus:border-[#4F5F9B]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#637064]" htmlFor="node-source-content">原始内容 (Markdown)</label>
                <textarea
                  id="node-source-content"
                  value={content}
                  readOnly={readOnly}
                  onChange={event => handleContentChange(event.target.value)}
                  rows={textareaRows}
                  className="w-full resize-y rounded-md border border-[#C8D3C3] bg-[#F8FBF2] px-3 py-2.5 font-mono text-sm leading-relaxed text-[#263128] placeholder:text-[#637064] focus:border-[#4F5F9B] focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-5" role="tabpanel" aria-label="阅读">
              {presentation.displaySummary && (
                <p className="rounded-md border border-[#D5DFD0] bg-[#F8FBF2] px-3 py-2 text-sm leading-relaxed text-[#526053]">
                  {presentation.displaySummary}
                </p>
              )}
              <SafeMarkdown blocks={displayMarkdownBlocks} className="node-detail-markdown" />

              {copyableBlocks.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#637064]">
                    <Code2 className="h-3 w-3" aria-hidden="true" /> 可复制内容 ({copyableBlocks.length})
                  </div>
                  <div className="space-y-2">
                    {copyableBlocks.map((block, index) => (
                      <div key={`${block.type}-${index}`} className="overflow-hidden rounded-md border border-[#D5DFD0] bg-[#F8FBF2]">
                        <div className="flex items-center justify-between border-b border-[#D5DFD0] bg-white px-3 py-1.5">
                          <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${block.type === 'prompt' ? 'bg-[#ECEEF7] text-[#4F5F9B]' : 'bg-[#EEF2EA] text-[#526053]'}`}>
                            {block.type === 'prompt' ? '提示词' : cleanPresentationText(block.language) || 'code'}
                          </span>
                          <button onClick={() => handleCopy(block.content)} className="flex h-11 w-11 items-center justify-center rounded text-[#637064] hover:bg-[#F0F5EB] hover:text-[#182019]" aria-label="复制内容块">
                            <Copy className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                        {block.type === 'prompt' ? (
                          <SafeMarkdown markdown={block.content} className="max-h-48 overflow-auto p-3 text-sm leading-relaxed text-[#3C493D]" />
                        ) : (
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-[#3C493D]">{visibleCode(block.content)}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {node.toolReferences && node.toolReferences.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#637064]">
                    <Wrench className="h-3 w-3" aria-hidden="true" /> 工具引用 ({node.toolReferences.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {node.toolReferences.map((reference, index) => (
                      <span key={index} className="rounded border border-[#D5DFD0] bg-[#F8FBF2] px-2 py-1 text-[11px] text-[#526053]">
                        {visibleReference(reference)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {node.promptTemplates && node.promptTemplates.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#637064]">
                    <MessageSquare className="h-3 w-3" aria-hidden="true" /> Codex 提示词 ({node.promptTemplates.length})
                  </div>
                  <div className="space-y-2">
                    {node.promptTemplates.map((prompt, index) => (
                      <div key={index} className="group relative overflow-hidden rounded-md border border-[#D5DFD0] bg-[#F8FBF2]">
                        <div className="absolute right-1.5 top-1.5">
                          <button onClick={() => handleCopy(prompt)} className="flex h-11 w-11 items-center justify-center rounded border border-[#D5DFD0] bg-white text-[#637064] hover:bg-[#F0F5EB] hover:text-[#182019]" aria-label="复制 Codex 提示词">
                            <Copy className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                        <SafeMarkdown markdown={prompt} className="max-h-48 overflow-auto p-3 pr-14 text-sm leading-relaxed text-[#3C493D]" />
                      </div>
                    ))}
                    {copied && <span className="text-xs font-medium text-[#2D6B47]">已复制到剪贴板</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#D5DFD0] pt-3">
            {readOnly ? (
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#637064]">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" /> 生产只读
              </div>
            ) : activeTab === 'edit' && confirmMarkDeleted ? (
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-[#9A5B12]" aria-hidden="true" />
                <span className="text-xs text-[#9A5B12]">确认标记？<span className="ml-1 text-[10px] text-[#637064]">仅从当前画布隐藏，Markdown 章节仍保留</span></span>
                <button onClick={handleMarkDeleted} disabled={busy} className="min-h-11 rounded bg-[#FAECE8] px-3 py-1 text-xs font-semibold text-[#A23E3E] hover:bg-[#F4DED8] disabled:cursor-not-allowed disabled:opacity-60">{busy ? '处理中' : '确定'}</button>
                <button onClick={() => setConfirmMarkDeleted(false)} className="min-h-11 rounded bg-[#EEF2EA] px-3 py-1 text-xs font-semibold text-[#526053] hover:bg-[#E2E9DD]">取消</button>
              </div>
            ) : activeTab === 'edit' ? (
              <button onClick={() => setConfirmMarkDeleted(true)} className="flex min-h-11 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-[#A23E3E] hover:bg-[#FAECE8]">
                <Trash2 className="h-3 w-3" aria-hidden="true" /> 标记删除
              </button>
            ) : <span />}
            <div className="flex items-center gap-2 text-xs text-[#637064]">
              <span>ID: {node.id.slice(0, 20)}…</span>
              <span>|</span>
              <span>Level {node.level}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
