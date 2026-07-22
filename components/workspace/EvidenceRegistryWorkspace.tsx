import React from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, CircleHelp, FileSearch, History, ShieldCheck } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge';
import type { EvidenceFreshnessStatus, EvidenceRegistryItem, EvidenceState } from '@/lib/product/evidence-registry';
import type { ProductOperationsProjection } from '@/lib/product/operations-projection';

interface Props {
  projection: ProductOperationsProjection;
  initialEvidenceId: string | null;
  hrefForEvidence?: (evidenceId: string) => string;
  onEvidenceSelected?: (evidenceId: string) => void;
}

const stateLabel: Record<EvidenceState, string> = {
  supports: '支持结论',
  blocks: '阻断结论',
  not_measured: '尚未测量',
};

const stateTone: Record<EvidenceState, StatusTone> = {
  supports: 'success',
  blocks: 'warning',
  not_measured: 'neutral',
};

const freshnessLabel: Record<EvidenceFreshnessStatus, string> = {
  fresh: '当前有效',
  stale: '已经过期',
  unknown: '新鲜度未知',
  not_applicable: '不按时间失效',
};

const kindLabel: Record<EvidenceRegistryItem['kind'], string> = {
  knowledge_source: '知识来源',
  review_snapshot: '复核快照',
  blueprint_decision: 'Blueprint 决策',
  artifact_integrity: '产物完整性',
  evaluation_result: '评估结果',
  provider_authorization: 'Provider 授权',
  runtime_metric: '运行指标',
  canonical_lineage: 'Canonical 谱系',
  production_release: '生产发布',
};

function isPlainPrimaryClick(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function EvidenceInspector({ item }: { item: EvidenceRegistryItem }) {
  return <aside className="evidence-inspector" aria-labelledby="evidence-inspector-title">
    <header><span>证据详情</span><h2 id="evidence-inspector-title">{item.title}</h2><StatusBadge tone={stateTone[item.state]}>{stateLabel[item.state]}</StatusBadge></header>
    <p>{item.summary}</p>
    <dl>
      <div><dt>Evidence ID</dt><dd><code>{item.evidenceId}</code></dd></div>
      <div><dt>对象</dt><dd>{item.subject.type} · {item.subject.id}{item.subject.revision ? ` · R${item.subject.revision}` : ''}</dd></div>
      <div><dt>来源</dt><dd><code>{item.source.ref}</code>{item.source.locator ? <span>{item.source.locator}</span> : null}</dd></div>
      <div><dt>有效时间</dt><dd>{item.validTime.from ?? 'unknown'}{item.validTime.until ? ` → ${item.validTime.until}` : ''}</dd></div>
      <div><dt>系统获知</dt><dd>{item.observedAt ?? 'unknown'}</dd></div>
      <div><dt>治理时间</dt><dd>{item.governanceAt ?? 'not applicable'}</dd></div>
      <div><dt>新鲜度</dt><dd>{freshnessLabel[item.freshness.status]}<span>{item.freshness.reason}</span></dd></div>
      <div><dt>完整性</dt><dd>{item.integrity.status}{item.integrity.hash ? <code>{item.integrity.hash}</code> : null}</dd></div>
    </dl>
    {item.source.uri?.startsWith('http://') || item.source.uri?.startsWith('https://') ? <a href={item.source.uri} target="_blank" rel="noreferrer">打开来源<span className="sr-only">（新标签页）</span></a> : null}
    {item.nextAction ? <footer><AlertTriangle aria-hidden="true" /><p><strong>下一动作</strong>{item.nextAction}</p></footer> : null}
  </aside>;
}

export function EvidenceRegistryWorkspace({ projection, initialEvidenceId, hrefForEvidence, onEvidenceSelected }: Props) {
  const registry = projection.evidenceRegistry;
  const selected = registry.items.find(item => item.evidenceId === initialEvidenceId)
    ?? registry.items.find(item => item.state === 'blocks' || item.freshness.status === 'stale')
    ?? registry.items[0]
    ?? null;
  return <div className="operations-workspace evidence-registry-workspace">
    <header className="operations-masthead"><div><span><FileSearch aria-hidden="true" />REGISTRY PROJECTION</span><h1>Evidence Registry</h1><p>每条 readiness 只引用这里的稳定 Evidence ID；来源、现实有效时间、系统获知时间、完整性和新鲜度共同决定结论。</p></div><dl><div><dt>证据</dt><dd>{registry.stats.total}</dd></div><div><dt>过期</dt><dd>{registry.stats.stale}</dd></div></dl></header>
    <section className="evidence-summary" aria-label="Evidence Registry 状态概览">
      <div><CheckCircle2 aria-hidden="true" /><span>支持结论</span><strong>{registry.stats.supporting}</strong></div>
      <div><AlertTriangle aria-hidden="true" /><span>阻断结论</span><strong>{registry.stats.blocking}</strong></div>
      <div><CircleHelp aria-hidden="true" /><span>尚未测量</span><strong>{registry.stats.notMeasured}</strong></div>
      <div><CalendarClock aria-hidden="true" /><span>未知新鲜度</span><strong>{registry.stats.unknownFreshness}</strong></div>
    </section>
    <div className="evidence-registry-layout">
      <section className="evidence-register" aria-labelledby="evidence-register-title">
        <header><div><History aria-hidden="true" /><h2 id="evidence-register-title">证据清单</h2></div><span>生成于 {registry.generatedAt}</span></header>
        <ol>{registry.items.map(item => {
          const active = item.evidenceId === selected?.evidenceId;
          const href = hrefForEvidence?.(item.evidenceId) ?? '#';
          return <li key={item.evidenceId} data-state={item.state} data-freshness={item.freshness.status}>
            <a href={href} aria-current={active ? 'true' : undefined} onClick={event => {
              if (!onEvidenceSelected || !isPlainPrimaryClick(event)) return;
              event.preventDefault();
              onEvidenceSelected(item.evidenceId);
            }}>
              <span>{kindLabel[item.kind]}</span><strong>{item.title}</strong><p>{item.summary}</p>
              <footer><StatusBadge tone={stateTone[item.state]}>{stateLabel[item.state]}</StatusBadge><small>{freshnessLabel[item.freshness.status]}</small></footer>
            </a>
          </li>;
        })}</ol>
      </section>
      {selected ? <EvidenceInspector item={selected} /> : <aside className="evidence-inspector"><ShieldCheck aria-hidden="true" /><p>尚无注册证据。</p></aside>}
    </div>
  </div>;
}
