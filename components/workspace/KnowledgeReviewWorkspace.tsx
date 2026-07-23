'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileClock,
  History,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { OwnerSessionControl } from '@/components/canvas/OwnerSessionControl';
import type { KnowledgeLibraryProjection } from '@/lib/knowledge/library-types';
import type { KnowledgeLibraryItem } from '@/lib/knowledge/library-types';
import { projectKnowledgeObjectToLibraryItem } from '@/lib/knowledge/library-item';
import type {
  KnowledgeReviewPatch,
  KnowledgeReviewQueueItem,
  KnowledgeReviewRecord,
  KnowledgeReviewRevision,
} from '@/lib/server/knowledge-review-store';
import type { WritePolicy } from '@/lib/server/write-guard';
import { formatDisplayDateTime } from '@/lib/shared/display-format';
import { mergeKnowledgeBody, splitKnowledgeBody } from '@/lib/knowledge/legacy-snapshot';
import {
  mergeReviewConflict,
  parseReviewDraft,
  reviewDraftStorageKey,
  serializeReviewDraft,
  type ReviewConflictChoices,
} from '@/lib/knowledge/workspace-drafts';
import { humanLabel } from '@/lib/presentation/human-labels';
import { MutationStatus, type MutationStatusKind } from '@/components/ui/MutationStatus';

interface ReviewPayload extends KnowledgeReviewRecord {
  revisions: KnowledgeReviewRevision[];
}

