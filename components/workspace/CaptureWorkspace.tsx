'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileInput, Fingerprint, Inbox, Link2, LoaderCircle, RotateCcw, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { OwnerSessionControl } from '@/components/canvas/OwnerSessionControl';
import type { KnowledgeLibraryItem } from '@/lib/knowledge/library-types';
import type { CaptureSummary } from '@/lib/server/knowledge-capture-store';
import type { WritePolicy } from '@/lib/server/write-guard';
import {
  CAPTURE_DRAFT_STORAGE_KEY,
  parseCaptureDraft,
  serializeCaptureDraft,
  type CaptureWorkspaceDraft,
} from '@/lib/knowledge/workspace-drafts';

interface Props {
  captures: CaptureSummary[];
  writePolicy: WritePolicy;
  onCandidateCreated: (item: KnowledgeLibraryItem, capture: CaptureSummary) => void;
  onOpenCandidate?: (objectId: string, captureId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const EMPTY_DRAFT: CaptureWorkspaceDraft = {
  sourceKind: 'url', sourceUri: '', file: null, content: '', title: '', domainRef: 'ai-product.capture',
};

function normalizeSourceUri(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = '';
    return url.toString().replace(/\/$/u, '');
  } catch {
    return value.trim().replace(/\/$/u, '');
  }
}

async function sourceDigest(content: string): Promise<string | null> {
  if (!content || !globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function useMobileCapture(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return isMobile;
}

export function CaptureWorkspace({ captures: initialCaptures, writePolicy, onCandidateCreated, onOpenCandidate, onDirtyChange }: Props) {
  const [captures, setCaptures] = useState(initialCaptures);
  const [ownerAuthenticated, setOwnerAuthenticated] = useState(writePolicy.mode === 'dev');
  const [sourceKind, setSourceKind] = useState<'url' | 'file'>('url');
  const [sourceUri, setSourceUri] = useState('');
  const [file, setFile] = useState<{ fileName: string; mediaType: 'text/markdown' | 'text/plain'; content: string } | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [domainRef, setDomainRef] = useState('ai-product.capture');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [contentHash, setContentHash] = useState<string | null>(null);
  const isMobile = useMobileCapture();
  const canWrite = writePolicy.writable && ownerAuthenticated && !isMobile;
  const draft = useMemo<CaptureWorkspaceDraft>(() => ({ sourceKind, sourceUri, file, content, title, domainRef }), [content, domainRef, file, sourceKind, sourceUri, title]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(EMPTY_DRAFT), [draft]);
  const duplicateCaptures = useMemo(() => {
    const normalizedUri = sourceKind === 'url' ? normalizeSourceUri(sourceUri) : '';
    return captures.filter(capture => (
      (Boolean(contentHash) && capture.sourceHash === contentHash)
      || (Boolean(normalizedUri) && capture.sourceKind === 'url' && normalizeSourceUri(capture.sourceUri) === normalizedUri)
    ));
  }, [captures, contentHash, sourceKind, sourceUri]);
  const sourcePreview = sourceKind === 'url' ? content : file?.content ?? '';
  const persistDraft = useCallback(() => {
    try {
      if (dirty) window.localStorage.setItem(CAPTURE_DRAFT_STORAGE_KEY, serializeCaptureDraft(draft));
      else window.localStorage.removeItem(CAPTURE_DRAFT_STORAGE_KEY);
    } catch {
      setStatus('草稿超过浏览器本地存储容量；请缩短正文后再继续。');
    }
  }, [draft, dirty]);

  useEffect(() => {
    const restored = parseCaptureDraft(window.localStorage.getItem(CAPTURE_DRAFT_STORAGE_KEY));
    if (restored) {
      setSourceKind(restored.sourceKind);
      setSourceUri(restored.sourceUri);
      setFile(restored.file);
      setContent(restored.content);
      setTitle(restored.title);
      setDomainRef(restored.domainRef);
      setStatus('已恢复上次未提交的 Capture 草稿。');
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(persistDraft, 250);
    return () => window.clearTimeout(timer);
  }, [hydrated, persistDraft]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      persistDraft();
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, persistDraft]);

  useEffect(() => {
    let cancelled = false;
    const sourceContent = sourceKind === 'url' ? content : file?.content ?? '';
    void sourceDigest(sourceContent).then(hash => { if (!cancelled) setContentHash(hash); });
    return () => { cancelled = true; };
  }, [content, file?.content, sourceKind]);

  const discardDraft = () => {
    setSourceKind(EMPTY_DRAFT.sourceKind);
    setSourceUri('');
    setFile(null);
    setContent('');
    setTitle('');
    setDomainRef(EMPTY_DRAFT.domainRef);
    window.localStorage.removeItem(CAPTURE_DRAFT_STORAGE_KEY);
    onDirtyChange?.(false);
    setStatus('本地 Capture 草稿已放弃。');
  };

  const submit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const source = sourceKind === 'url'
        ? { kind: 'url' as const, sourceUri, mediaType: 'text/markdown' as const, content }
        : file && { kind: 'file' as const, ...file };
      if (!source) throw new Error('请选择 Markdown 或 TXT 文件。');
      const response = await fetch('/api/knowledge/captures', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          title,
          objectType: 'tip',
          knowledgeForm: { primary: 'procedure', subform: 'technique' },
          domainRef,
          mutationId: `capture.ui.${crypto.randomUUID()}`,
        }),
      });
      const payload = await response.json() as { capture?: CaptureSummary; item?: KnowledgeLibraryItem; error?: string };
      if (!response.ok || !payload.capture || !payload.item) throw new Error(payload.error || 'Capture 创建失败。');
      setCaptures(current => [payload.capture!, ...current.filter(item => item.captureId !== payload.capture!.captureId)]);
      window.localStorage.removeItem(CAPTURE_DRAFT_STORAGE_KEY);
      setTitle('');
      setSourceUri('');
      setContent('');
      setFile(null);
      onDirtyChange?.(false);
      onCandidateCreated(payload.item, payload.capture);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Capture 创建失败。');
    } finally {
      setBusy(false);
    }
  }, [busy, canWrite, content, domainRef, file, onCandidateCreated, onDirtyChange, sourceKind, sourceUri, title]);

  return (
    <section className="capture-workspace" aria-labelledby="capture-title">
      <header className="capture-workspace__masthead">
        <div>
          <span>CAPTURE DESK / SOURCE FIRST</span>
          <h1 id="capture-title">Capture Inbox</h1>
          <p>把你已经提供的正文或文本文件固化为可校验快照，再生成等待人工复核的知识卡草稿。</p>
        </div>
        <div className="capture-workspace__policy">
          <ShieldCheck aria-hidden="true" />
          <p><strong>Provider disabled</strong><span>URL 只记录来源，不抓取；摘要是确定性 extractive draft。</span></p>
          {!isMobile && <OwnerSessionControl writePolicy={writePolicy} onAuthenticatedChange={setOwnerAuthenticated} />}
        </div>
      </header>

      <div className="capture-workspace__layout">
        {canWrite && (
          <form className="capture-workspace__intake" onSubmit={submit}>
            <header><Sparkles aria-hidden="true" /><div><small>CREATE-ONLY INTAKE</small><h2>来源登记</h2></div></header>
            <div className="capture-workspace__switch" role="group" aria-label="来源类型">
              <button type="button" data-active={sourceKind === 'url'} onClick={() => setSourceKind('url')}><Link2 aria-hidden="true" />URL + 正文</button>
              <button type="button" data-active={sourceKind === 'file'} onClick={() => setSourceKind('file')}><FileInput aria-hidden="true" />Markdown / TXT</button>
            </div>
            {sourceKind === 'url' ? (
              <>
                <label htmlFor="capture-source-uri">来源 URL</label>
                <input id="capture-source-uri" name="sourceUri" type="url" autoComplete="url" required value={sourceUri} onChange={event => setSourceUri(event.target.value)} placeholder="https://…" />
                <label htmlFor="capture-source-content">用户提供正文</label>
                <textarea id="capture-source-content" name="content" required rows={11} value={content} onChange={event => setContent(event.target.value)} placeholder="粘贴正文；服务器不会打开这个 URL。" />
              </>
            ) : (
              <label className="capture-workspace__file">本地文本文件
                <input
                  type="file"
                  name="sourceFile"
                  required
                  accept=".md,.markdown,.txt"
                  onChange={event => {
                    const selected = event.target.files?.[0];
                    if (!selected) return setFile(null);
                    const extension = selected.name.toLowerCase();
                    if (!extension.endsWith('.md') && !extension.endsWith('.markdown') && !extension.endsWith('.txt')) {
                      setStatus('只接受 .md、.markdown 或 .txt。');
                      return setFile(null);
                    }
                    selected.text().then(value => setFile({
                      fileName: selected.name,
                      mediaType: extension.endsWith('.txt') ? 'text/plain' : 'text/markdown',
                      content: value,
                    })).catch(() => setStatus('文件读取失败。'));
                  }}
                />
                <span>{file ? `${file.fileName} · ${file.content.length} chars` : '最大 1 MiB；只保存文本快照。'}</span>
              </label>
            )}
            <label htmlFor="capture-title-input">候选标题（可留空）</label>
            <input id="capture-title-input" name="title" autoComplete="off" value={title} onChange={event => setTitle(event.target.value)} maxLength={160} />
            <label htmlFor="capture-domain-ref">领域引用</label>
            <input id="capture-domain-ref" name="domainRef" autoComplete="off" required value={domainRef} onChange={event => setDomainRef(event.target.value)} />
            {sourcePreview ? (
              <details className="capture-workspace__preview">
                <summary>来源快照预览 · {sourcePreview.length} chars</summary>
                <pre>{sourcePreview.slice(0, 2400)}{sourcePreview.length > 2400 ? '\n…预览已截断，提交时仍保存完整文本。' : ''}</pre>
              </details>
            ) : null}
            {duplicateCaptures.length > 0 ? (
              <section className="capture-workspace__duplicate" aria-live="polite">
                <TriangleAlert aria-hidden="true" />
                <div><strong>发现 {duplicateCaptures.length} 条可能重复的来源</strong><p>内容 checksum 或规范化 URL 与已有 Capture 相同。优先打开已有候选，避免重复审阅。</p></div>
                {duplicateCaptures.slice(0, 3).map(duplicate => (
                  <button key={duplicate.captureId} type="button" onClick={() => onOpenCandidate?.(duplicate.objectId, duplicate.captureId)}>
                    打开 {duplicate.title}
                  </button>
                ))}
              </section>
            ) : null}
            {dirty ? <button className="capture-workspace__discard" type="button" onClick={discardDraft}><RotateCcw aria-hidden="true" />放弃草稿</button> : null}
            <button className="capture-workspace__submit" type="submit" disabled={busy}>
              {busy ? <LoaderCircle aria-hidden="true" /> : <Fingerprint aria-hidden="true" />}{busy ? '生成中…' : '上传并生成候选'}
            </button>
            {status && <p className="capture-workspace__status" role="status">{status}</p>}
          </form>
        )}

        <section className="capture-workspace__inbox" aria-label="Capture Inbox 列表">
          <header><Inbox aria-hidden="true" /><div><small>IMMUTABLE SNAPSHOTS</small><h2>{captures.length} 条来源</h2></div></header>
          {isMobile && <p className="capture-workspace__mobile-note">移动端只读：请在桌面端登记来源与生成候选。</p>}
          {captures.length === 0 ? (
            <div className="capture-workspace__empty"><Inbox aria-hidden="true" /><strong>尚无 Capture</strong><span>来源快照创建后会在这里进入 Review handoff。</span></div>
          ) : (
            <ol>
              {captures.map(capture => (
                <li key={capture.captureId} data-active-duplicate={duplicateCaptures.some(item => item.captureId === capture.captureId)}>
                  <span>{capture.sourceKind === 'url' ? <Link2 aria-hidden="true" /> : <FileInput aria-hidden="true" />}</span>
                  <div><small>{capture.sourceKind} · {capture.generationMode}</small><strong>{capture.title}</strong><p>{capture.sourceUri}</p></div>
                  <dl><div><dt>checksum</dt><dd>{capture.sourceHash.slice(7, 19)}</dd></div><div><dt>handoff</dt><dd><button type="button" onClick={() => onOpenCandidate?.(capture.objectId, capture.captureId)}>打开候选</button></dd></div></dl>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  );
}
