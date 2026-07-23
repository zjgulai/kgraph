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
import type { InsertableNodeType } from '@/lib/canvas/document-mutation-types';

interface Props {
  node: DocNode;
  presentation: NodePresentation;
  displayMarkdownBlocks: readonly MarkdownBlockNode[];
  open: boolean;
  readOnly?: boolean;
  searchOrigin?: { query: string; sourceLabel: string };
  onClose: () => void;
  onSave?: (heading: string, content: string, nodeType: InsertableNodeType) => void | Promise<void>;
  onMarkDeleted?: (nodeId: string) => void | Promise<void>;
}

function badgeClass(badge: PresentationBadge): string {
  if (badge.kind === 'track' && badge.label === 'Vibe') return 'bg-[var(--factory-green-soft)] text-[var(--factory-green)]';
  if (badge.kind === 'track' && badge.label === 'Pro') return 'bg-[var(--factory-governance-surface)] text-[var(--factory-copper)]';
  if (badge.kind === 'track') return 'bg-[var(--factory-engineering-surface)] text-[var(--factory-slate)]';
  return 'border border-[var(--factory-border)] bg-[var(--factory-surface)] text-[var(--factory-muted)]';
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
  searchOrigin,
  onClose,
  onSave,
  onMarkDeleted,
}: Props) {
  const [activeTab, setActiveTab] = useState<'read' | 'edit'>('read');
  const [content, setContent] = useState(node.content);
  const [title, setTitle] = useState(node.title);
  const [nodeType, setNodeType] = useState<InsertableNodeType>(node.type as InsertableNodeType);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmMarkDeleted, setConfirmMarkDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const contentRef = useRef(content);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  contentRef.current = content;
  const dirty = !readOnly && (title !== node.title || content !== node.content || nodeType !== node.type);

  useEffect(() => {
    setContent(node.content);
    setTitle(node.title);
    setNodeType(node.type as InsertableNodeType);
    setActiveTab('read');
    setSaved(false);
    setActionError('');
    setConfirmMarkDeleted(false);
    setConfirmClose(false);
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
      await onSave?.(title, content, nodeType);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '保存失败，请重试。');
    } finally {
      setBusy(false);
    }
  }, [activeTab, content, nodeType, onSave, readOnly, title]);

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

  const requestClose = useCallback(() => {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open || !dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, open]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]',
      ) ?? [])].filter(element => element.offsetParent !== null);
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      restoreFocusRef.current?.focus();
    };
  }, [open, requestClose]);

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
      <button className="absolute inset-0 h-full w-full cursor-default bg-[var(--factory-ink)]/25" onClick={requestClose} aria-label="关闭节点详情" />

      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={presentation.accessibleLabel}
        className="node-detail-sheet relative mt-auto max-h-[90vh] w-full overflow-y-auto rounded-t-xl border-l border-t border-[var(--factory-border)] bg-white shadow-[-12px_0_36px_rgba(24,32,25,0.12)] animate-in slide-in-from-right slide-in-from-bottom duration-200 sm:mt-0 sm:max-h-full sm:max-w-xl sm:rounded-none sm:border-b-0 sm:border-t-0 sm:slide-in-from-bottom-0 sm:slide-in-from-right"
      >
        <div className="node-detail-sheet__header sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-[var(--factory-border)] bg-white px-5 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {presentation.badges.map(badge => (
              <span key={`${badge.kind}-${badge.label}`} className={`rounded px-2 py-0.5 text-xs font-semibold ${badgeClass(badge)}`}>
                {badge.label}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {readOnly ? (
              <span className="inline-flex min-h-11 items-center gap-1.5 px-2 text-xs font-semibold text-[var(--factory-muted)]">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />只读
              </span>
            ) : visibleTab === 'edit' ? (
              <button
                onClick={handleSave}
                disabled={busy || readOnly}
                className={`min-h-11 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${saved ? 'bg-[var(--factory-green-soft)] text-[var(--factory-green)]' : 'bg-[var(--factory-green-soft)] text-[var(--factory-muted)] hover:bg-[var(--factory-green-soft)] hover:text-[var(--factory-ink)]'}`}
              >
                <Save className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                {busy ? '保存中' : saved ? '已保存' : '保存'}
              </button>
            ) : null}
            <button ref={closeButtonRef} onClick={requestClose} className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--factory-muted)] hover:bg-[var(--factory-selection)] hover:text-[var(--factory-ink)]" aria-label="关闭节点详情">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="node-detail-sheet__body space-y-5 px-5 py-4">
          <header>
            <h2 className="text-xl font-semibold leading-snug text-[var(--factory-ink)]">{presentation.displayTitle}</h2>
            <p className="mt-1 text-xs text-[var(--factory-muted)]">来源章节：{presentation.sourceLabel}</p>
            {searchOrigin && (
              <p className="mt-2 inline-flex rounded border border-[var(--factory-border)] bg-[var(--factory-canvas)] px-2 py-1 text-xs text-[var(--factory-slate)]">
                来自搜索：{cleanPresentationText(searchOrigin.query)} · {cleanPresentationText(searchOrigin.sourceLabel)}
              </p>
            )}
          </header>

          {!readOnly && (
            <div className="flex gap-1 rounded-lg border border-[var(--factory-border)] bg-[var(--factory-surface)] p-1" role="tablist" aria-label="详情模式">
              <button
                type="button"
                role="tab"
                aria-selected={visibleTab === 'read'}
                onClick={() => setActiveTab('read')}
                className={`min-h-11 flex-1 rounded-md px-3 text-sm font-medium ${visibleTab === 'read' ? 'bg-white text-[var(--factory-ink)] shadow-sm' : 'text-[var(--factory-muted)] hover:text-[var(--factory-ink)]'}`}
              >
                阅读
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={visibleTab === 'edit'}
                onClick={() => setActiveTab('edit')}
                className={`min-h-11 flex-1 rounded-md px-3 text-sm font-medium ${visibleTab === 'edit' ? 'bg-white text-[var(--factory-ink)] shadow-sm' : 'text-[var(--factory-muted)] hover:text-[var(--factory-ink)]'}`}
              >
                编辑 Markdown
              </button>
            </div>
          )}

          {actionError && (
            <div className="rounded-md border border-[var(--factory-border)] bg-[var(--factory-surface)] px-3 py-2 text-xs text-[var(--factory-danger)]">
              {cleanPresentationText(actionError)}
            </div>
          )}

          {confirmClose && (
            <div className="node-detail-discard" role="alertdialog" aria-label="确认放弃未保存修改">
              <div>
                <strong>存在未保存的本地草稿</strong>
                <span>关闭后将丢失本次标题与 Markdown 修改。</span>
              </div>
              <button type="button" onClick={() => setConfirmClose(false)}>继续编辑</button>
              <button type="button" className="is-danger" onClick={onClose}>放弃修改</button>
            </div>
          )}

          {!readOnly && activeTab === 'edit' ? (
            <div className="space-y-4" role="tabpanel" aria-label="编辑 Markdown">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--factory-muted)]" htmlFor="node-source-title">原始章节标题</label>
                <input
                  id="node-source-title"
                  value={title}
                  readOnly={readOnly}
                  onChange={event => setTitle(event.target.value)}
                  className="min-h-11 w-full rounded-md border border-[var(--factory-border)] bg-white px-3 text-sm font-semibold text-[var(--factory-ink)] outline-none focus:border-[var(--factory-slate)]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--factory-muted)]" htmlFor="node-source-content">原始内容 (Markdown)</label>
                <textarea
                  id="node-source-content"
                  value={content}
                  readOnly={readOnly}
                  onChange={event => handleContentChange(event.target.value)}
                  rows={textareaRows}
                  className="w-full resize-y rounded-md border border-[var(--factory-border)] bg-[var(--factory-surface)] px-3 py-2.5 font-mono text-sm leading-relaxed text-[var(--factory-ink)] placeholder:text-[var(--factory-muted)] focus:border-[var(--factory-slate)] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--factory-muted)]" htmlFor="node-source-type">节点类型</label>
                <select
                  id="node-source-type"
                  value={nodeType}
                  onChange={event => setNodeType(event.target.value as InsertableNodeType)}
                  className="min-h-11 w-full rounded-md border border-[var(--factory-border)] bg-white px-3 text-sm text-[var(--factory-ink)] outline-none focus:border-[var(--factory-slate)]"
                >
                  <option value="section">分组章节</option>
                  <option value="subsection">内容章节</option>
                  <option value="step">行动步骤</option>
                  <option value="tool">工具节点</option>
                  <option value="prompt">Prompt 节点</option>
                  <option value="principle">原则节点</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-5" role="tabpanel" aria-label="阅读">
              {presentation.displaySummary && (
                <p className="rounded-md border border-[var(--factory-border)] bg-[var(--factory-surface)] px-3 py-2 text-sm leading-relaxed text-[var(--factory-muted)]">
                  {presentation.displaySummary}
                </p>
              )}
              <SafeMarkdown blocks={displayMarkdownBlocks} className="node-detail-markdown" />

              {copyableBlocks.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--factory-muted)]">
                    <Code2 className="h-3 w-3" aria-hidden="true" /> 可复制内容 ({copyableBlocks.length})
                  </div>
                  <div className="space-y-2">
                    {copyableBlocks.map((block, index) => (
                      <div key={`${block.type}-${index}`} className="overflow-hidden rounded-md border border-[var(--factory-border)] bg-[var(--factory-surface)]">
                        <div className="flex items-center justify-between border-b border-[var(--factory-border)] bg-white px-3 py-1.5">
                          <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${block.type === 'prompt' ? 'bg-[var(--factory-engineering-surface)] text-[var(--factory-slate)]' : 'bg-[var(--factory-green-soft)] text-[var(--factory-muted)]'}`}>
                            {block.type === 'prompt' ? '提示词' : cleanPresentationText(block.language) || 'code'}
                          </span>
                          <button onClick={() => handleCopy(block.content)} className="flex h-11 w-11 items-center justify-center rounded text-[var(--factory-muted)] hover:bg-[var(--factory-selection)] hover:text-[var(--factory-ink)]" aria-label="复制内容块">
                            <Copy className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                        {block.type === 'prompt' ? (
                          <SafeMarkdown markdown={block.content} className="max-h-48 overflow-auto p-3 text-sm leading-relaxed text-[var(--factory-ink)]" />
                        ) : (
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-[var(--factory-ink)]">{visibleCode(block.content)}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {node.toolReferences && node.toolReferences.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--factory-muted)]">
                    <Wrench className="h-3 w-3" aria-hidden="true" /> 工具引用 ({node.toolReferences.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {node.toolReferences.map((reference, index) => (
                      <span key={index} className="rounded border border-[var(--factory-border)] bg-[var(--factory-surface)] px-2 py-1 text-[11px] text-[var(--factory-muted)]">
                        {visibleReference(reference)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {node.promptTemplates && node.promptTemplates.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--factory-muted)]">
                    <MessageSquare className="h-3 w-3" aria-hidden="true" /> Codex 提示词 ({node.promptTemplates.length})
                  </div>
                  <div className="space-y-2">
                    {node.promptTemplates.map((prompt, index) => (
                      <div key={index} className="group relative overflow-hidden rounded-md border border-[var(--factory-border)] bg-[var(--factory-surface)]">
                        <div className="absolute right-1.5 top-1.5">
                          <button onClick={() => handleCopy(prompt)} className="flex h-11 w-11 items-center justify-center rounded border border-[var(--factory-border)] bg-white text-[var(--factory-muted)] hover:bg-[var(--factory-selection)] hover:text-[var(--factory-ink)]" aria-label="复制 Codex 提示词">
                            <Copy className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                        <SafeMarkdown markdown={prompt} className="max-h-48 overflow-auto p-3 pr-14 text-sm leading-relaxed text-[var(--factory-ink)]" />
                      </div>
                    ))}
                    {copied && <span className="text-xs font-medium text-[var(--factory-green)]">已复制到剪贴板</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--factory-border)] pt-3">
            {readOnly ? (
              <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--factory-muted)]">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" /> 生产只读
              </div>
            ) : activeTab === 'edit' && confirmMarkDeleted ? (
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--factory-copper)]" aria-hidden="true" />
                <span className="text-xs text-[var(--factory-copper)]">确认标记？<span className="ml-1 text-[10px] text-[var(--factory-muted)]">仅从当前画布隐藏，Markdown 章节仍保留</span></span>
                <button onClick={handleMarkDeleted} disabled={busy} className="min-h-11 rounded bg-[var(--factory-surface)] px-3 py-1 text-xs font-semibold text-[var(--factory-danger)] hover:bg-[var(--factory-surface)] disabled:cursor-not-allowed disabled:opacity-60">{busy ? '处理中' : '确定'}</button>
                <button onClick={() => setConfirmMarkDeleted(false)} className="min-h-11 rounded bg-[var(--factory-green-soft)] px-3 py-1 text-xs font-semibold text-[var(--factory-muted)] hover:bg-[var(--factory-green-soft)]">取消</button>
              </div>
            ) : activeTab === 'edit' ? (
              <button onClick={() => setConfirmMarkDeleted(true)} className="flex min-h-11 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-[var(--factory-danger)] hover:bg-[var(--factory-surface)]">
                <Trash2 className="h-3 w-3" aria-hidden="true" /> 标记删除
              </button>
            ) : <span />}
            <div className="flex items-center gap-2 text-xs text-[var(--factory-muted)]">
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
