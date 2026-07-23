'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenText, Check, Filter, Grid2X2, LayoutList, SearchX } from 'lucide-react';
import { Field } from '@/components/ui/Field';
import { humanLabel } from '@/lib/presentation/human-labels';
import type {
  KnowledgeLibraryFilters,
  KnowledgeLibraryItem,
  KnowledgeLibraryViewState,
} from '@/lib/knowledge/library-types';
import { calculateKnowledgeVirtualWindow } from '@/lib/knowledge/library-view';

export const VIRTUALIZE_KNOWLEDGE_AFTER = 50;

interface Props {
  allItems: KnowledgeLibraryItem[];
  items: KnowledgeLibraryItem[];
  filters: KnowledgeLibraryFilters;
  viewState: KnowledgeLibraryViewState;
  selectedId: string | null;
  hrefForObject: (objectId: string) => string;
  onFiltersChange: (next: KnowledgeLibraryFilters) => void;
  onViewStateChange: (next: KnowledgeLibraryViewState) => void;
  onSelect: (objectId: string) => void;
}

function uniqueValues(items: KnowledgeLibraryItem[], select: (item: KnowledgeLibraryItem) => string): string[] {
  return [...new Set(items.map(select))].sort((left, right) => left.localeCompare(right));
}

function FilterSelect({
  label,
  name,
  value,
  options,
  onChange,
  present = value => humanLabel(value, value),
}: {
  label: string;
  name: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  present?: (value: string) => string;
}) {
  return (
    <Field label={label} controlId={name} className="knowledge-library__field">
      <select name={name} value={value} onChange={event => onChange(event.target.value)} aria-label={label}>
        <option value="">全部</option>
        {options.map(option => <option key={option} value={option}>{present(option)}</option>)}
      </select>
    </Field>
  );
}

