import React from 'react';
import { Check, CircleDashed, GitBranch, LockKeyhole, Workflow } from 'lucide-react';
import type { ProductOperationsProjection, WorkflowState } from '@/lib/product/operations-projection';

interface Props { projection: ProductOperationsProjection }

const stateIcon: Record<WorkflowState, typeof Check> = {
  complete: Check,
  active: CircleDashed,
  blocked: LockKeyhole,
  empty: CircleDashed,
};

export function WorkflowWorkspace({ projection }: Props) {
  return <div className="operations-workspace workflow-workspace">
    <header className="operations-masthead"><div><span><Workflow aria-hidden="true" />EVIDENCE FLOW / 03</span><h1>Product Workflow</h1><p>这里显示证据链的真实状态，不使用硬编码完成百分比；每一阶段都能回到当前 read model。</p></div><dl><div><dt>Objects</dt><dd>{projection.generatedFrom.knowledgeObjectCount}</dd></div><div><dt>Artifacts</dt><dd>{projection.generatedFrom.artifactCount}</dd></div></dl></header>
    <section className="workflow-track" aria-label="Knowledge-to-Product workflow">
      {projection.workflow.map((stage, index) => {
        const Icon = stateIcon[stage.state];
        return <React.Fragment key={stage.id}>
          {index > 0 ? <i aria-hidden="true" /> : null}
          <article data-state={stage.state}>
            <header><span>{String(index + 1).padStart(2, '0')}</span><Icon aria-hidden="true" /></header>
            <small>{stage.state} · 新鲜度 {stage.freshness}</small><h2>{stage.label}</h2><strong>{stage.evidenceCount}</strong><p>{stage.evidence}</p>
            <code>{stage.evidenceIds[0] ?? 'evidence unavailable'}</code>
            {stage.humanGate ? <footer><GitBranch aria-hidden="true" />{stage.humanGate}</footer> : <footer><Check aria-hidden="true" />evidence-bound</footer>}
          </article>
        </React.Fragment>;
      })}
    </section>
    <footer className="workflow-boundary"><LockKeyhole aria-hidden="true" /><p><strong>执行边界</strong>Workflow 只解释 current evidence；evaluation、evolution 和 production 均因证据或授权缺失而阻断。</p></footer>
  </div>;
}
