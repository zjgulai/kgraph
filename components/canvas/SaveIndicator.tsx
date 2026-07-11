'use client';
import { useEffect, useState } from 'react';
import { Check, Loader2, AlertTriangle } from 'lucide-react';

type Status = 'idle' | 'saving' | 'saved' | 'error';

interface Props { status: Status; lastSaved?: string; errorMessage?: string; }

export function SaveIndicator({ status, lastSaved, errorMessage }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === 'saved' || status === 'error') { setVisible(true); const t = setTimeout(() => setVisible(false), 2500); return () => clearTimeout(t); }
    if (status === 'saving') setVisible(true);
    if (status === 'idle') setVisible(false);
  }, [status]);

  if (!visible) return null;

  const time = lastSaved ? new Date(lastSaved).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium backdrop-blur-md border shadow-lg transition-all duration-300 animate-in fade-in-up duration-200 ${status === 'saved' ? 'bg-emerald-900/60 border-emerald-700/50 text-emerald-300' : status === 'error' ? 'bg-red-900/60 border-red-700/50 text-red-300' : 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400'}`}>
      {status === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'saved' && <Check className="w-3 h-3" />}
      {status === 'error' && <AlertTriangle className="w-3 h-3" />}
      <span>{status === 'saving' ? '保存中...' : status === 'saved' ? `已保存 ${time}` : errorMessage || '保存失败'}</span>
    </div>
  );
}