export function KnowledgeLibrary({
  allItems,
  items,
  filters,
  viewState,
  selectedId,
  hrefForObject,
  onFiltersChange,
  onViewStateChange,
  onSelect,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ height: 720, width: 900, scrollTop: 0 });
  const domains = [...new Set(allItems.flatMap(item => item.domainRefs))].sort((left, right) => left.localeCompare(right));
  const virtualized = items.length > VIRTUALIZE_KNOWLEDGE_AFTER;
  const columnCount = viewState.layout === 'grid' && viewport.width >= 720 ? 2 : 1;
  const rowHeight = viewState.layout === 'grid'
    ? viewState.density === 'compact' ? 126 : 152
    : viewState.density === 'compact' ? 80 : 112;
  const virtualWindow = useMemo(() => calculateKnowledgeVirtualWindow({
    itemCount: items.length,
    columnCount,
    rowHeight,
    viewportHeight: viewport.height,
    scrollTop: viewport.scrollTop,
    overscanRows: 3,
  }), [columnCount, items.length, rowHeight, viewport.height, viewport.scrollTop]);
  const visibleItems = virtualized
    ? items.slice(virtualWindow.startIndex, virtualWindow.endIndex)
    : items;
  const update = <K extends keyof KnowledgeLibraryFilters>(key: K, value: KnowledgeLibraryFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };
  const updateView = <K extends keyof KnowledgeLibraryViewState>(key: K, value: KnowledgeLibraryViewState[K]) => {
    onViewStateChange({ ...viewState, [key]: value });
  };

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const updateViewport = () => setViewport(current => ({
      ...current,
      height: node.clientHeight || current.height,
      width: node.clientWidth || current.width,
    }));
    updateViewport();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateViewport);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    if (!virtualized || !selectedId) return;
    const selectedIndex = items.findIndex(item => item.objectId === selectedId);
    const node = viewportRef.current;
    if (selectedIndex < 0 || !node) return;
    const selectedRow = Math.floor(selectedIndex / columnCount);
    const top = selectedRow * rowHeight;
    const bottom = top + rowHeight;
    if (top < node.scrollTop) node.scrollTo({ top });
    else if (bottom > node.scrollTop + node.clientHeight) node.scrollTo({ top: bottom - node.clientHeight });
  }, [columnCount, items, rowHeight, selectedId, virtualized]);

  const moveSelection = useCallback((key: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End') => {
    if (items.length === 0) return;
    const currentIndex = Math.max(0, items.findIndex(item => item.objectId === selectedId));
    const step = viewState.layout === 'grid' ? columnCount : 1;
    const nextIndex = key === 'Home'
      ? 0
      : key === 'End'
        ? items.length - 1
        : key === 'ArrowDown'
          ? Math.min(items.length - 1, currentIndex + step)
          : Math.max(0, currentIndex - step);
    const next = items[nextIndex];
    if (!next) return;
    onSelect(next.objectId);
    window.requestAnimationFrame(() => {
      document.getElementById(`knowledge-option-${next.objectId}`)?.focus();
    });
  }, [columnCount, items, onSelect, selectedId, viewState.layout]);

  return (
    <section className="knowledge-library" aria-labelledby="knowledge-library-title">
      <header className="knowledge-library__header">
        <div>
          <span><BookOpenText aria-hidden="true" />LIBRARY / READ MODEL</span>
          <h2 id="knowledge-library-title">知识资产库</h2>
        </div>
        <p><strong>{items.length}</strong><span>／{allItems.length} 个对象</span></p>
      </header>

      <div className="knowledge-library__filters" aria-label="知识对象筛选">
        <span className="knowledge-library__filter-label"><Filter aria-hidden="true" />组合筛选</span>
        <Field label="搜索" controlId="knowledge-query" className="knowledge-library__query">
          <input id="knowledge-query" name="knowledge-query" type="search" aria-label="搜索知识对象" value={filters.query} onChange={event => update('query', event.target.value)} placeholder="标题、摘要、领域或 ID…" autoComplete="off" />
        </Field>
        <FilterSelect name="knowledge-domain" label="领域" value={filters.domain} options={domains} onChange={value => update('domain', value)} />
        <FilterSelect name="knowledge-form" label="知识形态" value={filters.knowledgeForm} options={uniqueValues(allItems, item => item.knowledgeForm)} onChange={value => update('knowledgeForm', value)} />
        <FilterSelect name="knowledge-evidence" label="证据等级" value={filters.evidenceGrade} options={uniqueValues(allItems, item => item.evidenceGrade)} onChange={value => update('evidenceGrade', value)} />
        <FilterSelect name="knowledge-maturity" label="资产成熟度" value={filters.assetMaturity} options={uniqueValues(allItems, item => item.assetMaturity)} onChange={value => update('assetMaturity', value)} />
        <FilterSelect name="knowledge-lifecycle" label="生命周期" value={filters.lifecycle} options={uniqueValues(allItems, item => item.legacy.status)} onChange={value => update('lifecycle', value)} />
      </div>

      <div className="knowledge-library__viewbar" aria-label="知识资产库视图">
        <Field label="排序" controlId="knowledge-sort" className="knowledge-library__sort">
          <select id="knowledge-sort" value={viewState.sort} onChange={event => updateView('sort', event.target.value as KnowledgeLibraryViewState['sort'])}>
            <option value="relevance">投影顺序</option>
            <option value="title">标题</option>
            <option value="observed">最近获知</option>
            <option value="revision">Revision</option>
          </select>
        </Field>
        <div className="knowledge-library__segmented" role="group" aria-label="列表密度">
          <button type="button" aria-pressed={viewState.density === 'compact'} onClick={() => updateView('density', 'compact')}>紧凑</button>
          <button type="button" aria-pressed={viewState.density === 'comfortable'} onClick={() => updateView('density', 'comfortable')}>舒适</button>
        </div>
        <div className="knowledge-library__segmented" role="group" aria-label="列表布局">
          <button type="button" aria-label="列表视图" aria-pressed={viewState.layout === 'list'} onClick={() => updateView('layout', 'list')}><LayoutList aria-hidden="true" /></button>
          <button type="button" aria-label="网格视图" aria-pressed={viewState.layout === 'grid'} onClick={() => updateView('layout', 'grid')}><Grid2X2 aria-hidden="true" /></button>
        </div>
        <span role="status">{virtualized ? `虚拟化 · ${visibleItems.length}/${items.length}` : `${items.length} 条全部渲染`}</span>
      </div>

      {items.length === 0 ? (
        <div className="knowledge-library__empty" role="status">
          <SearchX aria-hidden="true" />
          <h3>没有符合当前条件的对象</h3>
          <p>清除部分筛选或尝试更短的关键词。</p>
        </div>
      ) : (
        <div
          ref={viewportRef}
          className="knowledge-library__list"
          role="listbox"
          aria-label="知识对象列表"
          aria-activedescendant={selectedId ? `knowledge-option-${selectedId}` : undefined}
          data-density={viewState.density}
          data-layout={viewState.layout}
          data-virtualized={virtualized ? 'true' : 'false'}
          onScroll={event => setViewport(current => ({ ...current, scrollTop: event.currentTarget.scrollTop }))}
          onKeyDown={event => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            moveSelection(event.key as 'ArrowDown' | 'ArrowUp' | 'Home' | 'End');
          }}
        >
          <div
            className="knowledge-library__virtual-space"
            style={virtualized ? { height: virtualWindow.totalHeight } : undefined}
          >
            <div
              className="knowledge-library__virtual-items"
              style={virtualized ? { transform: `translateY(${virtualWindow.offsetTop}px)` } : undefined}
            >
          {visibleItems.map((item, visibleIndex) => {
            const index = virtualized ? virtualWindow.startIndex + visibleIndex : visibleIndex;
            const selected = item.objectId === selectedId;
            return (
              <div key={item.objectId} className="knowledge-row-item">
                <a
                  id={`knowledge-option-${item.objectId}`}
                  href={hrefForObject(item.objectId)}
                  className="knowledge-row"
                  role="option"
                  tabIndex={selected ? 0 : -1}
                  data-selected={selected ? 'true' : 'false'}
                  aria-selected={selected}
                  aria-current={selected ? 'true' : undefined}
                  onClick={event => {
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    onSelect(item.objectId);
                  }}
                >
                  <span className="knowledge-row__index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="knowledge-row__body">
                    <span className="knowledge-row__eyebrow">
                      <b>{humanLabel(item.knowledgeForm, item.knowledgeForm)}</b>
                      <i>{humanLabel(item.legacy.category, item.legacy.category)}</i>
                      {item.legacy.status !== 'active' && <em>{humanLabel(item.legacy.status, item.legacy.status)}</em>}
                    </span>
                    <strong>{item.title}</strong>
                    <small>{item.summary}</small>
                  </span>
                  <span className="knowledge-row__governance">
                    <span>{humanLabel(item.evidenceGrade, item.evidenceGrade)}</span>
                    <span>{humanLabel(item.assetMaturity, item.assetMaturity)}</span>
                    <span className="is-review">人工复核 · {item.reviewReasons.length}</span>
                  </span>
                  <span className="knowledge-row__selected" aria-hidden="true"><Check /></span>
                </a>
              </div>
            );
          })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
