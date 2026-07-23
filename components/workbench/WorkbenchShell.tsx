'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bot,
  BookOpenText,
  Boxes,
  BrainCircuit,
  ClipboardCheck,
  Command,
  FileInput,
  FileSearch,
  FileStack,
  GitBranch,
  History,
  LayoutList,
  Network,
  Search,
  ShieldCheck,
  ShieldEllipsis,
  Sparkles,
  Workflow,
} from 'lucide-react';
import {
  withWorkbenchView,
  workbenchHref,
  type WorkbenchArea,
  type WorkbenchRoute,
  type WorkbenchView,
} from '@/lib/workbench/routes';
import { CommandPalette, type WorkbenchCommandItem } from './CommandPalette';

export type WorkbenchCountMap = Partial<Record<WorkbenchView, number | null>>;

interface ViewMeta {
  label: string;
  title: string;
  description: string;
  icon: typeof BookOpenText;
}

export const WORKBENCH_VIEW_META: Readonly<Record<WorkbenchView, ViewMeta>> = {
  work: { label: '工作队列', title: '工作队列', description: '下一动作、阻断与证据新鲜度', icon: LayoutList },
  knowledge: { label: '知识库', title: '知识资产', description: '搜索、筛选与检查候选知识', icon: BookOpenText },
  capture: { label: '采集', title: '来源采集', description: '固化来源并创建候选', icon: FileInput },
  enrichment: { label: '萃取', title: '知识萃取', description: 'Provider 候选与 Human-gold', icon: Bot },
  review: { label: '复核', title: '候选复核', description: '证据、修订与人工判断', icon: ClipboardCheck },
  canvas: { label: '知识画布', title: '知识关系', description: '查看对象关系和影响范围', icon: Network },
  solutions: { label: '方案', title: '方案工作台', description: '建立受证据约束的候选方案', icon: Sparkles },
  blueprints: { label: 'Blueprints', title: 'Blueprints', description: '修订、验证与编译', icon: Workflow },
  artifacts: { label: '产物', title: '编译产物', description: '检查 manifest 与编译视图', icon: Archive },
  workflow: { label: '流程', title: '证据流程', description: '检查产品链路的当前状态', icon: Workflow },
  evidence: { label: '证据', title: 'Evidence Registry', description: '检查来源、双时态、完整性与新鲜度', icon: FileSearch },
  provider: { label: 'Provider', title: 'Provider Ops', description: '只读检查 policy、scope、budget 与 ledger', icon: ShieldEllipsis },
  timeline: { label: '时间线', title: '双时态时间线', description: '查看现实、获知与治理事件', icon: History },
  evolution: { label: '进化', title: '进化控制面', description: '检查刹车、证据和候选行动', icon: GitBranch },
  documents: { label: '文档', title: '源文档', description: '阅读三份核心文档与画布', icon: FileStack },
};

const AREA_LABELS: Readonly<Record<WorkbenchArea, string>> = {
  knowledge: '知识',
  product: '产品',
  operations: '运营',
  sources: '来源',
};

const NAV_GROUPS: ReadonlyArray<{ area: WorkbenchArea; views: WorkbenchView[] }> = [
  { area: 'knowledge', views: ['knowledge', 'capture', 'enrichment', 'review', 'canvas'] },
  { area: 'product', views: ['solutions', 'blueprints', 'artifacts'] },
  { area: 'operations', views: ['work', 'workflow', 'evidence', 'provider', 'timeline', 'evolution'] },
  { area: 'sources', views: ['documents'] },
];

const MOBILE_AREA_DEFAULTS: Readonly<Record<WorkbenchArea, WorkbenchView>> = {
  knowledge: 'knowledge',
  product: 'solutions',
  operations: 'work',
  sources: 'documents',
};

interface Props {
  route: WorkbenchRoute;
  counts: WorkbenchCountMap;
  commandItems: WorkbenchCommandItem[];
  onNavigate: (route: WorkbenchRoute, mode?: 'push' | 'replace') => void;
  children: React.ReactNode;
}

