'use client';

import React from 'react';
import {
  CalendarClock,
  CircleAlert,
  ExternalLink,
  Fingerprint,
  GitPullRequestArrow,
  Network,
  Route,
  ShieldCheck,
} from 'lucide-react';
import type { KnowledgeLibraryItem } from '@/lib/knowledge/library-types';
import type { CaptureSummary } from '@/lib/server/knowledge-capture-store';
import { formatDisplayDateTime, formatDisplayInteger } from '@/lib/shared/display-format';
import { humanLabel } from '@/lib/presentation/human-labels';

interface Props {
  item: KnowledgeLibraryItem | null;
  capture?: CaptureSummary | null;
  reviewHref?: string | null;
  canvasHref?: string | null;
  onOpenReview?: () => void;
  onOpenCanvas?: () => void;
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

const governanceLabels: Record<string, string> = {
  human_review_required: '需要人工复核', source_registered: '来源已登记', llm_distilled_candidate: '模型萃取候选',
  machine_reviewed_candidate: '机器复核候选', human_reviewed: '人工已复核', captured: '已采集', modularized: '已模块化',
  structured: '已结构化', networked: '已关联', productized: '已产品化', validated_in_use: '已在使用中验证',
  active: '活跃', candidate: '候选', deprecated: '已弃用', archived: '已归档',
};

function followInternalLink(event: React.MouseEvent<HTMLAnchorElement>, action?: () => void) {
  if (!action || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  action();
}

export function KnowledgeInspector({ item, capture, reviewHref, canvasHref, onOpenReview, onOpenCanvas }: Props) {
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
  const unresolvedReasons = item.reviewReasons.map(reason => reviewReasonLabels[reason] ?? reason);
  const validTimeKnown = Boolean(item.validTime.from);

  return (
    <aside className="knowledge-inspector" aria-label="知识对象详情">
      <header className="knowledge-inspector__header">
        <span>OBJECT INSPECTOR / R{item.revision}</span>
        <h2>{item.title}</h2>
        <p>{item.summary}</p>
      </header>

      <section className="knowledge-inspector__decision" aria-label="可信度、边界与下一动作">
        <article>
          <span>01</span>
          <div><small>可信度</small><strong>{governanceLabels[item.evidenceGrade] ?? humanLabel(item.evidenceGrade)}</strong><p>{humanLabel(item.source.authorityOrigin)} · {formatDisplayDateTime(item.observedAt)}</p></div>
        </article>
        <article data-blocked={unresolvedReasons.length > 0}>
          <span>02</span>
          <div><small>边界与阻断</small><strong>{unresolvedReasons.length > 0 ? `${unresolvedReasons.length} 项待复核` : '当前无已知阻断'}</strong><p>{validTimeKnown ? `${timeLabel(item.validTime.from)} 起有效` : '现实有效起点未知'} · {item.scope}</p></div>
        </article>
        <article>
          <span>03</span>
          <div>
            <small>下一允许动作</small>
            <strong>{unresolvedReasons.length > 0 ? '人工复核候选' : '检查关系投影'}</strong>
            <nav aria-label="知识对象下一动作">
              {reviewHref ? <a href={reviewHref} onClick={event => followInternalLink(event, onOpenReview)}>进入 Review<GitPullRequestArrow aria-hidden="true" /></a> : null}
              {canvasHref ? <a href={canvasHref} onClick={event => followInternalLink(event, onOpenCanvas)}>在 Canvas 定位<Network aria-hidden="true" /></a> : null}
            </nav>
          </div>
        </article>
      </section>

      <section className="knowledge-inspector__handoff">
        <h3><Route aria-hidden="true" />来源到知识资产</h3>
        <ol>
          <li data-complete={Boolean(capture)}><span>01</span><div><strong>Capture</strong><small>{capture ? `${capture.captureId} · ${capture.sourceHash.slice(7, 19)}` : 'Legacy seed / 未绑定 Capture'}</small></div></li>
          <li data-complete><span>02</span><div><strong>Candidate</strong><small>{item.objectId} · R{item.revision}</small></div></li>
          <li><span>03</span><div><strong>Human Review</strong><small>{governanceLabels[item.promotionState] ?? item.promotionState}</small></div></li>
          <li><span>04</span><div><strong>Canvas projection</strong><small>只读关系投影</small></div></li>
        </ol>
      </section>

      <section className="knowledge-inspector__section">
        <h3><ShieldCheck aria-hidden="true" />治理状态</h3>
        <dl className="knowledge-inspector__facts">
          <div><dt>Promotion</dt><dd>{governanceLabels[item.promotionState] ?? item.promotionState}</dd></div>
          <div><dt>Evidence</dt><dd>{governanceLabels[item.evidenceGrade] ?? item.evidenceGrade}</dd></div>
          <div><dt>Maturity</dt><dd>{governanceLabels[item.assetMaturity] ?? item.assetMaturity}</dd></div>
          <div><dt>Lifecycle</dt><dd>{governanceLabels[item.legacy.status] ?? item.legacy.status}</dd></div>
        </dl>
      </section>

      <section className="knowledge-inspector__section">
        <h3><CalendarClock aria-hidden="true" />来源与时态</h3>
        <dl className="knowledge-inspector__timeline">
          <div><dt>系统获知</dt><dd>{formatDisplayDateTime(item.observedAt)}</dd></div>
          <div><dt>现实有效</dt><dd>{timeLabel(item.validTime.from)} 至 {timeLabel(item.validTime.until)}</dd></div>
          <div><dt>来源定位</dt><dd>{item.source.locator}</dd></div>
        </dl>
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            查看原始来源<ExternalLink aria-hidden="true" />
          </a>
        ) : <p className="knowledge-inspector__source-text">{item.source.uri}</p>}
      </section>

      <section className="knowledge-inspector__review">
        <h3><CircleAlert aria-hidden="true" />人工复核原因</h3>
        <ul>
          {unresolvedReasons.map(reason => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>

      <details className="knowledge-inspector__technical">
        <summary>技术元数据</summary>
        <div className="knowledge-inspector__identity">
          <Fingerprint aria-hidden="true" />
          <div><small>稳定对象 ID</small><code>{item.objectId}</code></div>
        </div>
        <section>
          <h3><GitPullRequestArrow aria-hidden="true" />推荐语境</h3>
          <p>{item.legacy.recommendationContext || '旧条目未提供推荐语境。'}</p>
          <dl className="knowledge-inspector__facts is-compact">
            <div><dt>Rank</dt><dd>{item.legacy.recommendationRank}</dd></div>
            <div><dt>Version</dt><dd>{item.legacy.version ?? '未声明'}</dd></div>
            <div><dt>Stars</dt><dd>{item.legacy.stars === null ? '未声明' : formatDisplayInteger(item.legacy.stars)}</dd></div>
            <div><dt>Pricing</dt><dd>{item.legacy.pricingModel ?? '未声明'}</dd></div>
          </dl>
        </section>
      </details>
    </aside>
  );
}
