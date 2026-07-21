'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, CheckCircle2, CircleAlert, Download, FileClock, LoaderCircle, RefreshCw, Save, ShieldAlert, Workflow } from 'lucide-react';
import { OwnerSessionControl } from '@/components/canvas/OwnerSessionControl';
import type { BlueprintCandidateRecord, BlueprintCandidateSummary } from '@/lib/server/blueprint-workspace-store';
import type { ProductBlueprint } from '../../../scripts/lib/blueprint-contract';
import type { WritePolicy } from '@/lib/server/write-guard';

interface Props {
  writePolicy: WritePolicy;
  initialBlueprintId?: string | null;
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

export function BlueprintWorkspace({ writePolicy, initialBlueprintId, onArtifactCompiled }: Props) {
  const [items, setItems] = useState<BlueprintCandidateSummary[]>([]);
  const [selectedId, setSelectedId] = useState(initialBlueprintId ?? '');
  const [record, setRecord] = useState<BlueprintCandidateRecord | null>(null);
  const [draft, setDraft] = useState<ProductBlueprint | null>(null);
  const [ownerAuthenticated, setOwnerAuthenticated] = useState(writePolicy.mode === 'dev');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [compiledYaml, setCompiledYaml] = useState('');
  const mobile = useMobileReadonly();
  const canEdit = writePolicy.writable && ownerAuthenticated && !mobile;
  const dirty = useMemo(() => Boolean(record && draft && JSON.stringify(record.blueprint) !== JSON.stringify(draft)), [draft, record]);

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
      setDraft(structuredClone(payload.blueprint));
      setCompiledYaml('');
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

  const select = (blueprintId: string) => {
    if (blueprintId === selectedId) return;
    if (dirty && !window.confirm('当前 Blueprint 有未保存草稿。放弃并切换？')) return;
    setSelectedId(blueprintId);
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
      await loadList();
      setStatus(`Blueprint revision ${payload.revision} 已保存；未执行批准或发布。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Blueprint 保存失败。');
    } finally {
      setBusy(false);
    }
  };

  const compile = async () => {
    if (!record || !canEdit || busy) return;
    if (record.blueprint.status !== 'approved' || !record.blueprint.execution) {
      setCompiledYaml('');
      setStatus('治理门已阻断：只有 approved 且包含完整 execution spec 的 Blueprint 才能编译。');
      return;
    }
    setBusy(true);
    setStatus('');
    setCompiledYaml('');
    try {
      const response = await fetch(`/api/blueprints/${encodeURIComponent(record.blueprintId)}/compile`, {
        method: 'POST', credentials: 'same-origin',
      });
      const payload = await response.json() as { genomeYaml?: string; manifest?: { genomeHash: string }; error?: string; code?: string };
      if (!response.ok || !payload.genomeYaml) {
        if (payload.code === 'BLUEPRINT_NOT_COMPILE_READY') throw new Error('治理门已阻断：只有 approved 且包含完整 execution spec 的 Blueprint 才能编译。');
        throw new Error(payload.error || 'Blueprint 编译失败。');
      }
      setCompiledYaml(payload.genomeYaml);
      setStatus(`Genome 已通过二次校验并 create-only 保存：${payload.manifest?.genomeHash ?? ''}`);
      onArtifactCompiled?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Blueprint 编译失败。');
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
          <span><Workflow aria-hidden="true" />BLUEPRINT LEDGER / 05</span>
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
              <span>{item.status} · R{item.revision}</span><strong>{item.productName}</strong><code>{item.blueprintId}</code>
              <small>{item.compileReady ? <><CheckCircle2 aria-hidden="true" />compile ready</> : <><CircleAlert aria-hidden="true" />governance pending</>}</small>
            </button>
          </li>)}</ol> : <p>尚无 Blueprint。先在 Solution Studio 保存候选方案。</p>}
        </aside>

        <main className="blueprint-dossier" aria-label="Blueprint 档案">
          {busy && !record ? <div className="blueprint-empty"><LoaderCircle className="animate-spin" aria-hidden="true" />加载 Blueprint…</div> : record && draft ? <>
            <header>
              <div><span>PRODUCT BLUEPRINT / R{record.revision}</span><h2>{draft.product_task.product_name}</h2><code>{record.blueprintId}</code></div>
              <div><em data-status={draft.status}>{draft.status}</em><code>{record.documentHash.slice(0, 24)}…</code></div>
            </header>

            {canEdit ? <form className="blueprint-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
              <fieldset>
                <legend>01 / Product Task</legend>
                <label>候选状态{draft.status === 'draft' || draft.status === 'review' ? <select value={draft.status} onChange={event => setDraft(current => current ? { ...current, status: event.target.value as 'draft' | 'review' } : current)}><option value="draft">draft</option><option value="review">review</option></select> : <input value={draft.status} readOnly aria-label="已治理 Blueprint 状态" />}</label>
                <label>知识基线<input value={draft.base_knowledge_revision} readOnly /></label>
                <label className="is-wide">目标<textarea rows={3} value={draft.product_task.goal} onChange={event => updateTask('goal', event.target.value)} /></label>
                <label className="is-wide">问题<textarea rows={3} value={draft.product_task.problem} onChange={event => updateTask('problem', event.target.value)} /></label>
              </fieldset>
              <fieldset>
                <legend>02 / 主备方案</legend>
                {draft.options.map((option, index) => <React.Fragment key={option.option_id}>
                  <label>{index === 0 ? '主候选标题' : '备选标题'}<input value={option.title} onChange={event => updateOption(index, 'title', event.target.value)} /></label>
                  <label>{index === 0 ? '主候选说明' : '备选说明'}<textarea rows={3} value={option.description} onChange={event => updateOption(index, 'description', event.target.value)} /></label>
                </React.Fragment>)}
                <label className="is-wide">硬门判据<input value={draft.constraints.hard_gates[0]?.criterion ?? ''} onChange={event => setDraft(current => current ? { ...current, constraints: { ...current.constraints, hard_gates: current.constraints.hard_gates.map((gate, index) => index === 0 ? { ...gate, criterion: event.target.value } : gate) } } : current)} /></label>
              </fieldset>
              <fieldset>
                <legend>03 / 商业假设</legend>
                <label>Customer Job<textarea rows={3} value={draft.commercial_hypotheses[0]?.customer_job ?? ''} onChange={event => updateCommercial('customer_job', event.target.value)} /></label>
                <label>价值主张<textarea rows={3} value={draft.commercial_hypotheses[0]?.value_proposition ?? ''} onChange={event => updateCommercial('value_proposition', event.target.value)} /></label>
                <label>价值单位<input value={draft.commercial_hypotheses[0]?.value_unit ?? ''} onChange={event => updateCommercial('value_unit', event.target.value)} /></label>
                <label>验证实验<input value={draft.commercial_hypotheses[0]?.experiment ?? ''} onChange={event => updateCommercial('experiment', event.target.value)} /></label>
              </fieldset>
              <footer>
                <p>{dirty ? '存在未保存 Blueprint 草稿' : '当前表单与 revision 一致'}</p>
                <button type="button" disabled={!dirty || busy} onClick={() => setDraft(structuredClone(record.blueprint))}>放弃草稿</button>
                <button type="submit" disabled={!dirty || busy}><Save aria-hidden="true" />保存 revision</button>
                <button type="button" disabled={dirty || busy} onClick={() => void compile()}><Workflow aria-hidden="true" />{record.blueprint.status === 'approved' ? '编译 Genome' : '验证编译门'}</button>
                {compiledYaml ? <button type="button" onClick={download}><Download aria-hidden="true" />下载 Genome</button> : null}
              </footer>
            </form> : <section className="blueprint-readonly">
              <h3>{mobile ? '移动端只读 Blueprint' : writePolicy.mode === 'readonly' ? '当前环境只读' : '请先解锁 Owner 会话'}</h3>
              <p>{draft.product_task.goal}</p>
              <dl><div><dt>状态</dt><dd>{draft.status}</dd></div><div><dt>方案</dt><dd>{draft.options.length}</dd></div><div><dt>证据</dt><dd>{draft.evidence_matrix.flatMap(item => item.evidence_ids).length}</dd></div><div><dt>修订</dt><dd>R{record.revision}</dd></div></dl>
            </section>}

            {status ? <p className="blueprint-dossier__status" role="status">{status}</p> : null}
          </> : <div className="blueprint-empty"><Workflow aria-hidden="true" />{status || '请选择 Blueprint，或先在 Solution Studio 创建候选。'}</div>}
        </main>

        <aside className="blueprint-governance" aria-label="Blueprint 治理与历史">
          <header><ShieldAlert aria-hidden="true" /><div><span>GOVERNANCE</span><strong>Hard gates</strong></div></header>
          {record ? <>
            <section>
              <h3>编译准备度</h3>
              <p data-ready={record.blueprint.status === 'approved' && Boolean(record.blueprint.execution)}>{record.blueprint.status === 'approved' && record.blueprint.execution ? '已满足结构前置条件' : 'BLOCK · 等待批准与 execution spec'}</p>
              <ul>{record.blueprint.human_gates.map(gate => <li key={gate.gate_id}><span>{gate.status ?? 'pending'}</span><strong>{gate.decision}</strong><small>{gate.required_before}</small></li>)}</ul>
            </section>
            <section>
              <h3>Revision ledger</h3>
              <ol>{record.revisions.map(revision => <li key={revision}><FileClock aria-hidden="true" /><span>R{revision}</span>{revision === record.revision ? <em>CURRENT</em> : null}</li>)}</ol>
            </section>
          </> : <p>选择 Blueprint 后显示治理门与不可变 revision。</p>}
        </aside>
      </div>
    </div>
  );
}
