'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, CheckCircle2, CircleAlert, Download, FileClock, LoaderCircle, RefreshCw, Save, ShieldAlert, Workflow } from 'lucide-react';
import { OwnerSessionControl } from '@/components/canvas/OwnerSessionControl';
import { MutationStatus, type MutationStatusKind } from '@/components/ui/MutationStatus';
import { governanceGateLabel, humanLabel } from '@/lib/presentation/human-labels';
import type { BlueprintCandidateRecord, BlueprintCandidateSummary } from '@/lib/server/blueprint-workspace-store';
import type { ProductBlueprint } from '../../../scripts/lib/blueprint-contract';
import type { WritePolicy } from '@/lib/server/write-guard';
import type { BlueprintRevisionComparison } from '@/lib/product/blueprint-diff';
import type { BlueprintCompilePreview } from '@/lib/server/blueprint-artifact-store';
import type { ProductChainProjection } from '@/lib/product/product-chain';
import {
  blueprintDraftStorageKey,
  parseBlueprintDraft,
  serializeBlueprintDraft,
  type StoredBlueprintDraft,
} from '@/lib/product/workspace-drafts';

interface Props {
  writePolicy: WritePolicy;
  initialBlueprintId?: string | null;
  initialRevision?: number | null;
  chain?: ProductChainProjection | null;
  onDirtyChange?: (dirty: boolean) => void;
  onBlueprintSelected?: (blueprintId: string) => void;
  onArtifactCompiled?: () => void;
}

function useMobileReadonly() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return mobile;
}

type BlueprintSection = 'task' | 'solution' | 'governance' | 'history';

