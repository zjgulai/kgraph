'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Download, FlaskConical, Gauge, KeyRound, LoaderCircle, ShieldAlert, Sparkles, Upload } from 'lucide-react';
import { OwnerSessionControl } from '@/components/canvas/OwnerSessionControl';
import type { CaptureSummary } from '@/lib/server/knowledge-capture-store';
import type { EnrichmentSummary } from '@/lib/server/knowledge-enrichment-store';
import type {
  EnrichmentEvaluationReport,
  GoldAnnotationSummary,
} from '@/lib/server/knowledge-enrichment-eval';
import type { PilotReadinessReport } from '@/lib/server/knowledge-enrichment-pilot';
import type { PilotAuthorizationRequest } from '@/lib/server/knowledge-enrichment-authorization-request';
import type { WritePolicy } from '@/lib/server/write-guard';

interface RuntimeStatus {
  mode: 'disabled' | 'configured';
  providerId: string | null;
  modelId: string | null;
  ready: boolean;
  reason: string;
  jobId?: string;
  policyHash?: string;
  budget?: {
    maxCalls: number;
    reservedCalls: number;
    remainingCalls: number;
    providerCompletedCalls: number;
    providerFailedCalls: number;
  };
}

interface Props {
  captures: CaptureSummary[];
  initialEnrichments: EnrichmentSummary[];
  initialGold: GoldAnnotationSummary[];
  runtime: RuntimeStatus;
  evaluation: EnrichmentEvaluationReport;
  pilot?: PilotReadinessReport;
  writePolicy: WritePolicy;
}

const DEFAULT_PILOT_READINESS: PilotReadinessReport = {
  schemaVersion: 'doccanvas-enrichment-pilot-readiness-v2', mode: 'disabled', state: 'not_configured',
  pilotId: null, planHash: null, jobId: null, modelId: null,
  cohortCount: 0, resultCount: 0, goldCount: 0, reservedCalls: 0,
  providerCompletedCalls: 0, providerFailedCalls: 0, remainingCalls: 0,
  readyForCanary: false, readyForBatch: false, readyForReadinessEvaluation: false,
  authorizedStage: null, stageAuthorizationId: null, stageAuthorizationHash: null,
  authorizedCaptureIds: [], executionAllowed: false,
  gates: [
    { id: 'policy', status: 'blocked', reason: 'pilot_plan_not_configured', actual: false, required: true },
    { id: 'authorization', status: 'blocked', reason: 'pilot_plan_not_configured', actual: false, required: true },
    { id: 'cohort', status: 'blocked', reason: 'pilot_plan_not_configured', actual: 0, required: 20 },
    { id: 'budget', status: 'blocked', reason: 'pilot_plan_not_configured', actual: 0, required: 20 },
    { id: 'canary', status: 'blocked', reason: 'pilot_plan_not_configured', actual: 0, required: 1 },
    { id: 'gold', status: 'blocked', reason: 'pilot_plan_not_configured', actual: 0, required: 20 },
    { id: 'stage_authorization', status: 'blocked', reason: 'pilot_plan_not_configured', actual: false, required: true },
  ],
  nextAction: 'configure_exact_pilot_plan',
};

const objectTypes = [
  'problem', 'claim', 'evidence', 'pattern', 'decision', 'technology', 'tool', 'tip',
  'failure_mode', 'artifact', 'quality_gate', 'capability_gene', 'commercial_hypothesis',
  'experiment', 'feedback', 'revision',
] as const;

const subforms = {
  fact: ['definition', 'observation', 'measurement', 'constraint'],
  procedure: ['checklist', 'workflow', 'technique', 'playbook'],
  framework: ['model', 'taxonomy', 'decision_framework', 'architecture'],
  metacognitive: ['heuristic', 'mental_model', 'reflection', 'learning_strategy'],
} as const;

function useMobileEnrichment(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}

