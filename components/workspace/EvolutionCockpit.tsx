import React from 'react';
import { Bot, CircleAlert, Gauge, GitPullRequestDraft, LockKeyhole, ShieldCheck } from 'lucide-react';
import type { ProductOperationsProjection } from '@/lib/product/operations-projection';

interface Props { projection: ProductOperationsProjection }

export function EvolutionCockpit({ projection }: Props) {
  return <div className="operations-workspace evolution-cockpit">
    <header className="operations-masthead operations-masthead--blocked"><div><span><Gauge aria-hidden="true" />EVOLUTION READINESS / 07</span><h1>Evolution Cockpit</h1><p>配置不是运行证据。只有真实指标、审计和人工门齐备后，进化候选才可能进入下一状态。</p></div><dl><div><dt>Readiness</dt><dd>BLOCKED</dd></div><div><dt>Execution</dt><dd>OFF</dd></div></dl></header>

    <section className="evolution-checks" aria-labelledby="evolution-checks-title"><header><div><span>READINESS MATRIX</span><h2 id="evolution-checks-title">证据刹车</h2></div><p><LockKeyhole aria-hidden="true" />Phase 2 模拟值不计入证据</p></header><div>{projection.evolution.checks.map(check => <article key={check.id} data-status={check.status}><span>{check.status}</span><strong>{check.label}</strong><p>{check.evidence}</p><small>需要：{check.requiredEvidence}</small></article>)}</div></section>

    <section className="employee-roster" aria-labelledby="employee-roster-title"><header><div><span>DIGITAL EMPLOYEES</span><h2 id="employee-roster-title">真实队列，不是头像墙</h2></div><p><Bot aria-hidden="true" />canExecute=false</p></header><div>{projection.evolution.employees.map(employee => <article key={employee.id} data-status={employee.status}>
      <header><span aria-hidden="true">{employee.name.split(' ').map(word => word[0]).join('')}</span><div><small>{employee.name}</small><strong>{employee.role}</strong></div><em>{employee.status}</em></header>
      <dl><div><dt>Queue</dt><dd>{employee.queueCount}</dd></div><div><dt>Last evidence</dt><dd>{employee.lastOutput}</dd></div></dl>
      <div className="employee-capabilities">{employee.capabilities.map(item => <span key={item}>{item}</span>)}</div>
      <p><CircleAlert aria-hidden="true" />{employee.blockedBy}</p><footer><ShieldCheck aria-hidden="true" />{employee.permissions.join(' · ')}<strong>{employee.humanGate}</strong></footer>
    </article>)}</div></section>

    <section className="evolution-actions" aria-labelledby="evolution-actions-title"><header><GitPullRequestDraft aria-hidden="true" /><div><span>CANDIDATE ACTIONS</span><h2 id="evolution-actions-title">候选行动 · executed=false</h2></div></header><ol>{projection.evolution.actions.map(action => <li key={action.id}><span>{action.id}</span><strong>{action.title}</strong><p>{action.reason}</p><div>{action.requiredEvidence.map(item => <code key={item}>{item}</code>)}</div><footer><LockKeyhole aria-hidden="true" />{action.humanGate}</footer></li>)}</ol></section>
  </div>;
}