export function BlueprintWorkspace({ writePolicy, initialBlueprintId, initialRevision, chain, onDirtyChange, onBlueprintSelected, onArtifactCompiled }: Props) {
  const [items, setItems] = useState<BlueprintCandidateSummary[]>([]);
  const [selectedId, setSelectedId] = useState(initialBlueprintId ?? '');
  const [record, setRecord] = useState<BlueprintCandidateRecord | null>(null);
  const [draft, setDraft] = useState<ProductBlueprint | null>(null);
  const [ownerAuthenticated, setOwnerAuthenticated] = useState(writePolicy.mode === 'dev');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [compiledYaml, setCompiledYaml] = useState('');
  const [section, setSection] = useState<BlueprintSection>('task');
  const [comparison, setComparison] = useState<BlueprintRevisionComparison | null>(null);
  const [preview, setPreview] = useState<BlueprintCompilePreview | null>(null);
  const [approvalRationale, setApprovalRationale] = useState('人工复核 Product Task、证据、方案、硬门与 execution spec 后批准。');
  const [staleDraft, setStaleDraft] = useState<StoredBlueprintDraft | null>(null);
  const mobile = useMobileReadonly();
  const canEdit = writePolicy.writable && ownerAuthenticated && !mobile;
  const dirty = useMemo(() => Boolean(record && draft && JSON.stringify(record.blueprint) !== JSON.stringify(draft)), [draft, record]);
  const mutationState: MutationStatusKind = busy
    ? 'saving'
    : dirty
      ? 'dirty'
      : /失败|阻断|变化/u.test(status)
        ? 'failed'
        : /已保存|已批准|create-only 保存/u.test(status)
          ? 'saved'
          : 'draft';

  const loadList = useCallback(async () => {
    const response = await fetch('/api/blueprints', { cache: 'no-store', credentials: 'same-origin' });
    const payload = await response.json() as { blueprints?: BlueprintCandidateSummary[]; error?: string };
    if (!response.ok || !payload.blueprints) throw new Error(payload.error || 'Blueprint 列表加载失败。');
    const blueprints = payload.blueprints;
    setItems(blueprints);
    setSelectedId(current => current || initialBlueprintId || blueprints[0]?.blueprintId || '');
  }, [initialBlueprintId]);

  const loadRecord = useCallback(async (blueprintId: string) => {
    if (!blueprintId) {
      setRecord(null);
      setDraft(null);
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch(`/api/blueprints/${encodeURIComponent(blueprintId)}`, { cache: 'no-store', credentials: 'same-origin' });
      const payload = await response.json() as BlueprintCandidateRecord & { error?: string };
      if (!response.ok || !payload.blueprint) throw new Error(payload.error || 'Blueprint 加载失败。');
      setRecord(payload);
      const stored = parseBlueprintDraft(window.localStorage.getItem(blueprintDraftStorageKey(payload.blueprintId)));
      if (stored && stored.baseRevision === payload.revision && stored.baseDocumentHash === payload.documentHash) {
        setDraft(structuredClone(stored.draft));
        setStaleDraft(null);
        setStatus('已恢复浏览器本地 Blueprint 草稿；尚未写入新 revision。');
      } else {
        setDraft(structuredClone(payload.blueprint));
        setStaleDraft(stored);
        if (stored) setStatus('检测到基于旧 revision 的本地草稿；已保留，需在 Revision Diff 中人工选择。');
      }
      setCompiledYaml('');
      setPreview(null);
      const fromRevision = initialRevision && payload.revisions.includes(initialRevision)
        ? initialRevision
        : payload.revisions.find(revision => revision < payload.revision) ?? null;
      if (fromRevision) {
        const compareResponse = await fetch(`/api/blueprints/${encodeURIComponent(blueprintId)}?from=${fromRevision}&to=${payload.revision}`, { cache: 'no-store', credentials: 'same-origin' });
        const compared = await compareResponse.json() as BlueprintRevisionComparison & { error?: string };
        if (!compareResponse.ok) throw new Error(compared.error || 'Blueprint revision diff 加载失败。');
        setComparison(compared);
      } else {
        setComparison(null);
      }
    } catch (error) {
      setRecord(null);
      setDraft(null);
      setStatus(error instanceof Error ? error.message : 'Blueprint 加载失败。');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadList().catch(error => setStatus(error instanceof Error ? error.message : 'Blueprint 列表加载失败。'));
  }, [loadList]);
  useEffect(() => { void loadRecord(selectedId); }, [loadRecord, selectedId]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!record || !draft || !dirty) return;
    window.localStorage.setItem(blueprintDraftStorageKey(record.blueprintId), serializeBlueprintDraft({
      blueprintId: record.blueprintId,
      baseRevision: record.revision,
      baseDocumentHash: record.documentHash,
      draft,
    }));
  }, [dirty, draft, record]);

  const select = (blueprintId: string) => {
    if (blueprintId === selectedId) return;
    if (dirty && !window.confirm('当前 Blueprint 有未保存草稿。放弃并切换？')) return;
    setSelectedId(blueprintId);
    onBlueprintSelected?.(blueprintId);
  };

  const save = async () => {
    if (!record || !draft || !canEdit || !dirty || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const next = { ...draft, version: record.revision + 1 };
      const response = await fetch(`/api/blueprints/${encodeURIComponent(record.blueprintId)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseRevision: record.revision, baseDocumentHash: record.documentHash, blueprint: next }),
      });
      const payload = await response.json() as BlueprintCandidateRecord & { error?: string };
      if (!response.ok || !payload.blueprint) {
        if (response.status === 409) throw new Error('Blueprint 已被其他会话更新。保留当前草稿，请重新载入后合并。');
        throw new Error(payload.error || 'Blueprint 保存失败。');
      }
      setRecord(payload);
      setDraft(structuredClone(payload.blueprint));
      setPreview(null);
      setStaleDraft(null);
      window.localStorage.removeItem(blueprintDraftStorageKey(payload.blueprintId));
      await loadList();
      setStatus(`Blueprint revision ${payload.revision} 已保存；未执行批准或发布。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Blueprint 保存失败。');
    } finally {
      setBusy(false);
    }
  };

  const createPreview = async () => {
    if (!record || !canEdit || busy) return;
    if (record.blueprint.status !== 'approved' || !record.blueprint.execution) {
      setCompiledYaml('');
      setPreview(null);
      setStatus('治理门已阻断：只有 approved 且包含完整 execution spec 的 Blueprint 才能编译。');
      return;
    }
    setBusy(true);
    setStatus('');
    setCompiledYaml('');
    try {
      const compiledAt = new Date().toISOString();
      const params = new URLSearchParams({
        baseRevision: String(record.revision),
        baseDocumentHash: record.documentHash,
        compiledAt,
      });
      const response = await fetch(`/api/blueprints/${encodeURIComponent(record.blueprintId)}/compile?${params.toString()}`, {
        cache: 'no-store', credentials: 'same-origin',
      });
      const payload = await response.json() as BlueprintCompilePreview & { error?: string; code?: string };
      if (!response.ok || !payload.inputHash) {
        if (payload.code === 'BLUEPRINT_NOT_COMPILE_READY') throw new Error('治理门已阻断：只有 approved 且包含完整 execution spec 的 Blueprint 才能编译。');
        throw new Error(payload.error || '编译预览失败。');
      }
      setPreview(payload);
      setStatus('编译预览已生成；尚未创建 Artifact。请核对 exact input hash 与输出后再编译。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '编译预览失败。');
    } finally {
      setBusy(false);
    }
  };

  const compile = async () => {
    if (!record || !preview || !canEdit || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch(`/api/blueprints/${encodeURIComponent(record.blueprintId)}/compile`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseRevision: preview.blueprintRevision, baseDocumentHash: preview.inputHash, compiledAt: preview.compiledAt }),
      });
      const payload = await response.json() as { genomeYaml?: string; manifest?: { genomeHash: string }; error?: string; code?: string };
      if (!response.ok || !payload.genomeYaml) {
        if (payload.code === 'BLUEPRINT_COMPILE_INPUT_DRIFT') throw new Error('Blueprint 已变化，旧编译预览失效。请重新生成预览。');
        throw new Error(payload.error || 'Blueprint 编译失败。');
      }
      setCompiledYaml(payload.genomeYaml);
      setPreview(null);
      setStatus(`Genome 已通过二次校验并 create-only 保存：${payload.manifest?.genomeHash ?? ''}`);
      onArtifactCompiled?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Blueprint 编译失败。');
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!record || !draft || !canEdit || dirty || busy || !draft.decision.primary_option_id) return;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch(`/api/blueprints/${encodeURIComponent(record.blueprintId)}/approve`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseRevision: record.revision,
          baseDocumentHash: record.documentHash,
          primaryOptionId: draft.decision.primary_option_id,
          rationale: approvalRationale,
        }),
      });
      const payload = await response.json() as BlueprintCandidateRecord & { error?: string };
      if (!response.ok || !payload.blueprint) throw new Error(payload.error || 'Blueprint 批准失败。');
      setRecord(payload);
      setDraft(structuredClone(payload.blueprint));
      setPreview(null);
      setStaleDraft(null);
      window.localStorage.removeItem(blueprintDraftStorageKey(payload.blueprintId));
      await loadList();
      setStatus(`Blueprint R${payload.revision} 已批准；尚未编译 Artifact。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Blueprint 批准失败。');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!record || !compiledYaml) return;
    const url = URL.createObjectURL(new Blob([compiledYaml], { type: 'application/yaml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${record.blueprintId}-r${record.revision}-product-genome.yaml`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const updateTask = (key: 'goal' | 'problem', value: string) => setDraft(current => current ? {
    ...current, product_task: { ...current.product_task, [key]: value },
  } : current);
  const updateOption = (index: number, key: 'title' | 'description', value: string) => setDraft(current => current ? {
    ...current,
    options: current.options.map((option, optionIndex) => optionIndex === index ? { ...option, [key]: value } : option),
  } : current);
  const updateCommercial = (key: 'customer_job' | 'value_proposition' | 'value_unit' | 'experiment', value: string) => setDraft(current => current ? {
    ...current,
    commercial_hypotheses: current.commercial_hypotheses.map((hypothesis, index) => index === 0 ? { ...hypothesis, [key]: value } : hypothesis),
  } : current);

  return (
    <div className="blueprint-workspace">
      <header className="blueprint-workspace__masthead">
        <div>
          <span><Workflow aria-hidden="true" />Product / Blueprint Ledger</span>
          <h1>Blueprint Compiler</h1>
          <p>候选修订、治理诊断与 approved-only Genome 编译共享同一条证据链。</p>
        </div>
        <div className="blueprint-workspace__boundary">
          <ShieldAlert aria-hidden="true" />
          <p><strong>Compile gate enforced</strong><span>草稿不会生成空壳 Genome；artifact 永不覆盖</span></p>
          {!mobile ? <OwnerSessionControl writePolicy={writePolicy} onAuthenticatedChange={setOwnerAuthenticated} /> : null}
        </div>
      </header>

      <div className="blueprint-workspace__layout">
        <aside className="blueprint-list" aria-label="Blueprint 候选列表">
          <header><Boxes aria-hidden="true" /><div><span>CANDIDATES</span><strong>{items.length}</strong></div><button type="button" onClick={() => void loadList()} aria-label="刷新 Blueprint 列表"><RefreshCw aria-hidden="true" /></button></header>
          {items.length ? <ol>{items.map(item => <li key={item.blueprintId}>
            <button type="button" data-selected={selectedId === item.blueprintId} onClick={() => select(item.blueprintId)}>
              <span>{humanLabel(item.status)} · R{item.revision}</span><strong>{item.productName}</strong><code>{item.blueprintId}</code>
              <small>{item.compileReady ? <><CheckCircle2 aria-hidden="true" />可生成编译预览</> : <><CircleAlert aria-hidden="true" />等待治理条件</>}</small>
            </button>
          </li>)}</ol> : <p>尚无 Blueprint。先在 Solution Studio 保存候选方案。</p>}
        </aside>

        <main className="blueprint-dossier" aria-label="Blueprint 档案">
          {busy && !record ? <div className="blueprint-empty"><LoaderCircle className="animate-spin" aria-hidden="true" />加载 Blueprint…</div> : record && draft ? <>
            <header>
              <div><span>PRODUCT BLUEPRINT / R{record.revision}</span><h2>{draft.product_task.product_name}</h2><code>{record.blueprintId}</code></div>
              <div><em data-status={draft.status}>{humanLabel(draft.status)}</em><code>{record.documentHash.slice(0, 24)}…</code></div>
            </header>

            <nav className="blueprint-section-nav" aria-label="Blueprint sections">
              {([['task', 'Product Task'], ['solution', '方案'], ['governance', '治理与编译'], ['history', 'Revision Diff']] as const).map(([id, label]) => <button key={id} type="button" data-selected={section === id} onClick={() => setSection(id)}>{label}</button>)}
            </nav>

            {section === 'history' ? <section className="blueprint-diff-panel" aria-label="Blueprint revision diff">
              {staleDraft ? <aside className="stale-blueprint-draft"><strong>旧基线本地草稿</strong><span>R{staleDraft.baseRevision} / {staleDraft.baseDocumentHash.slice(0, 20)}…</span><div><button type="button" onClick={() => { setDraft({ ...structuredClone(staleDraft.draft), version: record.revision + 1 }); setStaleDraft(null); }}>人工应用到当前草稿</button><button type="button" onClick={() => { window.localStorage.removeItem(blueprintDraftStorageKey(record.blueprintId)); setStaleDraft(null); }}>放弃旧草稿</button></div></aside> : null}
              {comparison ? <><header><strong>R{comparison.fromRevision} → R{comparison.toRevision}</strong><span>{comparison.changes.length} changes</span></header><p>{comparison.knowledgeBaselineDrift ? 'Knowledge baseline 已漂移' : 'Knowledge baseline 未变化'}</p><ul>{comparison.changes.map(change => <li key={change.path}><code>{change.path}</code><span>{change.impact.length ? change.impact.join(' · ') : 'governance metadata'}</span></li>)}</ul><footer>重编译范围：{comparison.recompileScope.join(' · ') || 'none'}；受影响 Artifact：{comparison.affectedArtifactKeys.length}</footer></> : <p>当前只有一个 revision，暂无可比较版本。</p>}
            </section> : canEdit ? <form className="blueprint-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
              {section === 'task' ? <fieldset>
                <legend>01 / Product Task</legend>
                <label>候选状态{draft.status === 'draft' || draft.status === 'review' ? <select value={draft.status} onChange={event => setDraft(current => current ? { ...current, status: event.target.value as 'draft' | 'review' } : current)}><option value="draft">{humanLabel('draft')}</option><option value="review">{humanLabel('review')}</option></select> : <input value={humanLabel(draft.status)} readOnly aria-label="已治理 Blueprint 状态" />}</label>
                <label>知识基线<input value={draft.base_knowledge_revision} readOnly /></label>
                <label className="is-wide">目标<textarea rows={3} value={draft.product_task.goal} onChange={event => updateTask('goal', event.target.value)} /></label>
                <label className="is-wide">问题<textarea rows={3} value={draft.product_task.problem} onChange={event => updateTask('problem', event.target.value)} /></label>
                <label>Task ID<input value={draft.product_task.task_id} readOnly /></label>
                <label>目标用户<textarea rows={3} value={draft.product_task.target_users.join('\n')} readOnly /></label>
              </fieldset> : null}
              {section === 'solution' ? <fieldset>
                <legend>02 / 主备方案</legend>
                {draft.options.map((option, index) => <React.Fragment key={option.option_id}>
                  <label>{index === 0 ? '主候选标题' : '备选标题'}<input value={option.title} onChange={event => updateOption(index, 'title', event.target.value)} /></label>
                  <label>{index === 0 ? '主候选说明' : '备选说明'}<textarea rows={3} value={option.description} onChange={event => updateOption(index, 'description', event.target.value)} /></label>
                </React.Fragment>)}
              </fieldset> : null}
              {section === 'solution' ? <fieldset>
                <legend>03 / 商业假设</legend>
                <label>Customer Job<textarea rows={3} value={draft.commercial_hypotheses[0]?.customer_job ?? ''} onChange={event => updateCommercial('customer_job', event.target.value)} /></label>
                <label>价值主张<textarea rows={3} value={draft.commercial_hypotheses[0]?.value_proposition ?? ''} onChange={event => updateCommercial('value_proposition', event.target.value)} /></label>
                <label>价值单位<input value={draft.commercial_hypotheses[0]?.value_unit ?? ''} onChange={event => updateCommercial('value_unit', event.target.value)} /></label>
                <label>验证实验<input value={draft.commercial_hypotheses[0]?.experiment ?? ''} onChange={event => updateCommercial('experiment', event.target.value)} /></label>
              </fieldset> : null}
              {section === 'governance' ? <fieldset>
                <legend>04 / 治理、批准与编译</legend>
                <label>主方案<select value={draft.decision.primary_option_id ?? ''} onChange={event => setDraft(current => current ? { ...current, decision: { ...current.decision, primary_option_id: event.target.value || null } } : current)}><option value="">未选择</option>{draft.options.map(option => <option key={option.option_id} value={option.option_id}>{option.title}</option>)}</select></label>
                <label>证据结论<select value={draft.evidence_matrix[0]?.status ?? 'insufficient'} onChange={event => setDraft(current => current ? { ...current, evidence_matrix: current.evidence_matrix.map((item, index) => index === 0 ? { ...item, status: event.target.value as typeof item.status } : item) } : current)}>{['insufficient', 'supported', 'mixed', 'contradicted'].map(value => <option key={value} value={value}>{humanLabel(value)}</option>)}</select></label>
                {draft.constraints.hard_gates.map((gate, index) => <React.Fragment key={gate.gate_id}><label>硬门判据<input value={gate.criterion} onChange={event => setDraft(current => current ? { ...current, constraints: { ...current.constraints, hard_gates: current.constraints.hard_gates.map((item, gateIndex) => gateIndex === index ? { ...item, criterion: event.target.value } : item) } } : current)} /></label><label>硬门结果<select value={gate.result} onChange={event => setDraft(current => current ? { ...current, constraints: { ...current.constraints, hard_gates: current.constraints.hard_gates.map((item, gateIndex) => gateIndex === index ? { ...item, result: event.target.value as typeof item.result } : item) } } : current)}>{['pending', 'pass', 'fail', 'not_applicable'].map(value => <option key={value} value={value}>{humanLabel(value)}</option>)}</select></label></React.Fragment>)}
                {draft.options.map((option, index) => <label key={option.option_id}>{option.title} gate<select value={option.hard_gate_result} onChange={event => setDraft(current => current ? { ...current, options: current.options.map((item, optionIndex) => optionIndex === index ? { ...item, hard_gate_result: event.target.value as typeof item.hard_gate_result } : item) } : current)}>{['pending', 'pass', 'fail'].map(value => <option key={value} value={value}>{humanLabel(value)}</option>)}</select></label>)}
                <label className="is-wide">批准理由<textarea rows={3} value={approvalRationale} onChange={event => setApprovalRationale(event.target.value)} /></label>
                <p className="blueprint-execution-state">Execution spec：{draft.execution ? '已提供' : '缺失，批准与编译保持 BLOCK'}</p>
              </fieldset> : null}
              <footer>
                <MutationStatus state={mutationState} detail={status || (dirty ? '修改保存在浏览器草稿区，尚未产生新修订。' : '当前表单与已保存修订一致。')} />
                <button type="button" disabled={!dirty || busy} onClick={() => { setDraft(structuredClone(record.blueprint)); window.localStorage.removeItem(blueprintDraftStorageKey(record.blueprintId)); }}>放弃草稿</button>
                <button type="submit" disabled={!dirty || busy}><Save aria-hidden="true" />保存 revision</button>
                <button type="button" disabled={dirty || busy || draft.status !== 'review' || !draft.decision.primary_option_id} onClick={() => void approve()}><CheckCircle2 aria-hidden="true" />批准 Blueprint</button>
                <button type="button" disabled={dirty || busy} onClick={() => void createPreview()}><Workflow aria-hidden="true" />生成编译预览</button>
                <button type="button" disabled={!preview || busy} onClick={() => void compile()}><Workflow aria-hidden="true" />确认并编译 Artifact</button>
                {compiledYaml ? <button type="button" onClick={download}><Download aria-hidden="true" />下载 Genome</button> : null}
              </footer>
            </form> : <section className="blueprint-readonly">
              <h3>{mobile ? '移动端只读 Blueprint' : writePolicy.mode === 'readonly' ? '当前环境只读' : '请先解锁 Owner 会话'}</h3>
              <p>{draft.product_task.goal}</p>
              <dl><div><dt>状态</dt><dd>{humanLabel(draft.status)}</dd></div><div><dt>方案</dt><dd>{draft.options.length}</dd></div><div><dt>证据</dt><dd>{draft.evidence_matrix.flatMap(item => item.evidence_ids).length}</dd></div><div><dt>修订</dt><dd>R{record.revision}</dd></div></dl>
            </section>}

            {status && !canEdit ? <p className="blueprint-dossier__status" role="status">{status}</p> : null}
            {preview ? <section className="compile-preview" aria-label="编译预览"><h3>Compile Preview</h3><dl><div><dt>Input hash</dt><dd><code>{preview.inputHash}</code></dd></div><div><dt>Task</dt><dd>{preview.productTaskId}</dd></div><div><dt>Artifact key</dt><dd>{preview.artifactKey}</dd></div><div><dt>Outputs</dt><dd>{preview.outputs.join(' · ')}</dd></div><div><dt>Compiler</dt><dd>{preview.compilerVersion}</dd></div><div><dt>写入状态</dt><dd>尚未创建</dd></div></dl></section> : null}
          </> : <div className="blueprint-empty"><Workflow aria-hidden="true" />{status || '请选择 Blueprint，或先在 Solution Studio 创建候选。'}</div>}
        </main>

        <aside className="blueprint-governance" aria-label="Blueprint 治理与历史">
          <header><ShieldAlert aria-hidden="true" /><div><span>GOVERNANCE</span><strong>Hard gates</strong></div></header>
          {record ? <>
            <section>
              <h3>编译准备度</h3>
              <p data-ready={record.blueprint.status === 'approved' && Boolean(record.blueprint.execution)}>{record.blueprint.status === 'approved' && record.blueprint.execution ? '已满足结构前置条件' : 'BLOCK · 等待批准与 execution spec'}</p>
              <ul>{record.blueprint.human_gates.map(gate => <li key={gate.gate_id}><span>{humanLabel(gate.status ?? 'pending')}</span><strong>{gate.decision}</strong><small>{governanceGateLabel(gate.required_before)}</small></li>)}</ul>
            </section>
            <section>
              <h3>Revision ledger</h3>
              <ol>{record.revisions.map(revision => <li key={revision}><FileClock aria-hidden="true" /><span>R{revision}</span>{revision === record.revision ? <em>CURRENT</em> : null}</li>)}</ol>
            </section>
            <section>
              <h3>Lineage & impact</h3>
              <dl className="blueprint-lineage"><div><dt>Product Task</dt><dd>{record.blueprint.product_task.task_id}</dd></div><div><dt>Knowledge baseline</dt><dd><code>{record.blueprint.base_knowledge_revision}</code></dd></div><div><dt>Evidence</dt><dd>{record.blueprint.evidence_matrix.flatMap(item => item.evidence_ids).length}</dd></div><div><dt>Artifacts</dt><dd>{chain?.artifacts.length ?? 0}</dd></div></dl>
            </section>
          </> : <p>选择 Blueprint 后显示治理门与不可变 revision。</p>}
        </aside>
      </div>
    </div>
  );
}
