'use client';

import React from 'react';
import { BookOpenText, Check, Filter, SearchX } from 'lucide-react';
import type {
  KnowledgeLibraryFilters,
  KnowledgeLibraryItem,
} from '@/lib/knowledge/library-types';

interface Props {
  allItems: KnowledgeLibraryItem[];
  items: KnowledgeLibraryItem[];
  filters: KnowledgeLibraryFilters;
  selectedId: string | null;
  onFiltersChange: (next: KnowledgeLibraryFilters) => void;
  onSelect: (objectId: string) => void;
}

function uniqueValues(items: KnowledgeLibraryItem[], select: (item: KnowledgeLibraryItem) => string): string[] {
  return [...new Set(items.map(select))].sort((left, right) => left.localeCompare(right));
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)} aria-label={label}>
        <option value="">全部</option>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export function KnowledgeLibrary({
  allItems,
  items,
  filters,
  selectedId,
  onFiltersChange,
  onSelect,
}: Props) {
  const domains = [...new Set(allItems.flatMap(item => item.domainRefs))].sort((left, right) => left.localeCompare(right));
  const update = <K extends keyof KnowledgeLibraryFilters>(key: K, value: KnowledgeLibraryFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

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
        <FilterSelect label="领域" value={filters.domain} options={domains} onChange={value => update('domain', value)} />
        <FilterSelect label="知识形态" value={filters.knowledgeForm} options={uniqueValues(allItems, item => item.knowledgeForm)} onChange={value => update('knowledgeForm', value)} />
        <FilterSelect label="证据等级" value={filters.evidenceGrade} options={uniqueValues(allItems, item => item.evidenceGrade)} onChange={value => update('evidenceGrade', value)} />
        <FilterSelect label="资产成熟度" value={filters.assetMaturity} options={uniqueValues(allItems, item => item.assetMaturity)} onChange={value => update('assetMaturity', value)} />
        <FilterSelect label="生命周期" value={filters.lifecycle} options={uniqueValues(allItems, item => item.legacy.status)} onChange={value => update('lifecycle', value)} />
      </div>

      {items.length === 0 ? (
        <div className="knowledge-library__empty" role="status">
          <SearchX aria-hidden="true" />
          <h3>没有符合当前条件的对象</h3>
          <p>清除部分筛选或尝试更短的关键词。</p>
        </div>
      ) : (
        <div className="knowledge-library__list" role="list" aria-label="知识对象列表">
          {items.map((item, index) => {
            const selected = item.objectId === selectedId;
            return (
              <div key={item.objectId} role="listitem" className="knowledge-row-item">
                <button
                  type="button"
                  className="knowledge-row"
                  data-selected={selected ? 'true' : 'false'}
                  aria-pressed={selected}
                  onClick={() => onSelect(item.objectId)}
                >
                  <span className="knowledge-row__index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="knowledge-row__body">
                    <span className="knowledge-row__eyebrow">
                      <b>{item.knowledgeForm}</b>
                      <i>{item.legacy.category}</i>
                      {item.legacy.status !== 'active' && <em>{item.legacy.status}</em>}
                    </span>
                    <strong>{item.title}</strong>
                    <small>{item.summary}</small>
                  </span>
                  <span className="knowledge-row__governance">
                    <span>{item.evidenceGrade}</span>
                    <span>{item.assetMaturity}</span>
                    <span className="is-review">人工复核 · {item.reviewReasons.length}</span>
                  </span>
                  <span className="knowledge-row__selected" aria-hidden="true"><Check /></span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
