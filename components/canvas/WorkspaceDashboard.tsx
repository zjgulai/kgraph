'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  FolderKanban,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { DocumentEntry } from '@/lib/shared/document-registry';
import { formatDisplayDateTime, formatDisplayInteger } from '@/lib/shared/display-format';
import type { WritePolicy } from '@/lib/server/write-guard';

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
  const [token, setToken] = useState(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('doccanvas-admin-token') || '';
  });
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
  const writesDisabled = !writePolicy.writable;

  const saveToken = (value: string) => {
    setToken(value);
    if (value) sessionStorage.setItem('doccanvas-admin-token', value);
    else sessionStorage.removeItem('doccanvas-admin-token');
  };

  const createCanvas = async () => {
    if (!title.trim()) {
      setStatus('请输入画布标题。');
      return;
    }
    setCreating(true);
    setStatus('');
    try {
      const resp = await fetch('/api/canvases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-DocCanvas-Token': token } : {}),
        },
        body: JSON.stringify({ title, description }),
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
    <main className="min-h-[100dvh] bg-[#F8FBF0] text-[#182019]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-6 border-b border-[#D5DFD0] pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-[#CCD8C7] bg-white px-3 py-1.5 text-xs font-semibold tracking-wide text-[#4F5F9B]">
              <Activity className="h-3.5 w-3.5" />
              Markdown 单一事实源
            </div>
            <h1 className="font-serif text-4xl font-semibold tracking-tight text-[#182019] sm:text-5xl">
              DocCanvas 工作台
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#637064]">
              把 Playbook 文档转换为可编辑知识画布。新建、浏览、同步和导出都围绕 Markdown 源文件闭环。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#D5DFD0] bg-white p-2 text-center shadow-[0_8px_24px_rgba(24,32,25,0.05)]">
            <div className="rounded-md bg-[#F8FBF2] px-4 py-3">
              <div className="text-2xl font-semibold">{stats.total}</div>
              <div className="mt-1 text-xs text-[#637064]">画布</div>
            </div>
            <div className="rounded-md bg-[#F8FBF2] px-4 py-3">
              <div className="text-2xl font-semibold text-[#2D6B47]">{stats.ready}</div>
              <div className="mt-1 text-xs text-[#637064]">可访问</div>
            </div>
            <div className="rounded-md bg-[#F8FBF2] px-4 py-3">
              <div className="text-2xl font-semibold text-[#4F5F9B]">{stats.custom}</div>
              <div className="mt-1 text-xs text-[#637064]">自定义</div>
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-3">
            {entries.map(entry => {
              const Icon = iconByKind[entry.kind];
              return (
                <article
                  key={entry.id}
                  className="group rounded-lg border border-[#D5DFD0] bg-white p-4 transition-[border-color,box-shadow] hover:border-[#AEBCA8] hover:shadow-[0_10px_28px_rgba(24,32,25,0.07)]"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Link href={entry.exists ? `/canvas/${entry.id}` : '#'} className="flex min-w-0 flex-1 items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#D5DFD0] bg-[#F8FBF2]" style={{ color: entry.color }}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-base font-semibold text-[#182019]">{entry.title}</h2>
                          <span className="rounded border border-[#D5DFD0] bg-[#F8FBF2] px-2 py-0.5 text-[11px] text-[#637064]">{entry.kind === 'builtin' ? '内置' : '用户'}</span>
                          {entry.exists ? (
                            <span className="inline-flex items-center gap-1 rounded bg-[#EAF3E8] px-2 py-0.5 text-[11px] font-medium text-[#2D6B47]">
                              <CheckCircle2 className="h-3 w-3" /> ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-[#FAECE8] px-2 py-0.5 text-[11px] font-medium text-[#A23E3E]">
                              <AlertTriangle className="h-3 w-3" /> missing
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-[#526053]">{entry.description}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#637064]">
                          <span>{entry.subtitle}</span>
                          {entry.bytes !== undefined && <span>{formatDisplayInteger(entry.bytes)} bytes</span>}
                          {entry.mtime && <span>更新 {formatDisplayDateTime(entry.mtime)}</span>}
                        </div>
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <a
                        href={`/api/export/markdown?documentId=${entry.id}`}
                        className="inline-flex h-11 items-center gap-2 rounded-md border border-[#C8D3C3] bg-white px-3 text-xs font-semibold text-[#526053] transition-colors hover:border-[#9EAE98] hover:bg-[#F8FBF2]"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Markdown
                      </a>
                      <Link
                        href={entry.exists ? `/canvas/${entry.id}` : '#'}
                        className={`inline-flex h-11 items-center rounded-md px-4 text-xs font-semibold transition-colors ${entry.exists ? 'bg-[#4F5F9B] text-white hover:bg-[#414F82]' : 'pointer-events-none bg-[#E9EEE5] text-[#899488]'}`}
                      >
                        打开
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="h-fit rounded-lg border border-[#D5DFD0] bg-white p-4 shadow-[0_8px_24px_rgba(24,32,25,0.05)]">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#182019]">
              <Plus className="h-4 w-4 text-[#4F5F9B]" />
              新建 Markdown 画布
            </div>
            <form
              className="space-y-3"
              onSubmit={event => {
                event.preventDefault();
                createCanvas();
              }}
            >
              <label className="block text-xs font-medium text-[#637064]">
                标题
                <input
                  name="canvas-title"
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  disabled={writesDisabled}
                  autoComplete="off"
                  className="mt-1 min-h-11 w-full rounded-md border border-[#C8D3C3] bg-[#F8FBF2] px-3 py-2 text-sm text-[#182019] outline-none transition-colors placeholder:text-[#637064] focus:border-[#4F5F9B] disabled:cursor-not-allowed disabled:bg-[#EEF2EA]"
                  placeholder="例如：新产品路线图"
                />
              </label>
              <label className="block text-xs font-medium text-[#637064]">
                说明
                <textarea
                  name="canvas-description"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  disabled={writesDisabled}
                  autoComplete="off"
                  rows={4}
                  className="mt-1 w-full resize-none rounded-md border border-[#C8D3C3] bg-[#F8FBF2] px-3 py-2 text-sm text-[#182019] outline-none transition-colors placeholder:text-[#637064] focus:border-[#4F5F9B] disabled:cursor-not-allowed disabled:bg-[#EEF2EA]"
                  placeholder="这个画布要解决什么问题？"
                />
              </label>

              {writePolicy.mode === 'owner' && (
                <label className="block text-xs font-medium text-[#637064]">
                  Owner token
                  <div className="mt-1 flex min-h-11 items-center gap-2 rounded-md border border-[#C8D3C3] bg-[#F8FBF2] px-3 py-2 focus-within:border-[#4F5F9B]">
                    <KeyRound className="h-4 w-4 text-[#637064]" />
                    <input
                      name="doccanvas-owner-token"
                      value={token}
                      onChange={event => saveToken(event.target.value)}
                      type="password"
                      autoComplete="one-time-code"
                      className="min-w-0 flex-1 bg-transparent text-sm text-[#182019] outline-none placeholder:text-[#637064]"
                      placeholder="sessionStorage only"
                    />
                  </div>
                </label>
              )}

              <button
                type="submit"
                disabled={creating || writesDisabled}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#4F5F9B] text-sm font-semibold text-white transition-colors hover:bg-[#414F82] disabled:cursor-not-allowed disabled:bg-[#E9EEE5] disabled:text-[#899488]"
              >
                {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                创建并打开
              </button>
              {status && <p className="text-xs text-[#526053]">{status}</p>}
            </form>

            <div className="mt-5 rounded-md border border-[#D5DFD0] bg-[#F8FBF2] p-3 text-xs leading-6 text-[#637064]">
              <div className="mb-1 flex items-center gap-2 font-semibold text-[#3C493D]">
                {writesDisabled ? <Lock className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                写入策略
              </div>
              {writesDisabled && <p>生产默认只读。设置 owner 模式和 token 后才能写入。</p>}
              {writePolicy.mode === 'owner' && <p>写入需要 `X-DocCanvas-Token`，当前 token 只保存在本浏览器会话。</p>}
              {canWriteWithoutToken && <p>开发模式允许本地写入。生产部署会默认切回只读。</p>}
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
