'use client';
import { useEffect, useState } from 'react';
import { Check, Loader2, AlertTriangle } from 'lucide-react';
import { cleanPresentationText } from '@/lib/canvas/presentation-text';

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
    <div
      className={`fixed bottom-4 right-4 z-50 flex min-h-11 items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold shadow-[0_10px_28px_rgba(24,32,25,0.12)] transition-opacity duration-200 animate-in fade-in-up sm:bottom-6 sm:right-6 ${status === 'saved' ? 'border-[var(--factory-border)] bg-[var(--factory-green-soft)] text-[var(--factory-green)]' : status === 'error' ? 'border-[var(--factory-border)] bg-[var(--factory-surface)] text-[var(--factory-danger)]' : 'border-[var(--factory-border)] bg-white text-[var(--factory-muted)]'}`}
      role="status"
      aria-live="polite"
    >
      {status === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'saved' && <Check className="w-3 h-3" />}
      {status === 'error' && <AlertTriangle className="w-3 h-3" />}
      <span>{status === 'saving' ? '正在保存视图…' : status === 'saved' ? `视图已保存 ${time}` : cleanPresentationText(errorMessage) || '视图保存失败'}</span>
    </div>
  );
}
