import React from 'react';
import { StatusBadge, type StatusTone } from './StatusBadge';

export type MutationStatusKind = 'draft' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'failed';

const presentation: Readonly<Record<MutationStatusKind, { label: string; tone: StatusTone }>> = {
  draft: { label: '草稿已就绪', tone: 'neutral' },
  dirty: { label: '存在未保存修改', tone: 'warning' },
  saving: { label: '正在保存', tone: 'info' },
  saved: { label: '修订已保存', tone: 'success' },
  conflict: { label: '检测到版本冲突', tone: 'danger' },
  failed: { label: '保存失败', tone: 'danger' },
};

export function MutationStatus({ state, detail }: { state: MutationStatusKind; detail?: string }) {
  const current = presentation[state];
  return <div className="ds-mutation-status" data-state={state} role={state === 'failed' || state === 'conflict' ? 'alert' : 'status'} aria-live={state === 'failed' || state === 'conflict' ? 'assertive' : 'polite'}>
    <StatusBadge tone={current.tone}>{current.label}</StatusBadge>
    {detail ? <span>{detail}</span> : null}
  </div>;
}
