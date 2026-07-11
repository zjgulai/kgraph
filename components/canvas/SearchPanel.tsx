'use client';
/**
 * SearchPanel.tsx — Quick search and node filter for the canvas.
 * Ctrl+K / Cmd+K to open. Searches node titles and content in real-time.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, X, ChevronRight, Rocket, Wrench } from 'lucide-react';
import type { DocNode } from '@/lib/parser/types';

interface Props {
  nodes: DocNode[];
  onNavigateToNode: (nodeId: string) => void;
}

export function SearchPanel({ nodes, onNavigateToNode }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<DocNode[]>([]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setActiveIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 150);
  };

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Results computed from debounced query — NOT live query (that would defeat debouncing)
  const results = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase();
    const filtered = nodes
      .filter(n => n.title.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
      .slice(0, 12);
    resultsRef.current = filtered;
    return filtered;
  }, [debouncedQuery, nodes]);

  // Keyboard shortcut + arrow navigation — stable handler, uses ref for results
  const handleNavigate = useCallback((nodeId: string) => {
    onNavigateToNode(nodeId);
    setOpen(false); setQuery(''); setDebouncedQuery(''); setActiveIndex(0);
  }, [onNavigateToNode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
        if (!open) { setQuery(''); setDebouncedQuery(''); setActiveIndex(0); }
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') { setOpen(false); setQuery(''); setDebouncedQuery(''); setActiveIndex(0); return; }
      const current = resultsRef.current;
      if (current.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, current.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && current[activeIndex]) {
        e.preventDefault();
        handleNavigate(current[activeIndex].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, activeIndex, handleNavigate]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="搜索节点标题或内容..."
            className="flex-1 bg-transparent text-zinc-200 text-sm outline-none placeholder:text-zinc-600"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">ESC</kbd>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="关闭搜索"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Results */}
        {debouncedQuery.trim() && (
          <div className="max-h-72 overflow-y-auto">
            {results.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">没有找到匹配的节点</div>
            ) : (
              results.map((n, idx) => (
                <button
                  key={n.id}
                  onClick={() => handleNavigate(n.id)}
                  className={`w-full px-4 py-2.5 text-left transition-colors flex items-start gap-3 group ${idx === activeIndex ? 'bg-indigo-900/30 border-l-2 border-indigo-500' : 'hover:bg-zinc-800/50 border-l-2 border-transparent'}`}
                >
                  <div className="shrink-0 mt-0.5">
                    {n.track === 'vibe' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/30 text-cyan-400"><Rocket className="h-2.5 w-2.5" /> Vibe</span>
                    ) : n.track === 'pro' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400"><Wrench className="h-2.5 w-2.5" /> Pro</span>
                    ) : n.track === 'both' ? (
                      <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/30 text-indigo-300">Shared</span>
                    ) : n.stageNumber !== undefined && n.stageNumber >= 0 ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">§{n.stageNumber}</span>
                    ) : n.type === 'tool' ? (
                      <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-violet-900/30 text-violet-400"><Wrench className="h-2.5 w-2.5" /></span>
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors line-clamp-1">{n.title}</div>
                    {n.summary && (
                      <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{n.summary}</div>
                    )}
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0 mt-1 transition-colors" />
                </button>
              ))
            )}
          </div>
        )}

        {/* Quick nav hint */}
        {!debouncedQuery.trim() && (
          <div className="px-4 py-6 text-center text-xs text-zinc-600">
            <span>输入关键词搜索 {nodes.length} 个节点 · ↑↓ 选择 · Enter 跳转 · Ctrl+K 开关</span>
          </div>
        )}
      </div>
    </div>
  );
}
