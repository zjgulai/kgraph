'use client';

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog } from '@/components/ui/Dialog';
import type { WorkbenchRoute } from '@/lib/workbench/routes';

export interface WorkbenchCommandItem {
  id: string;
  label: string;
  description: string;
  group: string;
  href: string;
  route: WorkbenchRoute;
  keywords?: string[];
}

interface Props {
  open: boolean;
  items: WorkbenchCommandItem[];
  onClose: () => void;
  onNavigate: (route: WorkbenchRoute) => void;
}

function isPlainPrimaryClick(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function CommandPalette({ open, items, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const inputRef = useRef<HTMLInputElement>(null);
  const visibleItems = useMemo(() => {
    if (!deferredQuery) return items.slice(0, 12);
    return items.filter(item => [item.label, item.description, item.group, ...(item.keywords ?? [])]
      .join(' ')
      .toLocaleLowerCase()
      .includes(deferredQuery)).slice(0, 12);
  }, [deferredQuery, items]);

  useEffect(() => setActiveIndex(0), [deferredQuery, items]);

  useEffect(() => {
    if (!open) return;
    document.querySelectorAll<HTMLElement>('.workbench-command-palette [role="option"]')[activeIndex]
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
  }, [open]);

  if (!open) return null;

  const handleCommandKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (visibleItems.length === 0) return;
      setActiveIndex(current => event.key === 'ArrowDown'
        ? (current + 1) % visibleItems.length
        : (current - 1 + visibleItems.length) % visibleItems.length);
      return;
    }
    if (event.key === 'Enter' && !event.nativeEvent.isComposing && visibleItems[activeIndex]) {
      event.preventDefault();
      onNavigate(visibleItems[activeIndex].route);
      onClose();
      return;
    }
  };

  return (
    <Dialog
      open={open}
      titleId="workbench-command-title"
      onClose={onClose}
      initialFocusRef={inputRef}
      backdropClassName="workbench-command-palette__backdrop"
      className="workbench-command-palette"
      onKeyDown={handleCommandKeys}
    >
      <header>
          <div>
            <Search aria-hidden="true" />
            <label htmlFor="workbench-command-query" id="workbench-command-title">搜索对象与命令</label>
          </div>
          <ActionButton variant="quiet" size="small" onClick={onClose} aria-label="关闭命令面板" title="关闭命令面板"><X aria-hidden="true" /></ActionButton>
        </header>
        <input
          ref={inputRef}
          id="workbench-command-query"
          name="workbench-command-query"
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="输入对象、工作区或动作"
          autoComplete="off"
        />
        <div className="workbench-command-palette__results" role="listbox" aria-label="命令结果" aria-activedescendant={visibleItems[activeIndex] ? `workbench-command-${visibleItems[activeIndex].id}` : undefined}>
          {visibleItems.length > 0 ? visibleItems.map((item, index) => (
            <a
              key={item.id}
              id={`workbench-command-${item.id}`}
              href={item.href}
              role="option"
              aria-selected={index === activeIndex}
              onFocus={() => setActiveIndex(index)}
              onClick={event => {
                if (!isPlainPrimaryClick(event)) return;
                event.preventDefault();
                onNavigate(item.route);
                onClose();
              }}
            >
              <span><small>{item.group}</small><strong>{item.label}</strong><p>{item.description}</p></span>
              <ArrowRight aria-hidden="true" />
            </a>
          )) : (
            <div className="workbench-command-palette__empty" role="status">没有匹配的对象或命令。</div>
          )}
        </div>
      <footer><span><kbd>↑</kbd><kbd>↓</kbd> 浏览</span><span><kbd>Esc</kbd> 关闭</span></footer>
    </Dialog>
  );
}
