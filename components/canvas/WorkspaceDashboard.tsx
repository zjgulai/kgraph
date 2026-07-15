'use client';

import Link from 'next/link';
import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  FolderKanban,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { DocumentEntry } from '@/lib/shared/document-registry';
import { formatDisplayDateTime, formatDisplayInteger } from '@/lib/shared/display-format';
import type { WritePolicy } from '@/lib/server/write-guard';
import { cleanPresentationText } from '@/lib/canvas/presentation-text';
import { OwnerSessionControl } from '@/components/canvas/OwnerSessionControl';

interface Props {
  initialEntries: DocumentEntry[];
  writePolicy: WritePolicy;
}

const iconByKind = {
  builtin: FileText,
  user: FolderKanban,
};

export function WorkspaceDashboard({ initialEntries, writePolicy }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ownerAuthenticated, setOwnerAuthenticated] = useState(writePolicy.mode === 'dev');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);

  const stats = useMemo(() => {
    return {
      total: entries.length,
      ready: entries.filter(entry => entry.exists).length,
      custom: entries.filter(entry => entry.kind === 'user').length,
    };
  }, [entries]);

  const canWriteWithoutToken = writePolicy.mode === 'dev';
  const canCreate = writePolicy.mode === 'dev'
    || (writePolicy.mode === 'owner' && ownerAuthenticated);

  const createCanvas = async () => {
    if (!canCreate) {
      setStatus('请先解锁 Owner 编辑会话。');
      return;
    }
    const displayTitle = cleanPresentationText(title);
    const displayDescription = cleanPresentationText(description);
    if (!displayTitle) {
      setStatus('请输入画布标题。');
      return;
    }
    setCreating(true);
    setStatus('');
    try {
      const resp = await fetch('/api/canvases', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: displayTitle, description: displayDescription }),
      });
      const payload = await resp.json();
      if (!resp.ok) throw new Error(payload.error || '创建画布未通过');
      setEntries(prev => [...prev, payload.canvas]);
      setTitle('');
      setDescription('');
      setStatus('画布已创建。');
      window.location.href = `/canvas/${payload.canvas.id}`;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '创建画布未通过');
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="workspace-lobby">
      <section className="workspace-lobby__frame">
        <header className="workspace-lobby__header">
          <div className="workspace-lobby__title">
            <span><Building2 aria-hidden="true" />PRODUCT FACTORY / ENTRANCE HALL</span>
            <h1>产品工厂入口大厅</h1>
            <p>从三份 Markdown 单一事实源进入可视化工厂。先看全景，再进入岗位工作间读取、搜索和导出。</p>
          </div>
          <div className="workspace-lobby__stats" aria-label="工作台统计">
            <span><strong>{stats.total}</strong><small>文档入口</small></span>
            <span><strong>{stats.ready}</strong><small>可进入</small></span>
            <span><strong>{stats.custom}</strong><small>自定义</small></span>
          </div>
        </header>

        <section className={`workspace-lobby__body${canCreate ? ' is-writable' : ''}`}>
          <div className="workspace-lobby__documents">
            {entries.map((entry, index) => {
              const Icon = iconByKind[entry.kind];
              const displayTitle = cleanPresentationText(entry.title) || '未命名画布';
              const displayDescription = cleanPresentationText(entry.description) || '暂无画布说明';
              const displaySubtitle = cleanPresentationText(entry.subtitle);
              return (
                <article
                  key={entry.id}
                  className="workspace-document"
                  data-document-id={entry.id}
                  data-kind={entry.kind}
                >
                  <div className="workspace-document__scene" aria-hidden="true">
                    <span className="workspace-document__ordinal">{String(index + 1).padStart(2, '0')}</span>
                    <Icon />
                    <span className="workspace-document__windows"><i /><i /><i /></span>
                  </div>
                  <div className="workspace-document__content">
                    <div className="workspace-document__labels">
                      <span>{entry.kind === 'builtin' ? '内置产品入口' : '用户画布'}</span>
                      <span className={entry.exists ? 'is-ready' : 'is-missing'}>
                        {entry.exists ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
                        {entry.exists ? '可进入' : '源文件缺失'}
                      </span>
                      <span><Lock aria-hidden="true" />{canCreate ? 'Owner 可写' : '当前只读'}</span>
                    </div>
                    <h2>{displayTitle}</h2>
                    <p>{displayDescription}</p>
                    <dl>
                      {displaySubtitle && <div><dt>定位</dt><dd>{displaySubtitle}</dd></div>}
                      {entry.bytes !== undefined && <div><dt>规模</dt><dd>{formatDisplayInteger(entry.bytes)} bytes</dd></div>}
                      {entry.mtime && <div><dt>状态</dt><dd>更新 {formatDisplayDateTime(entry.mtime)}</dd></div>}
                    </dl>
                  </div>
                  <div className="workspace-document__actions">
                    {entry.exists ? (
                      <>
                        <a href={`/api/export/markdown?documentId=${entry.id}`}>
                          <Download aria-hidden="true" />Markdown
                        </a>
                        <Link href={`/canvas/${entry.id}`}>进入工厂</Link>
                      </>
                    ) : <span>等待恢复源文件</span>}
                  </div>
                </article>
              );
            })}
          </div>

          {canCreate ? (
            <aside className="workspace-create-panel">
              <header>
                <span><Plus aria-hidden="true" />新建 Markdown 画布</span>
                <OwnerSessionControl
                  writePolicy={writePolicy}
                  onAuthenticatedChange={setOwnerAuthenticated}
                />
              </header>
              <form
                onSubmit={event => {
                  event.preventDefault();
                  createCanvas();
                }}
              >
                <label>
                  标题
                  <input
                    name="canvas-title"
                    value={title}
                    onChange={event => setTitle(cleanPresentationText(event.target.value))}
                    autoComplete="off"
                    placeholder="例如：新产品路线图…"
                  />
                </label>
                <label>
                  说明
                  <textarea
                    name="canvas-description"
                    value={description}
                    onChange={event => setDescription(cleanPresentationText(event.target.value))}
                    autoComplete="off"
                    rows={4}
                    placeholder="例如：这个画布要解决什么问题…"
                  />
                </label>

                <button type="submit" disabled={creating}>
                  {creating ? <RefreshCw className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
                  创建并打开
                </button>
                {status && <p role="status">{status}</p>}
              </form>
              <div className="workspace-create-panel__policy">
                <ShieldCheck aria-hidden="true" />
                <p>
                  {writePolicy.mode === 'owner'
                    ? 'Owner 写入使用 8 小时 HttpOnly 会话；凭证不会保存到 Web Storage。'
                    : canWriteWithoutToken
                      ? '开发模式允许本地写入；生产部署仍默认只读。'
                      : '写入策略未配置。'}
                </p>
              </div>
            </aside>
          ) : writePolicy.mode === 'owner' ? (
            <aside className="workspace-readonly-boundary workspace-owner-boundary">
              <span className="workspace-readonly-boundary__icon"><Lock aria-hidden="true" /></span>
              <small>BOUNDARY / OWNER SESSION</small>
              <h2>编辑能力尚未解锁</h2>
              <p>鉴权成功前不渲染新建或写入控件。浏览、搜索和导出继续可用。</p>
              <OwnerSessionControl
                writePolicy={writePolicy}
                onAuthenticatedChange={setOwnerAuthenticated}
              />
            </aside>
          ) : (
            <aside className="workspace-readonly-boundary">
              <span className="workspace-readonly-boundary__icon"><Lock aria-hidden="true" /></span>
              <small>BOUNDARY / PRODUCTION</small>
              <h2>生产只读工作台</h2>
              <p>当前页面只提供浏览、搜索、个人视图保存和导出，不提供文档创建与管理凭证入口。</p>
              <ul>
                <li>Markdown 源文件保持单一事实源</li>
                <li>个人画布状态保存在浏览器本地</li>
                <li>服务端文档写入保持关闭</li>
              </ul>
            </aside>
          )}
        </section>
      </section>
    </main>
  );
}
