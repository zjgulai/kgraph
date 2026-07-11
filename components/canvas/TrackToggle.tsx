'use client';
/**
 * TrackToggle.tsx — Collapse/expand Vibe and Pro track branches per stage.
 *
 * Renders as a floating panel that lists all 8 stages with toggle buttons
 * for their Vibe / Pro branches. Collapsing a track hides all child
 * nodes of that track under the selected stage.
 */
import { useCallback, useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { DocNode } from '@/lib/parser/types';

interface Props {
  nodes: DocNode[];
  stageNodes: DocNode[];
  expandedTracks: Set<string>;  // "stage{N}-vibe" or "stage{N}-pro"
  onToggleTrack: (trackId: string) => void;
}

export function TrackToggle({ nodes, stageNodes, expandedTracks, onToggleTrack }: Props) {
  const stageTrackMap = useMemo(() => {
    const map: Record<number, { hasVibe: boolean; hasPro: boolean }> = {};
    for (const node of nodes) {
      const stage = node.stageNumber;
      if (stage === undefined || stage < 0) continue;
      if (!map[stage]) map[stage] = { hasVibe: false, hasPro: false };
      if (node.track === 'vibe') map[stage].hasVibe = true;
      if (node.track === 'pro') map[stage].hasPro = true;
    }
    return map;
  }, [nodes]);

  return (
    <div className="bg-zinc-900/95 backdrop-blur border border-zinc-800 rounded-xl p-3 shadow-xl max-h-[48vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-semibold text-zinc-400">轨道切换</span>
        <div className="flex items-center gap-1">
          <button onClick={() => onToggleTrack('all-expand')} className="text-[9px] px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="展开全部轨道">展开</button>
          <span className="text-zinc-700">|</span>
          <button onClick={() => onToggleTrack('all-collapse')} className="text-[9px] px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="折叠全部轨道">折叠</button>
        </div>
      </div>
      <div className="space-y-0.5">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(stage => {
          const tracks = stageTrackMap[stage];
          if (!tracks) return null;

          const stageLabel = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][stage];

          return (
            <div key={stage} className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500 w-8 text-right shrink-0">{stageLabel}</span>
              {tracks.hasVibe && (
                <button
                  onClick={() => onToggleTrack(`stage${stage}-vibe`)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors
                    ${expandedTracks.has(`stage${stage}-vibe`)
                      ? 'bg-cyan-900/50 text-cyan-400'
                      : 'bg-zinc-800 text-zinc-600'}`}
                >
                  {expandedTracks.has(`stage${stage}-vibe`)
                    ? <Eye className="w-3 h-3" />
                    : <EyeOff className="w-3 h-3" />}
                  Vibe
                </button>
              )}
              {tracks.hasPro && (
                <button
                  onClick={() => onToggleTrack(`stage${stage}-pro`)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors
                    ${expandedTracks.has(`stage${stage}-pro`)
                      ? 'bg-amber-900/50 text-amber-400'
                      : 'bg-zinc-800 text-zinc-600'}`}
                >
                  {expandedTracks.has(`stage${stage}-pro`)
                    ? <Eye className="w-3 h-3" />
                    : <EyeOff className="w-3 h-3" />}
                  Pro
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
