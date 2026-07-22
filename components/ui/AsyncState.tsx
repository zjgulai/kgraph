import React from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Inbox, LoaderCircle, RotateCcw, WifiOff } from 'lucide-react';
import { ActionButton } from './ActionButton';

export type AsyncStateKind = 'loading' | 'empty' | 'error' | 'stale' | 'offline' | 'success';

const icons = { loading: LoaderCircle, empty: Inbox, error: AlertTriangle, stale: RotateCcw, offline: WifiOff, success: CheckCircle2 } as const;

export function AsyncState({ state, title, description, actionLabel, onAction, compact = false }: {
  state: AsyncStateKind;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const Icon = icons[state];
  const liveRole = state === 'error' ? 'alert' : 'status';
  return (
    <div className={clsx('ds-async', compact && 'ds-async--compact')} data-state={state} role={liveRole} aria-live={state === 'error' ? 'assertive' : 'polite'}>
      <Icon aria-hidden="true" />
      <div><strong>{title}</strong>{description ? <p>{description}</p> : null}</div>
      {actionLabel && onAction ? <ActionButton size="small" onClick={onAction}>{actionLabel}</ActionButton> : null}
    </div>
  );
}
