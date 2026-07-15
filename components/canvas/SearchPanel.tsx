'use client';
/**
 * SearchPanel.tsx — Quick search and node filter for the canvas.
 * Ctrl+K / Cmd+K to open. Matching is owned by DocumentPresentation so raw
 * source can remain searchable without leaking into visible result payloads.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, X, ChevronRight } from 'lucide-react';
import type { DocumentPresentation } from '@/lib/canvas/document-presentation';
import type { SearchNavigationTarget } from '@/lib/canvas/search-navigation';

interface Props {
  presentations: DocumentPresentation;
  regionIdByNodeId: Readonly<Record<string, string>>;
  onNavigateToResult: (target: SearchNavigationTarget) => void;
  resumeContext?: SearchNavigationTarget | null;
  openRequest?: number;
}

type SearchResults = ReturnType<DocumentPresentation['search']>;

export function SearchPanel({
  presentations,
  regionIdByNodeId,
  onNavigateToResult,
  resumeContext,
  openRequest = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<SearchResults>([]);

  const clearPendingDebounce = useCallback(() => {
    if (!debounceRef.current) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
  }, []);

  const closeSearch = useCallback(() => {
    clearPendingDebounce();
    setOpen(false);
    setQuery('');
    setDebouncedQuery('');
    setActiveIndex(0);
  }, [clearPendingDebounce]);

  const openSearch = useCallback(() => {
    clearPendingDebounce();
    const restoredQuery = resumeContext?.query ?? '';
    setQuery(restoredQuery);
    setDebouncedQuery(restoredQuery);
    setActiveIndex(0);
    setOpen(true);
  }, [clearPendingDebounce, resumeContext?.query]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setActiveIndex(0);
    clearPendingDebounce();
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      setDebouncedQuery(value);
    }, 150);
  };

  useEffect(() => clearPendingDebounce, [clearPendingDebounce]);

  useEffect(() => {
    if (openRequest <= 0) return;
    openSearch();
  }, [openRequest, openSearch]);

  // Results computed from debounced query. The index searches raw and display
  // fields, while its return type contains display-safe fields and ids only.
  const results = useMemo(() => {
    if (!debouncedQuery.trim()) {
      resultsRef.current = [];
      return [];
    }
    const matches = presentations.search(debouncedQuery, 12);
    resultsRef.current = matches;
    return matches;
  }, [debouncedQuery, presentations]);

  // Keyboard shortcut + arrow navigation — stable handler, uses ref for results
  const handleNavigate = useCallback((result: SearchResults[number]) => {
    const target: SearchNavigationTarget = {
      query: query.trim(),
      nodeId: result.nodeId,
      regionId: regionIdByNodeId[result.nodeId],
      displayTitle: result.displayTitle,
      sourceLabel: result.sourceLabel,
    };
    onNavigateToResult(target);
    closeSearch();
  }, [closeSearch, onNavigateToResult, query, regionIdByNodeId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (open) closeSearch();
        else openSearch();
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeSearch();
        return;
      }
      const current = resultsRef.current;
      if (current.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, current.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && current[activeIndex]) {
        e.preventDefault();
        handleNavigate(current[activeIndex]);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [activeIndex, closeSearch, handleNavigate, open, openSearch]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh] sm:pt-[15vh]">
      <button className="absolute inset-0 h-full w-full cursor-default bg-[var(--factory-ink)]/25" onClick={closeSearch} aria-label="关闭搜索" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-[var(--factory-border)] bg-white shadow-[0_24px_70px_rgba(24,32,25,0.18)] animate-in zoom-in-95 duration-150">
        {/* Input */}
        <div className="flex min-h-14 items-center gap-3 border-b border-[var(--factory-border)] px-4 py-2">
          <Search className="h-4 w-4 shrink-0 text-[var(--factory-muted)]" />
          <input
            autoFocus
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="搜索节点标题或内容…"
            className="min-h-11 flex-1 bg-transparent text-sm text-[var(--factory-ink)] outline-none placeholder:text-[var(--factory-muted)]"
          />
          <kbd className="rounded border border-[var(--factory-border)] bg-[var(--factory-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--factory-muted)]">ESC</kbd>
          <button
            onClick={closeSearch}
            className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--factory-muted)] transition-colors hover:bg-[var(--factory-selection)] hover:text-[var(--factory-ink)]"
            aria-label="关闭搜索"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        {debouncedQuery.trim() && (
          <div className="max-h-72 overflow-y-auto">
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--factory-muted)]">没有找到匹配的节点</div>
            ) : (
              results.map((result, idx) => {
                const badges = presentations.presentationByNodeId.get(result.nodeId)?.badges ?? [];
                return (
                  <button
                    key={result.nodeId}
                    onClick={() => handleNavigate(result)}
                    aria-label={result.accessibleLabel}
                    className={`group flex min-h-14 w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${idx === activeIndex ? 'bg-[var(--factory-engineering-surface)] shadow-[inset_3px_0_0_var(--factory-slate)]' : 'hover:bg-[var(--factory-surface)]'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="line-clamp-1 flex-1 text-sm font-medium text-[var(--factory-ink)] transition-colors group-hover:text-[var(--factory-ink)]">{result.displayTitle}</div>
                        {badges.slice(0, 2).map(badge => (
                          <span key={`${badge.kind}-${badge.label}`} className="shrink-0 rounded border border-[var(--factory-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[var(--factory-muted)]">
                            {badge.label}
                          </span>
                        ))}
                      </div>
                      <div className="mt-0.5 line-clamp-1 text-xs text-[var(--factory-muted)]">来源：{result.sourceLabel}</div>
                      {result.displaySummary && (
                        <div className="mt-0.5 line-clamp-1 text-xs text-[var(--factory-muted)]">{result.displaySummary}</div>
                      )}
                    </div>
                    <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--factory-muted)] transition-colors group-hover:text-[var(--factory-muted)]" />
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Quick nav hint */}
        {!debouncedQuery.trim() && (
          <div className="px-4 py-7 text-center text-xs text-[var(--factory-muted)]">
            <span>输入关键词搜索 {presentations.presentationByNodeId.size} 个节点 · 上下键选择 · Enter 跳转 · Ctrl+K 开关</span>
          </div>
        )}
      </div>
    </div>
  );
}
