'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { FileInput, Fingerprint, Inbox, Link2, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { OwnerSessionControl } from '@/components/canvas/OwnerSessionControl';
import type { KnowledgeLibraryItem } from '@/lib/knowledge/library-types';
import type { CaptureSummary } from '@/lib/server/knowledge-capture-store';
import type { WritePolicy } from '@/lib/server/write-guard';

interface Props {
  captures: CaptureSummary[];
  writePolicy: WritePolicy;
  onCandidateCreated: (item: KnowledgeLibraryItem, capture: CaptureSummary) => void;
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

export function CaptureWorkspace({ captures: initialCaptures, writePolicy, onCandidateCreated }: Props) {
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
  const isMobile = useMobileCapture();
  const canWrite = writePolicy.writable && ownerAuthenticated && !isMobile;

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
      onCandidateCreated(payload.item, payload.capture);
      setTitle('');
      setContent('');
      setFile(null);
      setStatus('已保存不可变来源快照并生成 extractive candidate；请转入 Review 人工复核。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Capture 创建失败。');
    } finally {
      setBusy(false);
    }
  }, [busy, canWrite, content, domainRef, file, onCandidateCreated, sourceKind, sourceUri, title]);

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
                <label>来源 URL<input type="url" required value={sourceUri} onChange={event => setSourceUri(event.target.value)} placeholder="https://…" /></label>
                <label>用户提供正文<textarea required rows={11} value={content} onChange={event => setContent(event.target.value)} placeholder="粘贴正文；服务器不会打开这个 URL。" /></label>
              </>
            ) : (
              <label className="capture-workspace__file">本地文本文件
                <input
                  type="file"
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
            <label>候选标题（可留空）<input value={title} onChange={event => setTitle(event.target.value)} maxLength={160} /></label>
            <label>领域引用<input required value={domainRef} onChange={event => setDomainRef(event.target.value)} /></label>
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
                <li key={capture.captureId}>
                  <span>{capture.sourceKind === 'url' ? <Link2 aria-hidden="true" /> : <FileInput aria-hidden="true" />}</span>
                  <div><small>{capture.sourceKind} · {capture.generationMode}</small><strong>{capture.title}</strong><p>{capture.sourceUri}</p></div>
                  <dl><div><dt>checksum</dt><dd>{capture.sourceHash.slice(7, 19)}</dd></div><div><dt>handoff</dt><dd>Review</dd></div></dl>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  );
}
