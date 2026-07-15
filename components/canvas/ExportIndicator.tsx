'use client';

import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { cleanPresentationText } from '@/lib/canvas/presentation-text';

export type ExportFeedbackStatus = 'idle' | 'working' | 'success' | 'error';

interface Props {
  status: ExportFeedbackStatus;
  message: string;
}

export function ExportIndicator({ status, message }: Props) {
  if (status === 'idle' || !message) return null;

  return (
    <div
      className={`export-indicator export-indicator--${status}`}
      role="status"
      aria-live="polite"
    >
      {status === 'working' && <Loader2 className="animate-spin" aria-hidden="true" />}
      {status === 'success' && <Check aria-hidden="true" />}
      {status === 'error' && <AlertTriangle aria-hidden="true" />}
      <span>{cleanPresentationText(message)}</span>
    </div>
  );
}
