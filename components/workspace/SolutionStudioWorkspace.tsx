'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { BookKey, CircleAlert, FlaskConical, LoaderCircle, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { OwnerSessionControl } from '@/components/canvas/OwnerSessionControl';
import type { KnowledgeLibraryProjection } from '@/lib/knowledge/library-types';
import type { SolutionScaffoldInput } from '@/lib/solutions/blueprint-scaffold';
import type { SolutionLineageItem } from '@/lib/solutions/blueprint-scaffold';
import type { ProductChainProjection } from '@/lib/product/product-chain';
import { parseSolutionDraft, serializeSolutionDraft, SOLUTION_DRAFT_STORAGE_KEY } from '@/lib/product/workspace-drafts';
import type { ProductBlueprint } from '../../../scripts/lib/blueprint-contract';
import type { WritePolicy } from '@/lib/server/write-guard';

interface Props {
  library: KnowledgeLibraryProjection;
  writePolicy: WritePolicy;
  chains: ProductChainProjection[];
  initialTaskId?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onTaskSelected: (taskId: string, blueprintId: string) => void;
  onBlueprintSaved: (blueprintId: string, taskId: string) => void;
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

function lines(value: string): string[] {
  return value.split('\n').map(item => item.trim()).filter(Boolean);
}

const initialInput: Omit<SolutionScaffoldInput, 'evidenceIds'> = {
  blueprintId: 'blueprint.new-ai-product',
  taskId: 'task.new-ai-product',
  productName: 'New AI Product',
  goal: '用可审计知识构建可落地的 AI 产品方案',
  problem: '产品想法、技术决策和证据没有形成可复用的闭环',
  targetUsers: ['AI 产品负责人'],
  notSolving: ['自动批准生产发布'],
  successMetrics: ['方案可追溯到知识对象', 'Blueprint 通过结构校验'],
  capabilityGene: { dimension: 'knowledge_memory', value: 'governed_knowledge_compiler', riskLevel: 'high' },
  primaryOption: {
    title: '结构化知识编译工作流', description: '从显式证据构建主方案、硬门和商业假设',
    assumptions: ['Owner 会复核关键主张'], risks: ['知识证据可能过期'], tradeoffs: ['用治理成本换取可审计性'],
  },
  alternativeOption: {
    title: '人工模板工作流', description: '以人工模板完成方案，再逐步接入结构化编译',
    assumptions: ['团队持续维护模板'], risks: ['跨方案一致性较弱'], tradeoffs: ['用自动化程度换取低门槛'],
  },
  hardGateCriterion: '关键主张必须有当前知识 revision 作为证据',
  commercialHypothesis: {
    customerJob: '更快把 AI 产品想法转化为可执行规格',
    valueProposition: '减少方案返工并保留技术与商业证据链',
    valueUnit: '每个通过人工复核的 Blueprint',
    experiment: '对三个真实产品任务比较交付周期与返工次数',
  },
};

export function SolutionStudioWorkspace({ library, writePolicy, chains, initialTaskId, onDirtyChange, onTaskSelected, onBlueprintSaved }: Props) {
  const [draft, setDraft] = useState(initialInput);
  const [evidenceIds, setEvidenceIds] = useState<string[]>(() => library.items.slice(0, 3).map(item => item.objectId));
  const [blueprint, setBlueprint] = useState<ProductBlueprint | null>(null);
  const [lineage, setLineage] = useState<SolutionLineageItem[]>([]);
  const [ownerAuthenticated, setOwnerAuthenticated] = useState(writePolicy.mode === 'dev');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [touched, setTouched] = useState(false);
  const hydrated = useRef(false);
  const mobile = useMobileReadonly();
  const canSave = writePolicy.writable && ownerAuthenticated && !mobile;
  const selectedEvidence = useMemo(() => new Set(evidenceIds), [evidenceIds]);
  const selectedChain = useMemo(() => chains.find(item => item.taskId === initialTaskId) ?? null, [chains, initialTaskId]);

  const setField = <K extends keyof typeof initialInput>(key: K, value: (typeof initialInput)[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
    setBlueprint(null);
    setLineage([]);
    setTouched(true);
  };

  useEffect(() => {
    if (hydrated.current) return;
    const stored = parseSolutionDraft(window.localStorage.getItem(SOLUTION_DRAFT_STORAGE_KEY));
    if (stored) {
      const available = new Set(library.items.map(item => item.objectId));
      setDraft(stored.input);
      setEvidenceIds(stored.evidenceIds.filter(id => available.has(id)));
      setTouched(true);
      setStatus('已恢复浏览器本地 Product Task 草稿；尚未保存 Blueprint。');
    }
    hydrated.current = true;
  }, [library.items]);

  useEffect(() => {
    if (!hydrated.current || !touched) return;
    window.localStorage.setItem(SOLUTION_DRAFT_STORAGE_KEY, serializeSolutionDraft({ input: draft, evidenceIds }));
  }, [draft, evidenceIds, touched]);

  useEffect(() => {
    if (!touched) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [touched]);

  useEffect(() => { onDirtyChange?.(touched); }, [onDirtyChange, touched]);

  const scaffold = async () => {
    if (mobile || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/solutions/scaffold', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, evidenceIds }),
      });
      const payload = await response.json() as { blueprint?: ProductBlueprint; lineage?: SolutionLineageItem[]; error?: string };
      if (!response.ok || !payload.blueprint) throw new Error(payload.error || '方案脚手架生成失败。');
      setBlueprint(payload.blueprint);
      setLineage(payload.lineage ?? []);
      setStatus('候选方案已结构化；证据状态仍为 insufficient，等待人工验证。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '方案脚手架生成失败。');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!blueprint || !canSave || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/blueprints', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprint }),
      });
      const payload = await response.json() as { blueprintId?: string; error?: string };
      if (!response.ok || !payload.blueprintId) throw new Error(payload.error || 'Blueprint 保存失败。');
      setStatus('Blueprint revision 1 已保存为 candidate；未执行批准、编译或发布。');
      window.localStorage.removeItem(SOLUTION_DRAFT_STORAGE_KEY);
      setTouched(false);
      onBlueprintSaved(payload.blueprintId, draft.taskId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Blueprint 保存失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="solution-studio">
      <header className="solution-studio__masthead">
        <div>
          <span><Sparkles aria-hidden="true" />Product / Solution Studio</span>
          <h1>从证据到候选方案</h1>
          <p>用 Product Task、主备方案、硬门与商业假设生成确定性 Blueprint 草稿；不调用模型，不伪造调研结论。</p>
        </div>
        <div className="solution-studio__boundary">
          <ShieldCheck aria-hidden="true" />
          <p><strong>Human decision required</strong><span>生成不等于推荐，保存不等于批准</span></p>
          {!mobile ? <OwnerSessionControl writePolicy={writePolicy} onAuthenticatedChange={setOwnerAuthenticated} /> : null}
        </div>
      </header>

      {mobile ? (
        <section className="solution-studio__mobile-readonly">
          <BookKey aria-hidden="true" />
          <div><h2>移动端只读</h2><p>可查看知识与既有 Blueprint；方案创建和编译只在桌面 Owner 工作区开放。</p></div>
        </section>
      ) : (
        <div className="solution-studio__layout">
          <form className="solution-form" onSubmit={event => { event.preventDefault(); void scaffold(); }}>
            <fieldset>
              <legend>01 / Product Task</legend>
              <label>Task ID<input name="taskId" autoComplete="off" value={draft.taskId} onChange={event => setField('taskId', event.target.value)} /></label>
              <label>Blueprint ID<input name="blueprintId" autoComplete="off" value={draft.blueprintId} onChange={event => setField('blueprintId', event.target.value)} /></label>
              <label>产品名<input name="productName" autoComplete="off" value={draft.productName} onChange={event => setField('productName', event.target.value)} /></label>
              <label className="is-wide">目标<textarea rows={2} value={draft.goal} onChange={event => setField('goal', event.target.value)} /></label>
              <label className="is-wide">问题<textarea rows={3} value={draft.problem} onChange={event => setField('problem', event.target.value)} /></label>
              <label>目标用户（每行一项）<textarea rows={3} value={draft.targetUsers.join('\n')} onChange={event => setField('targetUsers', lines(event.target.value))} /></label>
              <label>不解决（每行一项）<textarea rows={3} value={draft.notSolving.join('\n')} onChange={event => setField('notSolving', lines(event.target.value))} /></label>
              <label className="is-wide">成功指标（每行一项）<textarea rows={3} value={draft.successMetrics.join('\n')} onChange={event => setField('successMetrics', lines(event.target.value))} /></label>
            </fieldset>

            <fieldset>
              <legend>02 / 方案、能力与硬门</legend>
              <label>能力维度<select value={draft.capabilityGene.dimension} onChange={event => setField('capabilityGene', { ...draft.capabilityGene, dimension: event.target.value as SolutionScaffoldInput['capabilityGene']['dimension'] })}>
                {['interaction', 'data', 'intelligence', 'knowledge_memory', 'agent_autonomy', 'tools_integrations', 'output', 'risk', 'deployment', 'commercial'].map(value => <option key={value}>{value}</option>)}
              </select></label>
              <label>风险<select value={draft.capabilityGene.riskLevel} onChange={event => setField('capabilityGene', { ...draft.capabilityGene, riskLevel: event.target.value as SolutionScaffoldInput['capabilityGene']['riskLevel'] })}>{['low', 'medium', 'high', 'critical'].map(value => <option key={value}>{value}</option>)}</select></label>
              <label className="is-wide">能力值<input value={draft.capabilityGene.value} onChange={event => setField('capabilityGene', { ...draft.capabilityGene, value: event.target.value })} /></label>
              <label>主方案标题<input value={draft.primaryOption.title} onChange={event => setField('primaryOption', { ...draft.primaryOption, title: event.target.value })} /></label>
              <label>备选标题<input value={draft.alternativeOption.title} onChange={event => setField('alternativeOption', { ...draft.alternativeOption, title: event.target.value })} /></label>
              <label>主方案说明<textarea rows={4} value={draft.primaryOption.description} onChange={event => setField('primaryOption', { ...draft.primaryOption, description: event.target.value })} /></label>
              <label>备选说明<textarea rows={4} value={draft.alternativeOption.description} onChange={event => setField('alternativeOption', { ...draft.alternativeOption, description: event.target.value })} /></label>
              <label>主方案假设（每行一项）<textarea rows={3} value={draft.primaryOption.assumptions.join('\n')} onChange={event => setField('primaryOption', { ...draft.primaryOption, assumptions: lines(event.target.value) })} /></label>
              <label>主方案风险（每行一项）<textarea rows={3} value={draft.primaryOption.risks.join('\n')} onChange={event => setField('primaryOption', { ...draft.primaryOption, risks: lines(event.target.value) })} /></label>
              <label>主方案取舍（每行一项）<textarea rows={3} value={draft.primaryOption.tradeoffs.join('\n')} onChange={event => setField('primaryOption', { ...draft.primaryOption, tradeoffs: lines(event.target.value) })} /></label>
              <label>备选假设（每行一项）<textarea rows={3} value={draft.alternativeOption.assumptions.join('\n')} onChange={event => setField('alternativeOption', { ...draft.alternativeOption, assumptions: lines(event.target.value) })} /></label>
              <label>备选风险（每行一项）<textarea rows={3} value={draft.alternativeOption.risks.join('\n')} onChange={event => setField('alternativeOption', { ...draft.alternativeOption, risks: lines(event.target.value) })} /></label>
              <label>备选取舍（每行一项）<textarea rows={3} value={draft.alternativeOption.tradeoffs.join('\n')} onChange={event => setField('alternativeOption', { ...draft.alternativeOption, tradeoffs: lines(event.target.value) })} /></label>
              <label className="is-wide">硬门判据<input value={draft.hardGateCriterion} onChange={event => setField('hardGateCriterion', event.target.value)} /></label>
            </fieldset>

            <fieldset>
              <legend>03 / 商业假设</legend>
              <label>Customer Job<textarea rows={3} value={draft.commercialHypothesis.customerJob} onChange={event => setField('commercialHypothesis', { ...draft.commercialHypothesis, customerJob: event.target.value })} /></label>
              <label>价值主张<textarea rows={3} value={draft.commercialHypothesis.valueProposition} onChange={event => setField('commercialHypothesis', { ...draft.commercialHypothesis, valueProposition: event.target.value })} /></label>
              <label>价值单位<input value={draft.commercialHypothesis.valueUnit} onChange={event => setField('commercialHypothesis', { ...draft.commercialHypothesis, valueUnit: event.target.value })} /></label>
              <label>最小实验<input value={draft.commercialHypothesis.experiment} onChange={event => setField('commercialHypothesis', { ...draft.commercialHypothesis, experiment: event.target.value })} /></label>
            </fieldset>

            <footer>
              <p>规则生成 · provider_call=false</p>
              <button type="submit" disabled={busy || evidenceIds.length === 0}>{busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <FlaskConical aria-hidden="true" />}建立结构化候选</button>
              {blueprint && canSave ? <button type="button" onClick={() => void save()} disabled={busy}><Save aria-hidden="true" />保存 Blueprint</button> : null}
            </footer>
          </form>

          <aside className="solution-evidence" aria-label="方案证据选择">
            {chains.length ? <section className="product-task-register" aria-label="已持久化 Product Task">
              <h2>Product Tasks</h2>
              <ol>{chains.map(chain => <li key={chain.taskId}><button type="button" data-selected={selectedChain?.taskId === chain.taskId} onClick={() => onTaskSelected(chain.taskId, chain.blueprintId)}><strong>{chain.productName}</strong><span>{chain.taskId}</span><small>{chain.blueprintStatus} · R{chain.blueprintRevision} · {chain.artifacts.length} artifacts</small></button></li>)}</ol>
            </section> : null}
            <header><BookKey aria-hidden="true" /><div><span>EVIDENCE SET</span><strong>{evidenceIds.length} / {library.items.length}</strong></div></header>
            <p>只允许引用当前 Library 中存在的 object ID；保存时绑定 pack + overlay revision/hash 指纹。</p>
            <div>
              {library.items.map(item => (
                <label key={item.objectId} data-selected={selectedEvidence.has(item.objectId)}>
                  <input
                    type="checkbox"
                    checked={selectedEvidence.has(item.objectId)}
                    onChange={() => {
                      setEvidenceIds(current => selectedEvidence.has(item.objectId) ? current.filter(id => id !== item.objectId) : [...current, item.objectId]);
                      setBlueprint(null);
                      setLineage([]);
                      setTouched(true);
                    }}
                  />
                  <span><strong>{item.title}</strong><small>{item.domainRefs.join(' · ')} · R{item.revision}</small></span>
                </label>
              ))}
            </div>
          </aside>

          <aside className="solution-preview" aria-label="候选方案预览">
            <header><Sparkles aria-hidden="true" /><div><span>BLUEPRINT DRAFT</span><strong>{blueprint ? 'READY' : 'WAITING'}</strong></div></header>
            {blueprint ? <>
              <h2>{blueprint.product_task.product_name}</h2>
              <code>{blueprint.blueprint_id} · R{blueprint.version}</code>
              <dl>
                <div><dt>Product Task</dt><dd>{blueprint.product_task.task_id}</dd></div>
                <div><dt>状态</dt><dd>{blueprint.status}</dd></div>
                <div><dt>证据</dt><dd>{blueprint.evidence_matrix[0]?.evidence_ids.length ?? 0}</dd></div>
                <div><dt>主备方案</dt><dd>{blueprint.options.length}</dd></div>
                <div><dt>商业假设</dt><dd>{blueprint.commercial_hypotheses.length}</dd></div>
              </dl>
              <p><CircleAlert aria-hidden="true" />{blueprint.decision.rationale}</p>
              <ul className="solution-lineage">{lineage.map(item => <li key={item.id}><strong>{item.label}</strong><span>{item.origin}</span><small>{item.sourceRefs.length} refs</small></li>)}</ul>
              <small>{blueprint.base_knowledge_revision}</small>
            </> : <p><CircleAlert aria-hidden="true" />填写 Product Task 并选择证据后生成。系统不会自动选择主方案或批准治理门。</p>}
            {selectedChain ? <section className="selected-product-chain"><strong>{selectedChain.taskId}</strong><span>{selectedChain.blueprintId} · R{selectedChain.blueprintRevision}</span><small>下一步：{selectedChain.nextAction}</small></section> : null}
            {status ? <footer role="status" aria-live="polite">{status}</footer> : null}
          </aside>
        </div>
      )}
    </div>
  );
}
