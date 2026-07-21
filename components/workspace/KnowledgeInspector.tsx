'use client';

import React from 'react';
import {
  CalendarClock,
  CircleAlert,
  ExternalLink,
  Fingerprint,
  GitPullRequestArrow,
  ShieldCheck,
} from 'lucide-react';
import type { KnowledgeLibraryItem } from '@/lib/knowledge/library-types';
import { formatDisplayDateTime, formatDisplayInteger } from '@/lib/shared/display-format';

interface Props {
  item: KnowledgeLibraryItem | null;
}

const reviewReasonLabels: Record<string, string> = {
  valid_from_unknown: '现实有效起点未知',
  legacy_canonical_not_inherited: '旧 canonical 不跨 Schema 继承',
  lifecycle_status_review: '生命周期状态需要复核',
  legacy_schema_pattern_drift: '旧 ID 不符合历史 Schema 正则',
};

function timeLabel(value: string | null): string {
  return value ? formatDisplayDateTime(value) : '开放／未知';
}

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function KnowledgeInspector({ item }: Props) {
  if (!item) {
    return (
      <aside className="knowledge-inspector is-empty" aria-label="知识对象详情">
        <Fingerprint aria-hidden="true" />
        <h2>没有匹配对象</h2>
        <p>调整搜索或筛选条件后，这里会显示来源、双时态和人工复核信息。</p>
      </aside>
    );
  }

  const sourceUrl = safeExternalUrl(item.source.uri);

  return (
    <aside className="knowledge-inspector" aria-label="知识对象详情">
      <header className="knowledge-inspector__header">
        <span>OBJECT INSPECTOR / R{item.revision}</span>
        <h2>{item.title}</h2>
        <p>{item.summary}</p>
      </header>

      <div className="knowledge-inspector__identity">
        <Fingerprint aria-hidden="true" />
        <div><small>稳定对象 ID</small><code>{item.objectId}</code></div>
      </div>

      <section className="knowledge-inspector__section">
        <h3><ShieldCheck aria-hidden="true" />治理状态</h3>
        <dl className="knowledge-inspector__facts">
          <div><dt>Promotion</dt><dd>{item.promotionState}</dd></div>
          <div><dt>Evidence</dt><dd>{item.evidenceGrade}</dd></div>
          <div><dt>Maturity</dt><dd>{item.assetMaturity}</dd></div>
          <div><dt>Lifecycle</dt><dd>{item.legacy.status}</dd></div>
        </dl>
      </section>

      <section className="knowledge-inspector__section">
        <h3><CalendarClock aria-hidden="true" />来源与时态</h3>
        <dl className="knowledge-inspector__timeline">
          <div><dt>系统获知</dt><dd>{formatDisplayDateTime(item.observedAt)}</dd></div>
          <div><dt>现实有效</dt><dd>{timeLabel(item.validTime.from)} — {timeLabel(item.validTime.until)}</dd></div>
          <div><dt>来源定位</dt><dd>{item.source.locator}</dd></div>
        </dl>
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            查看原始来源<ExternalLink aria-hidden="true" />
          </a>
        ) : <p className="knowledge-inspector__source-text">{item.source.uri}</p>}
      </section>

      <section className="knowledge-inspector__section">
        <h3><GitPullRequestArrow aria-hidden="true" />推荐语境</h3>
        <p>{item.legacy.recommendationContext || '旧条目未提供推荐语境。'}</p>
        <dl className="knowledge-inspector__facts is-compact">
          <div><dt>Rank</dt><dd>{item.legacy.recommendationRank}</dd></div>
          <div><dt>Version</dt><dd>{item.legacy.version ?? '未声明'}</dd></div>
          <div><dt>Stars</dt><dd>{item.legacy.stars === null ? '未声明' : formatDisplayInteger(item.legacy.stars)}</dd></div>
          <div><dt>Pricing</dt><dd>{item.legacy.pricingModel ?? '未声明'}</dd></div>
        </dl>
      </section>

      <section className="knowledge-inspector__review">
        <h3><CircleAlert aria-hidden="true" />人工复核原因</h3>
        <ul>
          {item.reviewReasons.map(reason => (
            <li key={reason}>{reviewReasonLabels[reason] ?? reason}</li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
