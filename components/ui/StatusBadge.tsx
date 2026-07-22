import React from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, CircleHelp, Info, XCircle } from 'lucide-react';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const icons = {
  neutral: CircleHelp,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
} as const;

export function StatusBadge({ tone = 'neutral', children, className }: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = icons[tone];
  return <span className={clsx('ds-status', `ds-status--${tone}`, className)}><Icon aria-hidden="true" />{children}</span>;
}
