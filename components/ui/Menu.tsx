'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { ActionButton } from './ActionButton';

export interface MenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => itemRefs.current[activeIndex]?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, open]);

  const move = (direction: 1 | -1) => {
    if (items.length === 0) return;
    let next = activeIndex;
    do next = (next + direction + items.length) % items.length;
    while (items[next]?.disabled && next !== activeIndex);
    setActiveIndex(next);
  };
  const firstEnabled = items.findIndex(item => !item.disabled);
  const lastEnabled = items.findLastIndex(item => !item.disabled);

  return <div ref={rootRef} className="ds-menu">
    <ActionButton ref={triggerRef} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}>{label}</ActionButton>
    {open ? <div id={menuId} className="ds-menu__content" role="menu" aria-label={label} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
      if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
      if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
      if (event.key === 'Home' && firstEnabled >= 0) { event.preventDefault(); setActiveIndex(firstEnabled); }
      if (event.key === 'End' && lastEnabled >= 0) { event.preventDefault(); setActiveIndex(lastEnabled); }
    }}>
      {items.map((item, index) => <button key={item.id} ref={node => { itemRefs.current[index] = node; }} type="button" role="menuitem" disabled={item.disabled} tabIndex={index === activeIndex ? 0 : -1} onFocus={() => setActiveIndex(index)} onClick={() => { item.onSelect(); setOpen(false); }}>{item.label}</button>)}
    </div> : null}
  </div>;
}