function metric(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function gateLabel(report: EnrichmentEvaluationReport, name: keyof EnrichmentEvaluationReport['metrics']): string {
  const gate = report.gates.find(item => item.metric === name);
  if (!gate) return 'gate unavailable';
  return `${gate.operator === 'minimum' ? '≥' : '≤'} ${metric(gate.threshold)}`;
}

export function EnrichmentWorkspace({
  captures,
  initialEnrichments,
  initialGold,
  runtime,
  evaluation: initialEvaluation,
  pilot = DEFAULT_PILOT_READINESS,
  writePolicy,
}: Props) {
  const [enrichments, setEnrichments] = useState(initialEnrichments);
  const [gold, setGold] = useState(initialGold);
  const [evaluation, setEvaluation] = useState(initialEvaluation);
  const [pilotReadiness, setPilotReadiness] = useState(pilot);
  const [authorizationRequest, setAuthorizationRequest] = useState<PilotAuthorizationRequest | null>(null);
  const [ownerAuthenticated, setOwnerAuthenticated] = useState(writePolicy.mode === 'dev');
  const [selectedId, setSelectedId] = useState(initialEnrichments[0]?.enrichmentId ?? '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [attested, setAttested] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [keyPoints, setKeyPoints] = useState('');
  const [objectType, setObjectType] = useState<(typeof objectTypes)[number] | ''>('');
  const [primary, setPrimary] = useState<keyof typeof subforms | ''>('');
  const [subform, setSubform] = useState('');
  const [domains, setDomains] = useState('');
  const [startLine, setStartLine] = useState(1);
  const [endLine, setEndLine] = useState(1);
  const mobile = useMobileEnrichment();
  const canWrite = writePolicy.writable && ownerAuthenticated && !mobile;
  const canExecuteProvider = canWrite && runtime.ready && pilotReadiness.executionAllowed;
  const selected = enrichments.find(item => item.enrichmentId === selectedId) ?? enrichments[0] ?? null;
  const selectedGold = selected ? gold.find(item => item.annotation.captureId === selected.captureId) ?? null : null;
  const captureWithoutEnrichment = useMemo(() => captures.filter(capture => (
    !enrichments.some(item => item.captureId === capture.captureId)
  )), [captures, enrichments]);
  const authorizedCaptures = useMemo(() => {
    const allowed = new Set(pilotReadiness.authorizedCaptureIds);
    return captureWithoutEnrichment.filter(capture => allowed.has(capture.captureId));
  }, [captureWithoutEnrichment, pilotReadiness.authorizedCaptureIds]);

  useEffect(() => {
    if (selectedGold) {
      setTitle(selectedGold.annotation.title);
      setSummary(selectedGold.annotation.summary);
      setKeyPoints(selectedGold.annotation.keyPoints.join('\n'));
      setObjectType(selectedGold.annotation.classification.objectType);
      setPrimary(selectedGold.annotation.classification.knowledgeForm.primary);
      setSubform(selectedGold.annotation.classification.knowledgeForm.subform);
      setDomains(selectedGold.annotation.classification.domainRefs.join(', '));
      const locator = selectedGold.annotation.classification.evidenceLocators[0];
      setStartLine(locator?.startLine ?? 1);
      setEndLine(locator?.endLine ?? 1);
    } else {
      setTitle('');
      setSummary('');
      setKeyPoints('');
      setObjectType('');
      setPrimary('');
      setSubform('');
      setDomains('');
      setStartLine(1);
      setEndLine(1);
    }
    setAttested(false);
  }, [selected?.enrichmentId, selectedGold]);

  const refresh = async () => {
    const response = await fetch('/api/knowledge/enrichments', { cache: 'no-store', credentials: 'same-origin' });
    const payload = await response.json() as {
      enrichments?: EnrichmentSummary[]; evaluation?: EnrichmentEvaluationReport; gold?: GoldAnnotationSummary[];
      pilot?: PilotReadinessReport; error?: string;
    };
    if (!response.ok || !payload.enrichments || !payload.evaluation) throw new Error(payload.error || 'Enrichment 状态刷新失败。');
    setEnrichments(payload.enrichments);
    setEvaluation(payload.evaluation);
    if (payload.gold) setGold(payload.gold);
    if (payload.pilot) setPilotReadiness(payload.pilot);
  };

  const exportGoldPack = async () => {
    if (!canWrite || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/knowledge/enrichments/gold/batch', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export' }),
      });
      const payload = await response.json() as { pack?: { packId: string }; error?: string };
      if (!response.ok || !payload.pack) throw new Error(payload.error || 'Human-gold 任务包导出失败。');
      const blob = new Blob([`${JSON.stringify(payload.pack, null, 2)}\n`], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${payload.pack.packId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus('空白 Human-gold 任务包已导出；其中不包含模型输出。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Human-gold 任务包导出失败。');
    } finally {
      setBusy(false);
    }
  };

  const exportAuthorizationRequest = async () => {
    if (!canWrite || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/knowledge/enrichments/pilot/authorization-request', {
        cache: 'no-store', credentials: 'same-origin',
      });
      const payload = await response.json() as { request?: PilotAuthorizationRequest; error?: string };
      if (!response.ok || !payload.request) throw new Error(payload.error || 'Pilot 授权请求生成失败。');
      setAuthorizationRequest(payload.request);
      const blob = new Blob([`${JSON.stringify(payload.request, null, 2)}\n`], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `pilot-authorization-request-${payload.request.requestHash.slice(7, 19)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus(payload.request.state === 'ready_for_receipt'
        ? 'L2 授权请求已导出；它不是 Stage Authorization Receipt，也不会执行 Provider。'
        : `授权请求已导出，当前状态：${payload.request.state}。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Pilot 授权请求生成失败。');
    } finally {
      setBusy(false);
    }
  };

  const importGoldPack = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!canWrite || !file || busy) return;
    setBusy(true);
    setStatus('');
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error('Human-gold 任务包不能超过 3 MiB。');
      const pack = JSON.parse(await file.text()) as unknown;
      const response = await fetch('/api/knowledge/enrichments/gold/batch', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', pack }),
      });
      const payload = await response.json() as { importedCount?: number; resumable?: boolean; error?: string };
      if (!response.ok) throw new Error(`${payload.error || 'Human-gold 任务包导入失败。'}${payload.resumable ? ' 可修正后安全重试同一任务包。' : ''}`);
      await refresh();
      setStatus(`已导入 ${payload.importedCount ?? 0} 条独立 Human-gold；模型输出未参与预填。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Human-gold 任务包导入失败。');
    } finally {
      setBusy(false);
    }
  };

  const run = async (captureId: string) => {
    if (!canExecuteProvider || !pilotReadiness.authorizedCaptureIds.includes(captureId) || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/knowledge/enrichments', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captureId, mutationId: `enrichment.ui.${crypto.randomUUID()}` }),
      });
      const payload = await response.json() as { enrichment?: EnrichmentSummary; error?: string };
      if (!response.ok || !payload.enrichment) throw new Error(payload.error || 'AI Enrichment 失败。');
      await refresh();
      setSelectedId(payload.enrichment.enrichmentId);
      setStatus('结构化结果已保存为 human_review_required candidate。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'AI Enrichment 失败。');
    } finally {
      setBusy(false);
    }
  };

  const saveGold = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canWrite || !selected || !attested || !objectType || !primary || !subform || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const annotation = {
        captureId: selected.captureId,
        sourceHash: selected.inputHash,
        title,
        summary,
        keyPoints: keyPoints.split('\n').map(item => item.trim()).filter(Boolean),
        classification: {
          objectType,
          knowledgeForm: { primary, subform },
          domainRefs: domains.split(',').map(item => item.trim()).filter(Boolean),
          evidenceLocators: [{ startLine, endLine }],
        },
      };
      const response = await fetch('/api/knowledge/enrichments/gold', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annotation,
          mutationId: `gold.ui.${crypto.randomUUID()}`,
          ...(selectedGold ? { baseRevision: selectedGold.revision, baseAnnotationHash: selectedGold.annotationHash } : {}),
        }),
      });
      const payload = await response.json() as { gold?: GoldAnnotationSummary; error?: string };
      if (!response.ok || !payload.gold) throw new Error(payload.error || 'Human-gold 保存失败。');
      setGold(current => [payload.gold!, ...current.filter(item => item.annotation.captureId !== payload.gold!.annotation.captureId)]);
      await refresh();
      setAttested(false);
      setStatus(`Human-gold R${payload.gold.revision} 已保存；模型输出没有被自动当作 gold。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Human-gold 保存失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="enrichment-workspace" aria-labelledby="enrichment-title">
      <header className="enrichment-workspace__masthead">
        <div><span>ENRICHMENT LAB / EVIDENCE BOUND</span><h1 id="enrichment-title">AI Enrichment</h1><p>生成式摘要与分类只成为待审候选；人工金标和质量门独立保存，不把模型答案循环认证成真相。</p></div>
        <div className="enrichment-workspace__runtime" data-ready={runtime.ready && pilotReadiness.executionAllowed}>
          {runtime.ready && pilotReadiness.executionAllowed ? <CheckCircle2 aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />}
          <p><strong>{runtime.ready && pilotReadiness.executionAllowed ? 'Provider stage authorized' : 'Provider disabled'}</strong><span>{runtime.ready ? pilotReadiness.nextAction : runtime.reason}</span><code>{runtime.providerId ?? 'none'} / {runtime.modelId ?? 'none'}</code></p>
          {runtime.jobId && <p className="enrichment-workspace__budget"><span>{runtime.jobId}</span><code>{runtime.budget?.remainingCalls ?? 0}/{runtime.budget?.maxCalls ?? 0} calls left</code></p>}
          {!mobile && <OwnerSessionControl writePolicy={writePolicy} onAuthenticatedChange={setOwnerAuthenticated} />}
        </div>
      </header>

      <section className="enrichment-eval" aria-label="Human-gold evaluation gate">
        <header><Gauge aria-hidden="true" /><div><small>HUMAN-GOLD GATE</small><h2>{evaluation.status}</h2></div><strong>{evaluation.sampleCount}/{evaluation.minimumSamples} samples</strong></header>
        <dl>
          <div><dt>Classification exact</dt><dd>{metric(evaluation.metrics.classificationExactMatch)}</dd><small>{gateLabel(evaluation, 'classificationExactMatch')}</small></div>
          <div><dt>Title token F1</dt><dd>{metric(evaluation.metrics.titleTokenF1)}</dd><small>{gateLabel(evaluation, 'titleTokenF1')}</small></div>
          <div><dt>Summary token F1</dt><dd>{metric(evaluation.metrics.summaryTokenF1)}</dd><small>{gateLabel(evaluation, 'summaryTokenF1')}</small></div>
          <div><dt>Key-point coverage</dt><dd>{metric(evaluation.metrics.keyPointCoverage)}</dd><small>{gateLabel(evaluation, 'keyPointCoverage')}</small></div>
          <div><dt>Invalid locator</dt><dd>{metric(evaluation.metrics.invalidEvidenceLocatorRate)}</dd><small>{gateLabel(evaluation, 'invalidEvidenceLocatorRate')}</small></div>
          <div><dt>Schema failure</dt><dd>{metric(evaluation.metrics.schemaFailureRate)}</dd><small>{gateLabel(evaluation, 'schemaFailureRate')}</small></div>
        </dl>
        {canWrite && enrichments.length > 0 && (
          <div className="enrichment-eval__batch" aria-label="Human-gold batch operations">
            <button type="button" disabled={busy} onClick={() => void exportGoldPack()}><Download aria-hidden="true" />导出空白任务包</button>
            <label><Upload aria-hidden="true" />导入独立标注<input type="file" accept="application/json,.json" disabled={busy} onChange={event => void importGoldPack(event)} /></label>
          </div>
        )}
      </section>

      <section className="enrichment-pilot" aria-label="Provider pilot readiness">
        <header>
          <ShieldAlert aria-hidden="true" />
          <div><small>PILOT CONTROL PLANE / ATOMIC GATE</small><h2>{pilotReadiness.state}</h2></div>
          <strong>{pilotReadiness.cohortCount}/20 cohort · {pilotReadiness.goldCount}/20 gold</strong>
        </header>
        <div className="enrichment-pilot__gates">
          {pilotReadiness.gates.map(item => (
            <article key={item.id} data-status={item.status}>
              <span>{item.id}</span>
              <strong>{item.status}</strong>
              <code>{item.reason}</code>
              <small>{String(item.actual)} / {String(item.required)}</small>
            </article>
          ))}
        </div>
        <footer>
          <span>Next hard gate</span><code>{pilotReadiness.nextAction}</code>
          <p>{pilotReadiness.executionAllowed
            ? `${pilotReadiness.authorizedStage} receipt 已允许 ${pilotReadiness.authorizedCaptureIds.length} 条当前 Capture；每次调用仍经过服务端原子 gate。`
            : '本视图只做预检；没有当前 Stage Authorization Receipt 时不执行 Provider 调用。'}</p>
          {canWrite && <button className="enrichment-pilot__request-action" type="button" disabled={busy} onClick={() => void exportAuthorizationRequest()}>
            <Download aria-hidden="true" />导出授权请求
          </button>}
        </footer>
        {!mobile && authorizationRequest && (
          <aside className="enrichment-pilot__request" aria-label="Pilot authorization request evidence">
            <header><span>{authorizationRequest.evidenceGrade}</span><strong>{authorizationRequest.state}</strong><code>{authorizationRequest.requestHash}</code></header>
            <dl>
              <div><dt>Requested stage</dt><dd>{authorizationRequest.requestedStage ?? 'none'}</dd></div>
              <div><dt>Exact scope</dt><dd>{authorizationRequest.requestedCaptureIds.length} Capture</dd></div>
              <div><dt>Ledger baseline</dt><dd>{authorizationRequest.ledgerBaseline.reservedCalls} reserved</dd></div>
              <div><dt>Authorization</dt><dd>{authorizationRequest.authorizationGranted ? 'granted' : 'not granted'}</dd></div>
            </dl>
            {authorizationRequest.requestedCaptureIds.length > 0 && <details><summary>查看 exact Capture scope</summary><ol>{authorizationRequest.requestedCaptureIds.map(id => <li key={id}><code>{id}</code></li>)}</ol></details>}
            {authorizationRequest.blockers.length > 0 && <p><strong>Blockers</strong>{authorizationRequest.blockers.join(' · ')}</p>}
            <small>此文件只定义审批对象，不创建 receipt、不授予权限、不调用 Provider。</small>
          </aside>
        )}
      </section>

      {mobile && <p className="enrichment-workspace__mobile-note">移动端只读：Provider 触发和 human-gold 标注只在桌面 Owner 会话开放。</p>}
      {status && <p className="enrichment-workspace__status" role="status">{status}</p>}

      <div className="enrichment-workspace__grid">
        <section className="enrichment-queue">
          <header><Bot aria-hidden="true" /><div><small>STRUCTURED RESULTS</small><h2>{enrichments.length} 条结果</h2></div></header>
          {canExecuteProvider && authorizedCaptures.length > 0 && (
            <div className="enrichment-queue__pending">
              <strong>{pilotReadiness.authorizedStage === 'canary' ? '已授权 Canary' : '已授权 Batch'}</strong>
              {authorizedCaptures.map(capture => <button key={capture.captureId} type="button" disabled={busy} onClick={() => void run(capture.captureId)}>{busy ? <LoaderCircle aria-hidden="true" /> : <Sparkles aria-hidden="true" />}{capture.title}</button>)}
            </div>
          )}
          {enrichments.length === 0 ? (
            <div className="enrichment-queue__empty"><FlaskConical aria-hidden="true" /><strong>尚无生成式结果</strong><span>当前 Provider 门关闭；Capture 的 extractive candidate 仍可独立进入 Review。</span></div>
          ) : (
            <ol>{enrichments.map(item => <li key={item.enrichmentId} data-active={item.enrichmentId === selected?.enrichmentId}><button type="button" onClick={() => setSelectedId(item.enrichmentId)}><small>{item.executionMode} · {item.providerCall ? 'provider call' : 'no provider call'}</small><strong>{item.title}</strong><span>{item.providerId} / {item.modelId}</span><code>{item.inputHash.slice(7, 19)} · {item.reviewState}</code></button></li>)}</ol>
          )}
        </section>

        <section className="enrichment-inspector">
          {!selected ? (
            <div className="enrichment-queue__empty"><Bot aria-hidden="true" /><strong>等待结构化结果</strong><span>系统不会在 Provider disabled 时偷偷调用模型。</span></div>
          ) : (
            <>
              <header><div><small>MODEL CANDIDATE / NOT GOLD</small><h2>{selected.title}</h2></div><span>{selected.reviewState}</span></header>
              <p>{selected.summary}</p>
              <ul>{selected.keyPoints.map(point => <li key={point}>{point}</li>)}</ul>
              <dl><div><dt>classification</dt><dd>{selected.objectType} / {selected.knowledgeForm.primary}.{selected.knowledgeForm.subform}</dd></div><div><dt>domains</dt><dd>{selected.domainRefs.join(', ')}</dd></div><div><dt>usage</dt><dd>{selected.usage.totalTokens ?? 'not reported'} tokens</dd></div><div><dt>config</dt><dd><code>{selected.configHash.slice(7, 19)}</code></dd></div></dl>

              {canWrite && (
                <form className="enrichment-gold-form" onSubmit={saveGold}>
                  <header><KeyRound aria-hidden="true" /><div><small>INDEPENDENT HUMAN ANNOTATION</small><h3>{selectedGold ? `Human-gold R${selectedGold.revision}` : '创建 Human-gold'}</h3></div></header>
                  {!selectedGold && <p>字段保持空白，必须由人独立填写；不会从模型结果自动复制。</p>}
                  <label>人工标题<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>
                  <label>人工摘要<textarea required rows={5} maxLength={1200} value={summary} onChange={event => setSummary(event.target.value)} /></label>
                  <label>人工要点（每行一条）<textarea required rows={5} value={keyPoints} onChange={event => setKeyPoints(event.target.value)} /></label>
                  <div className="enrichment-gold-form__classification">
                    <label>Object type<select required value={objectType} onChange={event => setObjectType(event.target.value as typeof objectType)}><option value="">请选择</option>{objectTypes.map(item => <option key={item}>{item}</option>)}</select></label>
                    <label>Primary<select required value={primary} onChange={event => { const value = event.target.value as keyof typeof subforms | ''; setPrimary(value); setSubform(''); }}><option value="">请选择</option>{Object.keys(subforms).map(item => <option key={item}>{item}</option>)}</select></label>
                    <label>Subform<select required disabled={!primary} value={subform} onChange={event => setSubform(event.target.value)}><option value="">请选择</option>{primary && subforms[primary].map(item => <option key={item}>{item}</option>)}</select></label>
                  </div>
                  <label>Domain refs（逗号分隔）<input required value={domains} onChange={event => setDomains(event.target.value)} /></label>
                  <div className="enrichment-gold-form__classification"><label>证据起始行<input type="number" min={1} required value={startLine} onChange={event => setStartLine(Number(event.target.value))} /></label><label>证据结束行<input type="number" min={startLine} required value={endLine} onChange={event => setEndLine(Number(event.target.value))} /></label></div>
                  <label className="enrichment-gold-form__attest"><input type="checkbox" checked={attested} onChange={event => setAttested(event.target.checked)} />我已独立核对来源快照，不是直接接受模型输出。</label>
                  <button type="submit" disabled={!attested || busy}>{busy ? <LoaderCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}{selectedGold ? '保存新 revision' : '保存 Human-gold'}</button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