function isPlainPrimaryClick(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function WorkbenchShell({ route, counts, commandItems, onNavigate, children }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pageTitleRef = useRef<HTMLHeadingElement>(null);
  const commandTriggerRef = useRef<HTMLButtonElement>(null);
  const current = WORKBENCH_VIEW_META[route.view];

  useEffect(() => {
    const openPalette = (event: KeyboardEvent) => {
      if (event.key.toLocaleLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      setPaletteOpen(true);
    };
    window.addEventListener('keydown', openPalette);
    return () => window.removeEventListener('keydown', openPalette);
  }, []);

  useEffect(() => {
    pageTitleRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [route.view]);

  const viewCommands = useMemo<WorkbenchCommandItem[]>(() => NAV_GROUPS.flatMap(group => group.views.map(view => {
    const target = withWorkbenchView(route, view);
    const meta = WORKBENCH_VIEW_META[view];
    return {
      id: `view:${view}`,
      label: meta.label,
      description: meta.description,
      group: AREA_LABELS[group.area],
      href: workbenchHref(target),
      route: target,
      keywords: [meta.title, view],
    };
  })), [route]);
  const allCommands = useMemo(() => [...viewCommands, ...commandItems], [commandItems, viewCommands]);

  const navigateAnchor = (event: React.MouseEvent<HTMLAnchorElement>, target: WorkbenchRoute) => {
    if (!isPlainPrimaryClick(event)) return;
    event.preventDefault();
    onNavigate(target);
  };

  return (
    <main className="workbench-shell">
      <aside className="workbench-navigation" aria-label="产品工作区导航">
        <a className="workbench-navigation__brand" href={workbenchHref(withWorkbenchView(route, 'work'))} onClick={event => navigateAnchor(event, withWorkbenchView(route, 'work'))}>
          <span><BrainCircuit aria-hidden="true" /></span>
          <div><strong>DocCanvas</strong><small>Evidence Workbench</small></div>
        </a>
        <nav>
          {NAV_GROUPS.map(group => (
            <section key={group.area} aria-labelledby={`workbench-nav-${group.area}`}>
              <h2 id={`workbench-nav-${group.area}`}>{AREA_LABELS[group.area]}</h2>
              {group.views.map(view => {
                const target = withWorkbenchView(route, view);
                const meta = WORKBENCH_VIEW_META[view];
                const Icon = meta.icon;
                const count = counts[view];
                const active = route.view === view;
                return (
                  <a
                    key={view}
                    href={workbenchHref(target)}
                    data-active={active ? 'true' : 'false'}
                    aria-current={active ? 'page' : undefined}
                    onClick={event => navigateAnchor(event, target)}
                  >
                    <Icon aria-hidden="true" /><span>{meta.label}</span>
                    {typeof count === 'number' ? <b>{count}</b> : null}
                  </a>
                );
              })}
            </section>
          ))}
        </nav>
        <div className="workbench-navigation__boundary">
          <ShieldCheck aria-hidden="true" />
          <p><strong>候选工作区</strong><span>不执行 canonical promotion</span></p>
        </div>
      </aside>

      <section className="workbench-shell__main">
        <header className="workbench-commandbar">
          <div className="workbench-commandbar__context">
            <Boxes aria-hidden="true" />
            <div><small>{AREA_LABELS[route.area]}</small><h1 ref={pageTitleRef} tabIndex={-1}>{current.title}</h1></div>
          </div>
          <button ref={commandTriggerRef} className="workbench-commandbar__search" type="button" aria-label="搜索对象与命令" onClick={() => setPaletteOpen(true)}>
            <Search aria-hidden="true" /><span>搜索对象与命令</span><kbd>⌘ K</kbd>
          </button>
          <span className="workbench-commandbar__mode"><Command aria-hidden="true" />{current.description}</span>
        </header>
        <div className="workbench-shell__content">{children}</div>
      </section>

      <nav className="workbench-mobile-domains" aria-label="移动端工作区导航">
        {(Object.keys(MOBILE_AREA_DEFAULTS) as WorkbenchArea[]).map(area => {
          const target = withWorkbenchView(route, MOBILE_AREA_DEFAULTS[area]);
          const Icon = WORKBENCH_VIEW_META[target.view].icon;
          return <a key={area} href={workbenchHref(target)} data-active={route.area === area ? 'true' : 'false'} aria-current={route.area === area ? 'page' : undefined} onClick={event => navigateAnchor(event, target)}><Icon aria-hidden="true" /><span>{AREA_LABELS[area]}</span></a>;
        })}
      </nav>

      <CommandPalette open={paletteOpen} items={allCommands} onClose={() => setPaletteOpen(false)} onNavigate={onNavigate} returnFocusRef={commandTriggerRef} />
    </main>
  );
}
