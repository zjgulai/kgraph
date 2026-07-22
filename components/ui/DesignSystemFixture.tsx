'use client';

import React, { useRef, useState } from 'react';
import { MoreHorizontal, Save, Search } from 'lucide-react';
import { ActionButton } from './ActionButton';
import { AsyncState } from './AsyncState';
import { Dialog } from './Dialog';
import { Drawer } from './Drawer';
import { Field } from './Field';
import { Menu } from './Menu';
import { StatusBadge } from './StatusBadge';
import { Tabs } from './Tabs';

const tabs = [
  { id: 'ready', label: 'Ready' },
  { id: 'loading', label: 'Loading' },
  { id: 'empty', label: 'Empty' },
  { id: 'error', label: 'Error' },
] as const;

export function DesignSystemFixture() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('ready');
  const dialogInputRef = useRef<HTMLInputElement>(null);

  return <main className="ds-fixture">
    <header><div><span>DocCanvas Design System v2</span><h1>Governed interaction primitives</h1><p>公共控件、状态、焦点和响应式行为的隔离验收面。</p></div><StatusBadge tone="warning">Candidate only</StatusBadge></header>

    <section aria-labelledby="fixture-actions"><h2 id="fixture-actions">Actions & overlays</h2><div className="ds-fixture__row">
      <ActionButton variant="primary" onClick={() => setDialogOpen(true)}><Save aria-hidden="true" />打开保存 Dialog</ActionButton>
      <ActionButton onClick={() => setDrawerOpen(true)}>打开 Inspector Drawer</ActionButton>
      <Menu label="更多动作" items={[
        { id: 'history', label: '查看修订历史', onSelect: () => undefined },
        { id: 'export', label: '导出当前候选', onSelect: () => undefined },
        { id: 'promote', label: '提升 Canonical', disabled: true, onSelect: () => undefined },
      ]} />
      <ActionButton variant="danger">软删除候选</ActionButton>
      <ActionButton disabled>未授权动作</ActionButton>
    </div></section>

    <section aria-labelledby="fixture-fields"><h2 id="fixture-fields">Fields & status</h2><div className="ds-fixture__fields">
      <Field label="来源链接" controlId="fixture-source" hint="必须可复核且保留原始来源。"><input id="fixture-source" name="source-url" type="url" placeholder="https://example.com/source…" autoComplete="off" /></Field>
      <Field label="检索对象" controlId="fixture-search"><input id="fixture-search" name="query" type="search" placeholder="标题、摘要或对象 ID…" autoComplete="off" /></Field>
      <Field label="Revision" controlId="fixture-revision" error="Revision 已变化，请重新载入后合并。"><input id="fixture-revision" name="revision" inputMode="numeric" defaultValue="42" /></Field>
    </div><div className="ds-fixture__row"><StatusBadge tone="success">证据已验证</StatusBadge><StatusBadge tone="info">等待编译</StatusBadge><StatusBadge tone="warning">人工复核</StatusBadge><StatusBadge tone="danger">CAS 冲突</StatusBadge><StatusBadge>未测量</StatusBadge></div></section>

    <section aria-labelledby="fixture-states"><h2 id="fixture-states">Async states</h2><Tabs label="状态示例" items={[...tabs]} value={tab} onChange={setTab} idBase="fixture-state" />
      {tab === 'ready' ? <AsyncState state="success" title="候选已保存" description="修订和审计记录已写入本地候选区。" compact /> : null}
      {tab === 'loading' ? <AsyncState state="loading" title="正在载入候选…" description="正在读取本地候选区和修订索引。" compact /> : null}
      {tab === 'empty' ? <AsyncState state="empty" title="还没有候选对象" description="先固化一个来源，再创建可复核候选。" compact /> : null}
      {tab === 'error' ? <AsyncState state="error" title="加载失败" description="检查本地数据目录后重试。" actionLabel="重新加载" onAction={() => undefined} compact /> : null}
    </section>

    <Dialog open={dialogOpen} titleId="fixture-dialog-title" descriptionId="fixture-dialog-description" onClose={() => setDialogOpen(false)} initialFocusRef={dialogInputRef}>
      <div className="ds-fixture__overlay-content"><header><div><h2 id="fixture-dialog-title">保存候选修订</h2><p id="fixture-dialog-description">保存会创建新修订，不会提升为 Canonical。</p></div><MoreHorizontal aria-hidden="true" /></header><Field label="修订说明" controlId="fixture-dialog-note"><input ref={dialogInputRef} id="fixture-dialog-note" name="revision-note" autoComplete="off" placeholder="说明本次证据变化…" /></Field><footer><ActionButton onClick={() => setDialogOpen(false)}>取消</ActionButton><ActionButton variant="primary" onClick={() => setDialogOpen(false)}>保存候选</ActionButton></footer></div>
    </Dialog>

    <Drawer open={drawerOpen} titleId="fixture-drawer-title" onClose={() => setDrawerOpen(false)}>
      <div className="ds-fixture__overlay-content"><header><div><span>Context Inspector</span><h2 id="fixture-drawer-title">当前知识对象</h2></div><Search aria-hidden="true" /></header><dl><div><dt>Object ID</dt><dd>knowledge.fixture.design-system</dd></div><div><dt>Evidence</dt><dd>Human review required</dd></div><div><dt>Revision</dt><dd>R42</dd></div></dl><footer><ActionButton onClick={() => setDrawerOpen(false)}>关闭 Inspector</ActionButton></footer></div>
    </Drawer>
  </main>;
}
