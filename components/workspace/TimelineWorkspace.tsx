import React from 'react';
import { CalendarClock, CircleHelp, Clock3, History } from 'lucide-react';
import type { ProductOperationsProjection, TimelineEvent } from '@/lib/product/operations-projection';

interface Props { projection: ProductOperationsProjection }

function Track({ label, events, tone }: { label: string; events: TimelineEvent[]; tone: string }) {
  return <section className="timeline-track" data-tone={tone}><header><span>{label}</span><strong>{events.length}</strong></header><ol>{events.slice(0, 12).map(event => <li key={event.id}><time dateTime={event.at}>{event.at}</time><div><strong>{event.title}</strong><span>{event.detail}</span><code>{event.sourceRef}</code></div></li>)}</ol>{events.length === 0 ? <p>尚无可验证事件。</p> : null}</section>;
}

export function TimelineWorkspace({ projection }: Props) {
  return <div className="operations-workspace timeline-workspace">
    <header className="operations-masthead"><div><span><History aria-hidden="true" />BITEMPORAL LEDGER / 04</span><h1>Knowledge Timeline</h1><p>valid time 回答“何时在现实中有效”，observed time 回答“系统何时知道”；治理事件单独成轨，避免历史穿越。</p></div><dl><div><dt>Observed</dt><dd>{projection.timeline.observed.events.length}</dd></div><div><dt>Unknown valid</dt><dd>{projection.timeline.valid.unknownCount}</dd></div></dl></header>
    <div className="timeline-legend"><span><CalendarClock aria-hidden="true" />valid time</span><span><Clock3 aria-hidden="true" />observed time</span><span><History aria-hidden="true" />governance time</span></div>
    <div className="timeline-grid">
      <section className="timeline-track timeline-track--unknown" data-tone="valid"><header><span>valid time</span><strong>{projection.timeline.valid.events.length}</strong></header><div><CircleHelp aria-hidden="true" /><p><strong>{projection.timeline.valid.unknownCount} 个未知有效起点</strong><span>保留 unknown，不用 observed_at 回填现实时间。</span></p></div><ol>{projection.timeline.valid.events.slice(0, 12).map(event => <li key={event.id}><time dateTime={event.at}>{event.at}</time><div><strong>{event.title}</strong><span>{event.detail}</span></div></li>)}</ol></section>
      <Track label="observed time" events={projection.timeline.observed.events} tone="observed" />
      <Track label="governance time" events={projection.timeline.governance.events} tone="governance" />
    </div>
  </div>;
}
