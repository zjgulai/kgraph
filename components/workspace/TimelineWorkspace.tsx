import React from 'react';
import { CalendarClock, CircleHelp, Clock3, FileSearch, History } from 'lucide-react';
import type { ProductOperationsProjection, TimelineEvent } from '@/lib/product/operations-projection';

type TimelineAxis = 'all' | TimelineEvent['axis'];

interface Props {
  projection: ProductOperationsProjection;
  initialAxis?: string | null;
  onAxisChange?: (axis: TimelineAxis) => void;
  onEvidenceSelected?: (evidenceId: string) => void;
}

const axes: Array<{ id: TimelineAxis; label: string; icon: typeof History }> = [
  { id: 'all', label: '全部事件', icon: History },
  { id: 'valid', label: '现实有效', icon: CalendarClock },
  { id: 'observed', label: '系统获知', icon: Clock3 },
  { id: 'governance', label: '治理动作', icon: History },
];

function parseAxis(value: string | null | undefined): TimelineAxis {
  return axes.some(axis => axis.id === value) ? value as TimelineAxis : 'all';
}

export function TimelineWorkspace({ projection, initialAxis, onAxisChange, onEvidenceSelected }: Props) {
  const activeAxis = parseAxis(initialAxis);
  const events = activeAxis === 'all' ? projection.timeline.events : projection.timeline.events.filter(event => event.axis === activeAxis);
  return <div className="operations-workspace timeline-workspace timeline-workspace--unified">
    <header className="operations-masthead"><div><span><History aria-hidden="true" />UNIFIED BITEMPORAL LEDGER</span><h1>Evidence Timeline</h1><p>同一事件流明确标记现实有效、系统获知与治理动作；valid time 缺失保持 unknown，不用 observed time 回填。</p></div><dl><div><dt>事件</dt><dd>{projection.timeline.events.length}</dd></div><div><dt>未知有效</dt><dd>{projection.timeline.valid.unknownCount}</dd></div></dl></header>
    <div className="timeline-axis-tabs" role="tablist" aria-label="时间轴筛选">
      {axes.map(axis => {
        const Icon = axis.icon;
        const count = axis.id === 'all' ? projection.timeline.events.length : projection.timeline.events.filter(event => event.axis === axis.id).length;
        return <button key={axis.id} type="button" role="tab" aria-selected={axis.id === activeAxis} onClick={() => onAxisChange?.(axis.id)}><Icon aria-hidden="true" /><span>{axis.label}</span><strong>{count}</strong></button>;
      })}
    </div>
    {projection.timeline.valid.unknownCount > 0 ? <aside className="timeline-unknown"><CircleHelp aria-hidden="true" /><p><strong>{projection.timeline.valid.unknownCount} 个未知有效起点</strong><span>未知不等于无效，也不等于通过。</span></p></aside> : null}
    <section className="timeline-unified" aria-live="polite" aria-label={`${axes.find(axis => axis.id === activeAxis)?.label ?? '全部事件'}列表`}>
      {events.length > 0 ? <ol>{events.map(event => <li key={event.id} data-axis={event.axis}>
        <time dateTime={event.at}>{event.at}</time>
        <div><span>{event.axis === 'valid' ? '现实有效' : event.axis === 'observed' ? '系统获知' : '治理动作'}</span><strong>{event.title}</strong><p>{event.detail}</p><code>{event.sourceRef}</code></div>
        {onEvidenceSelected ? <button type="button" onClick={() => onEvidenceSelected(event.evidenceId)} aria-label={`查看${event.title}的证据`}><FileSearch aria-hidden="true" /></button> : null}
      </li>)}</ol> : <p>当前筛选下尚无可验证事件。</p>}
    </section>
  </div>;
}
