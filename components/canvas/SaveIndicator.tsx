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
    <div className={`fixed bottom-4 right-4 z-50 flex min-h-11 items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold shadow-[0_10px_28px_rgba(24,32,25,0.12)] transition-all duration-200 animate-in fade-in-up sm:bottom-6 sm:right-6 ${status === 'saved' ? 'border-[#BCD6C1] bg-[#F1F8F0] text-[#2D6B47]' : status === 'error' ? 'border-[#E5C4BD] bg-[#FFF4F1] text-[#A23E3E]' : 'border-[#D5DFD0] bg-white text-[#526053]'}`}>
      {status === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'saved' && <Check className="w-3 h-3" />}
      {status === 'error' && <AlertTriangle className="w-3 h-3" />}
      <span>{status === 'saving' ? '保存中...' : status === 'saved' ? `已保存 ${time}` : errorMessage || '保存失败'}</span>
    </div>
  );
}
