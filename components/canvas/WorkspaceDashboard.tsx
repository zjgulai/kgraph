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
    <main className="min-h-[100dvh] bg-[#0a0a0f] text-zinc-100">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-6 border-b border-zinc-800 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-200">
              <Activity className="h-3.5 w-3.5" />
              Markdown 单一事实源
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
              DocCanvas 工作台
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
              把 Playbook 文档转换为可编辑知识画布。新建、浏览、同步和导出都围绕 Markdown 源文件闭环。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center">
            <div className="rounded-lg bg-zinc-950/70 px-4 py-3">
              <div className="text-2xl font-semibold">{stats.total}</div>
              <div className="mt-1 text-xs text-zinc-500">画布</div>
            </div>
            <div className="rounded-lg bg-zinc-950/70 px-4 py-3">
              <div className="text-2xl font-semibold text-emerald-300">{stats.ready}</div>
              <div className="mt-1 text-xs text-zinc-500">可访问</div>
            </div>
            <div className="rounded-lg bg-zinc-950/70 px-4 py-3">
              <div className="text-2xl font-semibold text-indigo-300">{stats.custom}</div>
              <div className="mt-1 text-xs text-zinc-500">自定义</div>
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
                  className="group rounded-xl border border-zinc-800 bg-zinc-900/55 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Link href={entry.exists ? `/canvas/${entry.id}` : '#'} className="flex min-w-0 flex-1 items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950" style={{ color: entry.color }}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-base font-semibold text-zinc-100">{entry.title}</h2>
                          <span className="rounded-md border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500">{entry.kind === 'builtin' ? '内置' : '用户'}</span>
                          {entry.exists ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" /> ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">
                              <AlertTriangle className="h-3 w-3" /> missing
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-zinc-400">{entry.description}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                          <span>{entry.subtitle}</span>
                          {entry.bytes !== undefined && <span>{entry.bytes.toLocaleString()} bytes</span>}
                          {entry.mtime && <span>更新 {new Date(entry.mtime).toLocaleString('zh-CN')}</span>}
                        </div>
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <a
                        href={`/api/export/markdown?documentId=${entry.id}`}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-800 px-3 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Markdown
                      </a>
                      <Link
                        href={entry.exists ? `/canvas/${entry.id}` : '#'}
                        className={`inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium transition-colors ${entry.exists ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'pointer-events-none bg-zinc-800 text-zinc-600'}`}
                      >
                        打开
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="h-fit rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <Plus className="h-4 w-4 text-indigo-300" />
              新建 Markdown 画布
            </div>
            <form
              className="space-y-3"
              onSubmit={event => {
                event.preventDefault();
                createCanvas();
              }}
            >
              <label className="block text-xs text-zinc-500">
                标题
                <input
                  name="canvas-title"
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  disabled={writesDisabled}
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-indigo-500"
                  placeholder="例如：新产品路线图"
                />
              </label>
              <label className="block text-xs text-zinc-500">
                说明
                <textarea
                  name="canvas-description"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  disabled={writesDisabled}
                  autoComplete="off"
                  rows={4}
                  className="mt-1 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-indigo-500"
                  placeholder="这个画布要解决什么问题？"
                />
              </label>

              {writePolicy.mode === 'owner' && (
                <label className="block text-xs text-zinc-500">
                  Owner token
                  <div className="mt-1 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                    <KeyRound className="h-4 w-4 text-zinc-500" />
                    <input
                      name="doccanvas-owner-token"
                      value={token}
                      onChange={event => saveToken(event.target.value)}
                      type="password"
                      autoComplete="one-time-code"
                      className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                      placeholder="sessionStorage only"
                    />
                  </div>
                </label>
              )}

              <button
                type="submit"
                disabled={creating || writesDisabled}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                创建并打开
              </button>
              {status && <p className="text-xs text-zinc-400">{status}</p>}
            </form>

            <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-xs leading-6 text-zinc-500">
              <div className="mb-1 flex items-center gap-2 font-medium text-zinc-300">
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
