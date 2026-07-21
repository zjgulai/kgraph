'use client';

import React, { useMemo, useState } from 'react';
import { Boxes, Braces, CheckCircle2, FileCheck2, Gauge, Rocket, ShieldCheck } from 'lucide-react';
import type { ProductOperationsProjection } from '@/lib/product/operations-projection';

interface Props { projection: ProductOperationsProjection }
type CompiledView = 'prd' | 'architecture' | 'evaluation' | 'delivery';

const viewLabels: Array<{ id: CompiledView; label: string; icon: typeof FileCheck2 }> = [
  { id: 'prd', label: 'PRD', icon: FileCheck2 },
  { id: 'architecture', label: 'Architecture', icon: Braces },
  { id: 'evaluation', label: 'Evaluation', icon: Gauge },
  { id: 'delivery', label: 'Delivery', icon: Rocket },
];

export function ArtifactWorkspace({ projection }: Props) {
  const [selectedKey, setSelectedKey] = useState(projection.artifacts[0]?.artifactKey ?? '');
  const [view, setView] = useState<CompiledView>('prd');
  const artifact = useMemo(
    () => projection.artifacts.find(item => item.artifactKey === selectedKey) ?? projection.artifacts[0] ?? null,
    [projection.artifacts, selectedKey],
  );

  return (
    <div className="operations-workspace artifact-workspace">
      <header className="operations-masthead">
        <div><span><Boxes aria-hidden="true" />ARTIFACT REGISTER / 06</span><h1>Compiled Views</h1><p>每个视图都从 checksum 已验证的 Genome 投影；它们是候选规格，不是已经部署的文件。</p></div>
        <dl><div><dt>Verified</dt><dd>{projection.artifacts.length}</dd></div><div><dt>Production</dt><dd>UNCHANGED</dd></div></dl>
      </header>

      {artifact ? <div className="artifact-layout">
        <aside className="artifact-register" aria-label="已验证 Artifact 列表">
          <header><ShieldCheck aria-hidden="true" /><div><span>PROVENANCE</span><strong>{projection.artifacts.length} verified</strong></div></header>
          <ol>{projection.artifacts.map(item => <li key={`${item.manifest.blueprintId}:${item.artifactKey}`}>
            <button type="button" data-selected={artifact.artifactKey === item.artifactKey} onClick={() => setSelectedKey(item.artifactKey)}>
              <span>R{item.manifest.blueprintRevision} · {item.artifactKey}</span><strong>{item.views.prd.productName}</strong><code>{item.manifest.genomeHash.slice(0, 23)}…</code>
            </button>
          </li>)}</ol>
        </aside>

        <main className="compiled-dossier" aria-label="Compiled product view">
          <header><div><span>{artifact.manifest.blueprintId} / R{artifact.manifest.blueprintRevision}</span><h2>{artifact.views.prd.productName}</h2></div><p><CheckCircle2 aria-hidden="true" />Genome contract verified</p></header>
          <nav aria-label="Compiled view 类型">{viewLabels.map(({ id, label, icon: Icon }) => <button key={id} type="button" data-active={view === id} onClick={() => setView(id)}><Icon aria-hidden="true" />{label}</button>)}</nav>

          {view === 'prd' ? <section className="compiled-view compiled-view--prd">
            <header><span>PRODUCT REQUIREMENTS</span><h3>{artifact.views.prd.valueProposition}</h3></header>
            <dl><div><dt>Problem</dt><dd>{artifact.views.prd.problem}</dd></div><div><dt>Target users</dt><dd>{artifact.views.prd.targetUsers}</dd></div><div><dt>Boundary</dt><dd>{artifact.views.prd.notSolving}</dd></div><div><dt>Business model</dt><dd>{artifact.views.prd.businessModel}</dd></div></dl>
            <div className="compiled-tags">{artifact.views.prd.keyMetrics.map(metric => <span key={metric}>{metric}</span>)}</div>
          </section> : null}

          {view === 'architecture' ? <section className="compiled-view compiled-view--architecture">
            <header><span>SYSTEM BLUEPRINT</span><h3>Architecture</h3></header>
            <div className="architecture-stack">
              <article><small>Interface</small><strong>{artifact.views.architecture.frontend.framework} {artifact.views.architecture.frontend.version}</strong><span>{artifact.views.architecture.frontend.ui_library} · {artifact.views.architecture.frontend.styling}</span></article>
              <article><small>Application</small><strong>{artifact.views.architecture.backend.type}</strong><span>{artifact.views.architecture.backend.database} · {artifact.views.architecture.backend.auth}</span></article>
              <article><small>Agent runtime</small><strong>{artifact.views.architecture.agentRuntime.framework}</strong><span>{artifact.views.architecture.agentRuntime.default_model} → {artifact.views.architecture.agentRuntime.fallback_model}</span></article>
              <article><small>Knowledge</small><strong>{artifact.views.architecture.knowledgeDomains.length} domains</strong><span>{artifact.views.architecture.tools.length} governed tools</span></article>
            </div>
            <div className="compiled-tags">{artifact.views.architecture.guardrails.blocked_actions.map(action => <span key={action}>blocked:{action}</span>)}</div>
          </section> : null}

          {view === 'evaluation' ? <section className="compiled-view compiled-view--evaluation">
            <header><span>QUALITY CONTRACT</span><h3>Evaluation</h3></header>
            <div className="evaluation-gates">{artifact.views.evaluation.gates.map(gate => <article key={gate.id} data-enabled={gate.enabled}><span>{gate.enabled ? 'ENABLED' : 'OFF'}</span><strong>{gate.metric}</strong><code>{gate.threshold}</code><small>{gate.actionOnFail}</small></article>)}</div>
            <dl><div><dt>Golden set</dt><dd>{artifact.views.evaluation.goldenSetPath}</dd></div><div><dt>Judge</dt><dd>{artifact.views.evaluation.judge.model} / {artifact.views.evaluation.judge.rubric_version}</dd></div></dl>
          </section> : null}

          {view === 'delivery' ? <section className="compiled-view compiled-view--delivery">
            <header><span>DELIVERY CONTRACT</span><h3>Delivery</h3></header>
            <div className="delivery-route"><article><small>Frontend</small><strong>{artifact.views.delivery.frontendTarget}</strong></article><i aria-hidden="true" /><article><small>Backend</small><strong>{artifact.views.delivery.backendTarget}</strong></article><i aria-hidden="true" /><article><small>CI/CD</small><strong>{artifact.views.delivery.ciCd}</strong></article></div>
            <p className="compiled-boundary"><ShieldCheck aria-hidden="true" /><span><strong>candidate_only · productionStatus=unchanged</strong>独立发布授权仍是硬门，本视图没有部署能力。</span></p>
          </section> : null}
        </main>

        <aside className="artifact-provenance" aria-label="Artifact provenance">
          <span>COMPILED AT</span><strong>{artifact.manifest.compiledAt}</strong>
          <span>BLUEPRINT HASH</span><code>{artifact.manifest.blueprintDocumentHash}</code>
          <span>GENOME HASH</span><code>{artifact.manifest.genomeHash}</code>
          <span>VALIDATION</span><strong>{artifact.manifest.validation.errors.length} errors / {artifact.manifest.validation.warnings.length} warnings</strong>
        </aside>
      </div> : <section className="operations-empty"><Boxes aria-hidden="true" /><h2>尚无已验证 Artifact</h2><p>只有 approved Blueprint 通过 Genome 二次校验并 create-only 保存后，Compiled Views 才会出现。</p></section>}
    </div>
  );
}
