'use client';

import React, { useId, useRef } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

export function Tabs<T extends string>({ label, items, value, onChange, idBase }: {
  label: string;
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  idBase?: string;
}) {
  const generatedId = useId();
  const baseId = idBase ?? generatedId;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const currentIndex = Math.max(0, items.findIndex(item => item.id === value));
  const select = (index: number) => {
    const item = items[index];
    if (!item) return;
    onChange(item.id);
    refs.current[index]?.focus();
  };
  return <div className="ds-tabs" role="tablist" aria-label={label} onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') select(0);
    else if (event.key === 'End') select(items.length - 1);
    else select((currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length);
  }}>
    {items.map((item, index) => {
      const Icon = item.icon;
      const selected = item.id === value;
      return <button key={item.id} ref={node => { refs.current[index] = node; }} id={`${baseId}-tab-${item.id}`} type="button" role="tab" aria-selected={selected} aria-controls={`${baseId}-panel-${item.id}`} tabIndex={selected ? 0 : -1} data-active={selected ? 'true' : 'false'} onClick={() => onChange(item.id)}>{Icon ? <Icon aria-hidden="true" /> : null}{item.label}</button>;
    })}
  </div>;
}

export function TabPanel({ tabId, labelledBy, active, children, className }: { tabId: string; labelledBy: string; active: boolean; children: React.ReactNode; className?: string }) {
  if (!active) return null;
  return <section id={tabId} role="tabpanel" aria-labelledby={labelledBy} tabIndex={0} className={className}>{children}</section>;
}