interface Props {
  library: KnowledgeLibraryProjection;
  writePolicy: WritePolicy;
  initialObjectId?: string | null;
  onSelectKnowledge: (objectId: string) => void;
  onReviewObjectSelected?: (objectId: string) => void;
  onLibraryItemUpdated?: (item: KnowledgeLibraryItem) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

interface ReviewConflict {
  base: KnowledgeReviewPatch;
  current: ReviewPayload;
  local: KnowledgeReviewPatch;
}

const conflictFieldLabels: Partial<Record<keyof KnowledgeReviewPatch, string>> = {
  title: '标题', body: '正文', knowledge_form: '知识形态', domain_refs: '领域', asset_maturity: '成熟度',
  cognitive_lenses: '认知镜头', scope: '边界', valid_time: '有效时间', observed_at: '系统获知',
  source_refs: '来源证据', relations: '关系', supersedes: '替代链', evidence_grade: '证据等级',
  confidence: '置信度', usage_context: '使用语境', value_context: '价值语境',
};

function displayConflictValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function FieldEvidence({ field, locator }: { field: string; locator: string }) {
  return <small className="review-field-evidence" data-field={field} data-evidence-locator={locator}>证据定位 · {locator}</small>;
}

const formOptions = {
  knowledgeForms: ['fact', 'procedure', 'framework', 'metacognitive'],
  assetMaturities: ['captured', 'modularized', 'structured', 'networked', 'productized', 'validated_in_use'],
  evidenceGrades: ['source_registered', 'llm_distilled_candidate', 'machine_reviewed_candidate', 'human_reviewed'],
  authorityOrigins: ['public_general', 'organization_best_practice', 'expert_domain', 'first_party_observation', 'user_generated', 'synthetic_candidate'],
  licenseStatuses: ['public_reference', 'licensed', 'internal', 'pending_review', 'restricted'],
} as const;

function optionalList(value: string): string[] | undefined {
  const items = value.split(',').map(item => item.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function optionalStages(value: string): number[] | undefined {
  const stages = value.split(',').map(item => Number(item.trim())).filter(item => Number.isInteger(item));
  return stages.length > 0 ? [...new Set(stages)] : undefined;
}

function patchFromObject(object: KnowledgeReviewRecord['object']): KnowledgeReviewPatch {
  return structuredClone({
    title: object.title,
    body: object.body,
    knowledge_form: object.knowledge_form,
    domain_refs: object.domain_refs,
    asset_maturity: object.asset_maturity,
    cognitive_lenses: object.cognitive_lenses,
    scope: object.scope,
    valid_time: object.valid_time ?? null,
    observed_at: object.observed_at,
    source_refs: object.source_refs,
    relations: object.relations,
    supersedes: object.supersedes,
    evidence_grade: object.evidence_grade,
    confidence: object.confidence,
    usage_context: object.usage_context,
    value_context: object.value_context,
  });
}

function useMobileReview(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return isMobile;
}

export function KnowledgeReviewWorkspace({ library, writePolicy, initialObjectId, onSelectKnowledge, onReviewObjectSelected, onLibraryItemUpdated, onDirtyChange }: Props) {
  const [selectedId, setSelectedId] = useState(
    initialObjectId && library.items.some(item => item.objectId === initialObjectId)
      ? initialObjectId
      : library.items[0]?.objectId ?? '',
  );
  const [query, setQuery] = useState('');
  const [queueState, setQueueState] = useState<KnowledgeReviewQueueItem[]>(() => library.items.map(item => ({
    objectId: item.objectId,
    title: item.title,
    revision: 1,
    initialized: false,
    reviewReasonCount: item.reviewReasons.length,
    resolvedReviewCount: 0,
  })));
  const [record, setRecord] = useState<ReviewPayload | null>(null);
  const [draft, setDraft] = useState<KnowledgeReviewPatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [conflict, setConflict] = useState<ReviewConflict | null>(null);
  const [conflictChoices, setConflictChoices] = useState<ReviewConflictChoices>({});
  const [ownerAuthenticated, setOwnerAuthenticated] = useState(writePolicy.mode === 'dev');
  const isMobile = useMobileReview();
  const canEdit = writePolicy.writable && ownerAuthenticated && !isMobile;

  const queue = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const itemById = new Map(library.items.map(item => [item.objectId, item]));
    const hydrated = queueState.map(summary => ({ summary, item: itemById.get(summary.objectId) })).filter(entry => entry.item);
    if (!normalized) return hydrated;
    return hydrated.filter(({ summary, item }) => [summary.title, summary.objectId, ...(item?.domainRefs ?? [])]
      .join(' ').toLocaleLowerCase().includes(normalized));
  }, [library.items, query, queueState]);

  const dirty = useMemo(() => {
    if (!record || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(patchFromObject(record.object));
  }, [draft, record]);
  const draftBody = useMemo(() => splitKnowledgeBody(draft?.body ?? ''), [draft?.body]);
  const sourceBody = useMemo(() => splitKnowledgeBody(record?.object.body ?? ''), [record?.object.body]);
  const changedFields = useMemo(() => {
    if (!record || !draft) return [];
    const base = patchFromObject(record.object);
    return (Object.keys(base) as Array<keyof KnowledgeReviewPatch>)
      .filter(key => JSON.stringify(base[key]) !== JSON.stringify(draft[key]))
      .map(key => ({ key, label: conflictFieldLabels[key] ?? key }));
  }, [draft, record]);
  const evidenceLocator = draft?.source_refs[0]?.locator || record?.object.source_refs[0]?.locator || 'locator unavailable';
  const migrationStatus = useMemo(() => ({
    total: queueState.length,
    initialized: queueState.filter(item => item.initialized).length,
    unresolved: queueState.reduce((total, item) => total + Math.max(0, item.reviewReasonCount - item.resolvedReviewCount), 0),
  }), [queueState]);
  const mutationState: MutationStatusKind = conflict
    ? 'conflict'
    : saving
      ? 'saving'
      : dirty
        ? 'dirty'
        : /失败|不可用/u.test(status)
          ? 'failed'
          : /已保存|已采用|已放弃/u.test(status)
            ? 'saved'
            : 'draft';

  const loadRecord = useCallback(async (objectId: string) => {
    if (!objectId) return;
    setLoading(true);
    setStatus('');
    try {
      const response = await fetch(`/api/knowledge/review/${encodeURIComponent(objectId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json() as ReviewPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Review 对象加载失败。');
      setRecord(payload);
      const currentPatch = patchFromObject(payload.object);
      const stored = parseReviewDraft(window.localStorage.getItem(reviewDraftStorageKey(objectId)));
      if (stored && stored.baseRevision === payload.revision && stored.baseObjectHash === payload.objectHash) {
        setDraft(stored.local);
        setStatus('已恢复此对象的本地 Review 草稿。');
      } else if (stored) {
        setDraft(stored.local);
        setConflict({ base: stored.base, current: payload, local: stored.local });
        setConflictChoices({});
        setStatus('检测到服务器 revision 已变化，请完成三方合并。');
      } else {
        setDraft(currentPatch);
        setConflict(null);
      }
      setQueueState(current => current.map(item => item.objectId === objectId ? {
        ...item,
        title: payload.object.title,
        revision: payload.revision,
        initialized: payload.initialized,
        resolvedReviewCount: payload.resolvedReviewReasons.length,
      } : item));
    } catch (error) {
      setRecord(null);
      setDraft(null);
      setStatus(error instanceof Error ? error.message : 'Review 对象加载失败。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialObjectId && library.items.some(item => item.objectId === initialObjectId)) setSelectedId(initialObjectId);
  }, [initialObjectId, library.items]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/knowledge/review', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const payload = await response.json() as { queue?: KnowledgeReviewQueueItem[]; error?: string };
        if (!response.ok || !payload.queue) throw new Error(payload.error || 'Review 队列状态加载失败。');
        if (!cancelled) setQueueState(payload.queue);
      })
      .catch(() => {
        if (!cancelled) setStatus('Review 队列 overlay 状态暂不可用，当前显示 seed 队列。');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadRecord(selectedId); }, [loadRecord, selectedId]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!record || !draft) return;
    const key = reviewDraftStorageKey(record.object.object_id);
    if (!dirty) {
      window.localStorage.removeItem(key);
      return;
    }
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(key, serializeReviewDraft({
        objectId: record.object.object_id,
        baseRevision: record.revision,
        baseObjectHash: record.objectHash,
        base: patchFromObject(record.object),
        local: draft,
      }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, record]);

  const save = useCallback(async () => {
    if (!record || !draft || !canEdit || saving) return;
    setSaving(true);
    setStatus('');
    try {
      const response = await fetch(`/api/knowledge/review/${encodeURIComponent(record.object.object_id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseRevision: record.revision,
          baseObjectHash: record.objectHash,
          patch: draft,
        }),
      });
      const payload = await response.json() as ReviewPayload & { error?: string; code?: string };
      if (!response.ok) {
        if (response.status === 409) {
          const currentResponse = await fetch(`/api/knowledge/review/${encodeURIComponent(record.object.object_id)}`, {
            credentials: 'same-origin', cache: 'no-store',
          });
          const current = await currentResponse.json() as ReviewPayload & { error?: string };
          if (!currentResponse.ok) throw new Error(current.error || '冲突后的服务器版本加载失败。');
          setConflict({ base: patchFromObject(record.object), current, local: draft });
          setConflictChoices({});
          setStatus('检测到 CAS 冲突。本地草稿已保留，请比较基线、服务器当前值和本地值。');
          return;
        }
        throw new Error(payload.error || '候选修订保存失败。');
      }
      setRecord(payload);
      setDraft(patchFromObject(payload.object));
      setConflict(null);
      window.localStorage.removeItem(reviewDraftStorageKey(payload.object.object_id));
      setQueueState(current => current.map(item => item.objectId === payload.object.object_id ? {
        ...item,
        title: payload.object.title,
        revision: payload.revision,
        initialized: true,
        resolvedReviewCount: payload.resolvedReviewReasons.length,
      } : item));
      const baseItem = library.items.find(item => item.objectId === payload.object.object_id);
      if (baseItem) {
        onLibraryItemUpdated?.(projectKnowledgeObjectToLibraryItem(payload.object, payload.objectHash, {
          legacy: baseItem.legacy,
          origin: baseItem.origin,
          generationMode: baseItem.generationMode,
          reviewReasons: payload.reviewReasons.filter(reason => !payload.resolvedReviewReasons.includes(reason)),
          warningCodes: payload.warningCodes,
        }));
      }
      setStatus(`候选 revision ${payload.revision} 已保存；未执行 promotion。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '候选修订保存失败。');
    } finally {
      setSaving(false);
    }
  }, [canEdit, draft, library.items, onLibraryItemUpdated, record, saving]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!canEdit || !dirty || event.key.toLocaleLowerCase() !== 's' || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      void save();
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [canEdit, dirty, save]);

  const authenticate = useCallback((authenticated: boolean) => setOwnerAuthenticated(authenticated), []);
  const selectRecord = (objectId: string) => {
    if (objectId === selectedId) return;
    if (dirty && !window.confirm('当前对象有未保存草稿，已保存在本地。仍要切换对象？')) return;
    setSelectedId(objectId);
    onReviewObjectSelected?.(objectId);
  };
  const returnToLibrary = () => {
    if (dirty && !window.confirm('当前对象有未保存草稿，已保存在本地。仍要返回 Library？')) return;
    if (record) onSelectKnowledge(record.object.object_id);
  };
  const updateDraft = <K extends keyof KnowledgeReviewPatch>(key: K, value: KnowledgeReviewPatch[K]) => {
    setDraft(current => current ? { ...current, [key]: value } : current);
  };
  const resolveConflict = (mode: 'merge' | 'current') => {
    if (!conflict) return;
    const currentPatch = patchFromObject(conflict.current.object);
    const nextDraft = mode === 'current'
      ? currentPatch
      : mergeReviewConflict(currentPatch, conflict.local, conflictChoices);
    setRecord(conflict.current);
    setDraft(nextDraft);
    setConflict(null);
    setConflictChoices({});
    if (mode === 'current') {
      window.localStorage.removeItem(reviewDraftStorageKey(conflict.current.object.object_id));
      setStatus('已采用服务器当前 revision，本地冲突草稿已放弃。');
    } else {
      setStatus('已形成合并草稿；请复核后保存为新的 candidate revision。');
    }
  };

  return (
    <div className="knowledge-review">
      <header className="knowledge-review__masthead">
        <div>
          <span><BookOpenCheck aria-hidden="true" />GOVERNANCE DESK / 02</span>
          <h1>Review Queue</h1>
          <p>校对证据、时态与结构，只生成可追溯 candidate revision。</p>
        </div>
        <div className="knowledge-review__boundary">
          <ShieldAlert aria-hidden="true" />
          <p><strong>Promotion brake engaged</strong><span>保存不等于批准，不进入 canonical 或 runtime</span></p>
          {!isMobile ? <OwnerSessionControl writePolicy={writePolicy} onAuthenticatedChange={authenticate} /> : null}
        </div>
      </header>

      <div className="knowledge-review__layout">
        <aside className="review-queue" aria-label="待复核知识对象">
          <header>
            <div><span>HUMAN REVIEW</span><strong>{library.stats.reviewRequired}</strong></div>
            <label><Search aria-hidden="true" /><span className="sr-only">搜索复核队列</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索队列…" /></label>
          </header>
          <dl className="review-queue__migration" aria-label="Legacy migration queue 状态">
            <div><dt>迁移总量</dt><dd>{migrationStatus.total}</dd></div>
            <div><dt>已建立修订</dt><dd>{migrationStatus.initialized}</dd></div>
            <div><dt>待解决原因</dt><dd>{migrationStatus.unresolved}</dd></div>
          </dl>
          <div className="review-queue__items" role="list">
            {queue.map(({ summary, item }, index) => (
              <div key={summary.objectId} role="listitem" className="review-queue__item">
                <button
                  type="button"
                  data-selected={summary.objectId === selectedId}
                  onClick={() => selectRecord(summary.objectId)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <span><strong>{summary.title}</strong><small>{humanLabel(item?.knowledgeForm, item?.knowledgeForm)} · {humanLabel(item?.legacy.category, item?.legacy.category)}{summary.initialized ? ` · 已保存 R${summary.revision}` : ' · 初始候选'}</small></span>
                  <em>{summary.reviewReasonCount - summary.resolvedReviewCount}</em>
                </button>
              </div>
            ))}
          </div>
        </aside>

        <aside className="review-source" aria-label="来源证据">
          <header><BookOpenCheck aria-hidden="true" /><div><span>SOURCE / IMMUTABLE</span><strong>来源证据</strong></div></header>
          {record ? (
            <>
              <section>
                <small>原始标题</small>
                <h2>{record.object.title}</h2>
                <p>{sourceBody.narrative || '当前来源没有可显示的叙述正文。'}</p>
              </section>
              <dl>
                <div><dt>Locator</dt><dd>{record.object.source_refs[0]?.locator ?? '未提供'}</dd></div>
                <div><dt>Source URI</dt><dd>{record.object.source_refs[0]?.source_uri ?? '未提供'}</dd></div>
                <div><dt>Snapshot</dt><dd>{record.object.source_refs[0]?.snapshot_hash ?? '未提供'}</dd></div>
                <div><dt>Observed</dt><dd>{record.object.source_refs[0]?.observed_at ?? record.object.observed_at}</dd></div>
                <div><dt>Valid time</dt><dd>{record.object.valid_time?.from ?? '开放／未知'} → {record.object.valid_time?.until ?? '开放'}</dd></div>
                <div><dt>Authority</dt><dd>{humanLabel(record.object.source_refs[0]?.authority_origin)}</dd></div>
              </dl>
              <section className="review-source__reasons">
                <h3>当前复核依据</h3>
                <ul>{record.reviewReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
              </section>
            </>
          ) : <p>选择对象后显示不可编辑的来源快照。</p>}
        </aside>

        <main className="review-dossier" aria-label="字段差异与候选修订">
          {loading ? (
            <div className="review-dossier__loading" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" />加载复核档案…</div>
          ) : record && draft ? (
            <>
              <header className="review-dossier__header">
                <div>
                  <span>OBJECT DOSSIER / R{record.revision}</span>
                  <h2>{record.object.title}</h2>
                  <code>{record.object.object_id}</code>
                </div>
                <div>
                  <button type="button" onClick={returnToLibrary}><ArrowLeft aria-hidden="true" />Library</button>
                  <button type="button" onClick={() => {
                    if (dirty && !window.confirm('重新载入会进入冲突比较或放弃当前视图，是否继续？')) return;
                    void loadRecord(record.object.object_id);
                  }}><RefreshCw aria-hidden="true" />重新载入</button>
                </div>
              </header>

              <section className="review-dossier__alerts">
                {record.reviewReasons.map(reason => <p key={reason} data-resolved={record.resolvedReviewReasons.includes(reason)}><CircleAlert aria-hidden="true" />{reason}</p>)}
              </section>

              <section className="review-diff-summary" aria-label="当前字段差异">
                <header><span>DIFF</span><strong>{changedFields.length} 个字段已修改</strong></header>
                {changedFields.length > 0
                  ? <ul>{changedFields.map(field => <li key={field.key}>{field.label}<FieldEvidence field={field.key} locator={evidenceLocator} /></li>)}</ul>
                  : <p>当前候选与已保存 revision 一致。</p>}
              </section>

              {conflict ? (
                <section className="review-conflict" aria-labelledby="review-conflict-title">
                  <header><CircleAlert aria-hidden="true" /><div><span>CAS CONFLICT</span><h3 id="review-conflict-title">三方合并：基线 / 服务器 / 本地</h3></div></header>
                  <p>未选择的字段默认保留本地草稿。只有点击“形成合并草稿”后才会更新编辑基线，仍不会写入 canonical。</p>
                  <div className="review-conflict__fields">
                    {(Object.keys(conflictFieldLabels) as Array<keyof KnowledgeReviewPatch>)
                      .filter(key => JSON.stringify(conflict.base[key]) !== JSON.stringify(conflict.current.object[key])
                        || JSON.stringify(conflict.base[key]) !== JSON.stringify(conflict.local[key]))
                      .map(key => (
                        <fieldset key={key}>
                          <legend>{conflictFieldLabels[key] ?? key}</legend>
                          <div><small>BASE</small><pre>{displayConflictValue(conflict.base[key])}</pre></div>
                          <label><input type="radio" name={`conflict-${key}`} checked={conflictChoices[key] === 'current'} onChange={() => setConflictChoices(current => ({ ...current, [key]: 'current' }))} /><span>CURRENT</span><pre>{displayConflictValue(patchFromObject(conflict.current.object)[key])}</pre></label>
                          <label><input type="radio" name={`conflict-${key}`} checked={(conflictChoices[key] ?? 'local') === 'local'} onChange={() => setConflictChoices(current => ({ ...current, [key]: 'local' }))} /><span>LOCAL</span><pre>{displayConflictValue(conflict.local[key])}</pre></label>
                        </fieldset>
                      ))}
                  </div>
                  <footer><button type="button" onClick={() => resolveConflict('current')}>采用服务器当前值</button><button type="button" onClick={() => resolveConflict('merge')}>形成合并草稿</button></footer>
                </section>
              ) : null}

              {canEdit ? (
                <form className="review-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
                  <fieldset>
                    <legend>01 / 核心表达</legend>
                    <label><span>标题</span><FieldEvidence field="title" locator={evidenceLocator} /><input value={draft.title} onChange={event => updateDraft('title', event.target.value)} /></label>
                    <label className="is-wide"><span>正文</span><FieldEvidence field="body" locator={evidenceLocator} /><textarea rows={8} value={draftBody.narrative} onChange={event => updateDraft('body', mergeKnowledgeBody(event.target.value, draftBody.legacySnapshot))} /></label>
                    {draftBody.legacySnapshot ? (
                      <div className="review-editor__immutable is-wide" aria-label="Legacy structured snapshot 只读保留">
                        <div><dt>Legacy snapshot</dt><dd>只读保留 · 来源迁移证据不可在 Review 中改写</dd></div>
                      </div>
                    ) : null}
                  </fieldset>

                  <fieldset>
                    <legend>02 / 分类与成熟度</legend>
                    <label><span>知识形态</span><FieldEvidence field="knowledge_form" locator={evidenceLocator} /><select value={draft.knowledge_form.primary} onChange={event => updateDraft('knowledge_form', { ...draft.knowledge_form, primary: event.target.value as typeof draft.knowledge_form.primary })}>{formOptions.knowledgeForms.map(value => <option key={value} value={value}>{humanLabel(value)}</option>)}</select></label>
                    <label><span>子形态</span><FieldEvidence field="knowledge_form.subforms" locator={evidenceLocator} /><input value={draft.knowledge_form.subforms.join(', ')} onChange={event => updateDraft('knowledge_form', { ...draft.knowledge_form, subforms: optionalList(event.target.value) as typeof draft.knowledge_form.subforms ?? [] })} /></label>
                    <label><span>领域</span><FieldEvidence field="domain_refs" locator={evidenceLocator} /><input value={draft.domain_refs.join(', ')} onChange={event => updateDraft('domain_refs', optionalList(event.target.value) ?? [])} /></label>
                    <label><span>资产成熟度</span><FieldEvidence field="asset_maturity" locator={evidenceLocator} /><select value={draft.asset_maturity} onChange={event => updateDraft('asset_maturity', event.target.value as typeof draft.asset_maturity)}>{formOptions.assetMaturities.map(value => <option key={value} value={value}>{humanLabel(value)}</option>)}</select></label>
                    <label><span>证据等级</span><FieldEvidence field="evidence_grade" locator={evidenceLocator} /><select value={draft.evidence_grade} onChange={event => updateDraft('evidence_grade', event.target.value as typeof draft.evidence_grade)}>{formOptions.evidenceGrades.map(value => <option key={value} value={value}>{humanLabel(value)}</option>)}</select></label>
                    <label><span>产品阶段 1–8</span><FieldEvidence field="usage_context.lifecycle_stages" locator={evidenceLocator} /><input value={(draft.usage_context?.lifecycle_stages ?? []).join(', ')} onChange={event => updateDraft('usage_context', { ...draft.usage_context, lifecycle_stages: optionalStages(event.target.value) })} /></label>
                  </fieldset>

                  <fieldset>
                    <legend>03 / 双时态</legend>
                    <label><span>系统获知</span><FieldEvidence field="observed_at" locator={evidenceLocator} /><input value={draft.observed_at} onChange={event => updateDraft('observed_at', event.target.value)} /></label>
                    <label><span>现实有效起点</span><FieldEvidence field="valid_time.from" locator={evidenceLocator} /><input value={draft.valid_time?.from ?? ''} onChange={event => updateDraft('valid_time', { from: event.target.value || null, until: draft.valid_time?.until ?? null })} placeholder="带时区 ISO 8601 或留空" /></label>
                    <label><span>现实有效终点</span><FieldEvidence field="valid_time.until" locator={evidenceLocator} /><input value={draft.valid_time?.until ?? ''} onChange={event => updateDraft('valid_time', { from: draft.valid_time?.from ?? null, until: event.target.value || null })} placeholder="开放区间，可留空" /></label>
                  </fieldset>

                  <fieldset>
                    <legend>04 / 来源证据</legend>
                    <label className="is-wide"><span>来源 URI</span><FieldEvidence field="source_refs.source_uri" locator={evidenceLocator} /><input value={draft.source_refs[0]?.source_uri ?? ''} onChange={event => updateDraft('source_refs', draft.source_refs.map((source, index) => index === 0 ? { ...source, source_uri: event.target.value } : source))} /></label>
                    <label><span>来源观察时间</span><FieldEvidence field="source_refs.observed_at" locator={evidenceLocator} /><input value={draft.source_refs[0]?.observed_at ?? ''} onChange={event => updateDraft('source_refs', draft.source_refs.map((source, index) => index === 0 ? { ...source, observed_at: event.target.value } : source))} /></label>
                    <label><span>权威来源</span><FieldEvidence field="source_refs.authority_origin" locator={evidenceLocator} /><select value={draft.source_refs[0]?.authority_origin ?? ''} onChange={event => updateDraft('source_refs', draft.source_refs.map((source, index) => index === 0 ? { ...source, authority_origin: event.target.value as typeof source.authority_origin } : source))}>{formOptions.authorityOrigins.map(value => <option key={value} value={value}>{humanLabel(value)}</option>)}</select></label>
                    <label><span>许可状态</span><FieldEvidence field="source_refs.license_status" locator={evidenceLocator} /><select value={draft.source_refs[0]?.license_status ?? ''} onChange={event => updateDraft('source_refs', draft.source_refs.map((source, index) => index === 0 ? { ...source, license_status: event.target.value as typeof source.license_status } : source))}>{formOptions.licenseStatuses.map(value => <option key={value} value={value}>{humanLabel(value)}</option>)}</select></label>
                    <dl className="review-editor__immutable is-wide"><div><dt>Locator</dt><dd>{draft.source_refs[0]?.locator}</dd></div><div><dt>Snapshot hash</dt><dd>{draft.source_refs[0]?.snapshot_hash}</dd></div></dl>
                  </fieldset>

                  <footer>
                    <MutationStatus state={mutationState} detail={status || (dirty ? '修改保存在浏览器草稿区，尚未产生新修订。' : '当前表单与已保存修订一致。')} />
                    <button type="button" disabled={!dirty || saving} onClick={() => { setDraft(patchFromObject(record.object)); window.localStorage.removeItem(reviewDraftStorageKey(record.object.object_id)); setStatus('草稿已放弃；没有产生 revision。'); }}><RotateCcw aria-hidden="true" />放弃草稿</button>
                    <button type="submit" disabled={!dirty || saving}>{saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}保存候选修订</button>
                  </footer>
                </form>
              ) : (
                <section className="review-readonly">
                  <ShieldAlert aria-hidden="true" />
                  <div><h3>{isMobile ? '移动端只读复核' : writePolicy.mode === 'readonly' ? '当前环境只读' : '请先解锁 Owner 会话'}</h3><p>来源、时态和历史可查看；写控件只有桌面 Owner 鉴权后才会渲染。</p></div>
                </section>
              )}

              {status && !canEdit ? <p className="review-dossier__status" role="status">{status}</p> : null}
            </>
          ) : <div className="review-dossier__loading" role="status">{status || '请选择待复核对象。'}</div>}

          <aside className="review-history" aria-label="对象修订历史">
          <header><History aria-hidden="true" /><div><span>LEDGER</span><strong>Revision history</strong></div></header>
          {record ? (
            <ol>
              {record.revisions.map(revision => (
                <li key={revision.revision} data-current={revision.current}>
                  <span><FileClock aria-hidden="true" />R{revision.revision}</span>
                  <strong>{revision.title}</strong>
                  <small><Clock3 aria-hidden="true" />{formatDisplayDateTime(revision.observedAt)}</small>
                  <code>{revision.objectHash.slice(0, 20)}…</code>
                  {revision.current ? <em><CheckCircle2 aria-hidden="true" />CURRENT</em> : null}
                </li>
              ))}
            </ol>
          ) : <p>选择对象后显示不可变修订。</p>}
          </aside>
        </main>
      </div>
    </div>
  );
}
