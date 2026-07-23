import React from 'react';
import { AlertTriangle, ArrowRight, Clock3, FileCheck2, LockKeyhole } from 'lucide-react';
import { AsyncState } from '@/components/ui/AsyncState';
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge';
import type { ProductOperationsProjection, WorkflowState } from '@/lib/product/operations-projection';
import { governanceGateLabel, humanizeGovernanceText, workflowLabel } from '@/lib/presentation/human-labels';
import {
  withWorkbenchView,
  workbenchHref,
  type WorkbenchRoute,
  type WorkbenchView,
} from '@/lib/workbench/routes';

interface Props {
  route: WorkbenchRoute;
  projection: ProductOperationsProjection;
  onNavigate: (route: WorkbenchRoute) => void;
}

const targetByStage: Record<ProductOperationsProjection['workflow'][number]['id'], WorkbenchView> = {
  capture: 'capture',
  review: 'review',
  blueprint: 'blueprints',
  artifact: 'artifacts',
  evaluation: 'evolution',
  evolution: 'evolution',
  production: 'workflow',
};

const stateLabel: Record<WorkflowState, string> = {
  complete: '有证据',
  active: '待处理',
  blocked: '已阻断',
  empty: '未开始',
};

const stateTone: Record<WorkflowState, StatusTone> = {
  complete: 'success',
  active: 'info',
  blocked: 'warning',
  empty: 'neutral',
};

function isPlainPrimaryClick(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function WorkQueue({ route, projection, onNavigate }: Props) {
  const queue = projection.workflow.filter(stage => stage.state === 'active' || stage.state === 'blocked');
  const notMeasured = projection.evolution.checks.filter(check => check.status === 'not_measured').length;
  return (
    <div className="work-queue">
      <header className="work-queue__header">
        <div><span>当前证据生成的任务</span><h2>先处理阻断，再继续编译</h2><p>每个任务都来自当前 read model；这里不自动执行 Provider、canonical promotion 或生产发布。</p></div>
        <dl>
          <div><dt>待处理</dt><dd>{queue.filter(item => item.state === 'active').length}</dd></div>
          <div><dt>已阻断</dt><dd>{queue.filter(item => item.state === 'blocked').length}</dd></div>
          <div><dt>未测量</dt><dd>{notMeasured}</dd></div>
        </dl>
      </header>

      <section className="work-queue__grid" aria-labelledby="work-queue-title">
        <div className="work-queue__list">
          <header><div><Clock3 aria-hidden="true" /><span>下一动作</span></div><strong id="work-queue-title">{queue.length} 项</strong></header>
          {queue.length > 0 ? <ol>{queue.map((stage, index) => {
            const target = withWorkbenchView(route, targetByStage[stage.id]);
            const blocked = stage.state === 'blocked';
            return <li key={stage.id} data-state={stage.state}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><StatusBadge tone={stateTone[stage.state]}>{stateLabel[stage.state]}</StatusBadge><h3>{workflowLabel(stage.id, stage.label)}</h3><p>{humanizeGovernanceText(stage.evidence)}</p>{stage.humanGate ? <small className="work-queue__gate">治理门：{governanceGateLabel(stage.humanGate)}</small> : null}</div>
              <a href={workbenchHref(target)} onClick={event => {
                if (!isPlainPrimaryClick(event)) return;
                event.preventDefault();
                onNavigate(target);
              }} aria-label={`打开${workflowLabel(stage.id, stage.label)}`}>
                {blocked ? <LockKeyhole aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              </a>
            </li>;
          })}</ol> : <AsyncState state="success" title="当前没有活动或阻断任务" description="新的证据或治理变化会在这里生成下一动作。" />}
        </div>

        <aside className="work-queue__evidence" aria-label="证据概览">
          <header><FileCheck2 aria-hidden="true" /><div><span>当前基线</span><strong>证据概览</strong></div></header>
          <dl>
            <div><dt>知识对象</dt><dd>{projection.generatedFrom.knowledgeObjectCount}</dd></div>
            <div><dt>Blueprint</dt><dd>{projection.generatedFrom.blueprintCount}</dd></div>
            <div><dt>编译产物</dt><dd>{projection.generatedFrom.artifactCount}</dd></div>
            <div><dt>注册证据</dt><dd>{projection.evidenceRegistry.stats.total}</dd></div>
          </dl>
          <section><AlertTriangle aria-hidden="true" /><div><strong>边界保持</strong><p>Production 状态仍由精确发布证据和独立授权决定，不能从本页面推断。</p></div></section>
          <footer><span>PACK</span><code>{projection.generatedFrom.knowledgePackHash.slice(0, 24)}</code></footer>
          <a href={workbenchHref(withWorkbenchView(route, 'evidence'))} onClick={event => {
            if (!isPlainPrimaryClick(event)) return;
            event.preventDefault();
            onNavigate(withWorkbenchView(route, 'evidence'));
          }}>打开 Evidence Registry<ArrowRight aria-hidden="true" /></a>
        </aside>
      </section>
    </div>
  );
}
