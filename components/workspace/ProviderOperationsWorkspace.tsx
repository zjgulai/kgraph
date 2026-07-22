import React from 'react';
import { Ban, KeyRound, LockKeyhole, ReceiptText, ShieldEllipsis, WalletCards } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { ProductOperationsProjection } from '@/lib/product/operations-projection';

interface Props { projection: ProductOperationsProjection }

function valueOrMissing(value: string | null | undefined): React.ReactNode {
  return value ? <code>{value}</code> : <span>未提供</span>;
}

const gateLabel: Readonly<Record<string, string>> = {
  pass: '已满足',
  ready: '等待授权',
  pending: '待处理',
  blocked: '已阻断',
};

const gateName: Readonly<Record<string, string>> = {
  policy: '调用策略',
  authorization: '基础授权',
  cohort: '样本范围',
  budget: '调用预算',
  canary: 'Canary 结果',
  gold: 'Human Gold',
  stage_authorization: '阶段收据',
};

const operatorCopy: Readonly<Record<string, string>> = {
  configure_exact_pilot_plan: '配置与当前策略精确绑定的 Pilot 计划。',
  pilot_plan_not_configured: 'Pilot 计划尚未配置。',
  disabled_by_policy: '当前策略禁止 Provider 调用。',
};

function humanizeOperatorText(value: string): string {
  return operatorCopy[value] ?? value.replaceAll('_', ' ');
}

export function ProviderOperationsWorkspace({ projection }: Props) {
  const provider = projection.providerOps;
  return <div className="operations-workspace provider-operations-workspace">
    <header className="operations-masthead operations-masthead--blocked"><div><span><ShieldEllipsis aria-hidden="true" />PROVIDER OPS / READ ONLY</span><h1>Provider Operations</h1><p>这里只投影 policy、plan、receipt、scope、budget 和 gate。凭据存在不等于 ready，本页面不会执行任何 Provider 调用。</p></div><dl><div><dt>模式</dt><dd>{provider.mode === 'configured' ? '已配置' : '禁用'}</dd></div><div><dt>可执行</dt><dd>否</dd></div></dl></header>
    <section className="provider-boundary"><LockKeyhole aria-hidden="true" /><div><StatusBadge tone="warning">只读控制面</StatusBadge><h2>{humanizeOperatorText(provider.nextAction)}</h2><p>任何真实调用仍要求独立、未消费、未过期且精确绑定 scope 的授权收据。</p></div></section>
    <div className="provider-evidence-grid">
      <section><header><KeyRound aria-hidden="true" /><h2>身份与策略</h2></header><dl><div><dt>Provider</dt><dd>{provider.providerId ?? '未配置'}</dd></div><div><dt>Model</dt><dd>{provider.modelId ?? '未配置'}</dd></div><div><dt>Job</dt><dd>{valueOrMissing(provider.jobId)}</dd></div><div><dt>Policy</dt><dd>{valueOrMissing(provider.policyHash)}</dd></div><div><dt>Plan</dt><dd>{valueOrMissing(provider.planHash)}</dd></div></dl></section>
      <section><header><ReceiptText aria-hidden="true" /><h2>Receipt 与 scope</h2></header><dl><div><dt>Authorization</dt><dd>{valueOrMissing(provider.authorizationId)}</dd></div><div><dt>Receipt hash</dt><dd>{valueOrMissing(provider.authorizationHash)}</dd></div><div><dt>Stage</dt><dd>{provider.authorizedStage ?? '未授权'}</dd></div><div><dt>Capture scope</dt><dd>{provider.scopeCount}</dd></div><div><dt>Evidence</dt><dd>{provider.evidenceIds.map(id => <code key={id}>{id}</code>)}</dd></div></dl></section>
      <section><header><WalletCards aria-hidden="true" /><h2>调用预算</h2></header>{provider.budget ? <dl><div><dt>上限</dt><dd>{provider.budget.maxCalls}</dd></div><div><dt>已保留</dt><dd>{provider.budget.reservedCalls}</dd></div><div><dt>剩余</dt><dd>{provider.budget.remainingCalls}</dd></div><div><dt>成功传输</dt><dd>{provider.budget.providerCompletedCalls}</dd></div><div><dt>失败传输</dt><dd>{provider.budget.providerFailedCalls}</dd></div></dl> : <p>尚无 budget projection。</p>}</section>
    </div>
    <section className="provider-gates" aria-labelledby="provider-gates-title"><header><Ban aria-hidden="true" /><h2 id="provider-gates-title">Gate 状态</h2></header>{provider.gates.length > 0 ? <ol>{provider.gates.map(gate => <li key={gate.id} data-state={gate.status}><strong>{gateName[gate.id] ?? gate.id}</strong><span>{gateLabel[gate.status] ?? '未知状态'}</span><p>{humanizeOperatorText(gate.reason)}</p></li>)}</ol> : <p>未配置 Pilot，因此没有可声明为通过的 gate。</p>}</section>
  </div>;
}
