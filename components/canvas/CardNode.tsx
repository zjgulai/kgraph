'use client';
/**
 * CardNode.tsx — Custom React Flow node component.
 *
 * Each node is a card showing: title, type badge, summary preview, tool/step/track indicators.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ChevronRight, Code2, Wrench, MessageSquare, ArrowRight, Star, Blocks } from 'lucide-react';

interface CardNodeData {
  title: string;
  summary: string;
  type: string;
  level: number;
  track?: 'vibe' | 'pro' | 'both';
  stageNumber?: number;
  toolReferences?: string[];
  promptTemplates?: string[];
  contentBlocksCount?: number;
  color: string;
}

const typeLabels: Record<string, string> = {
  document: '文档',
  section: '阶段',
  subsection: '子节',
  track: '轨道',
  step: '衔接',
  tool: '工具',
  prompt: '提示词',
  principle: '原则',
};

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  tool: Wrench,
  prompt: MessageSquare,
  step: ArrowRight,
  principle: Star,
};

export function CardNode({ data }: NodeProps) {
  const d = data as unknown as CardNodeData;
  const Icon = typeIcons[d.type];

  const isDocument = d.type === 'document';
  const isStage = d.type === 'section';
  const isTrack = d.type === 'track';
  const isTool = d.type === 'tool' || d.type === 'prompt';

  const bgOpacity = isDocument ? '20' : isStage ? '15' : isTrack ? '18' : '10';
  const borderOpacity = isStage ? '50' : isTool ? '35' : '30';

  return (
    <div
      className={`group relative rounded-xl border backdrop-blur-sm transition-all duration-300 cursor-pointer overflow-hidden
        ${isDocument ? 'border-opacity-60 shadow-lg shadow-black/30 ring-1 ring-white/5' : isStage ? 'border-opacity-50 shadow-lg shadow-black/20' : 'border-opacity-30 shadow-sm shadow-black/10'}
        ${isTool ? 'scale-[0.88] hover:scale-[0.92]' : 'hover:scale-[1.02]'}
        hover:shadow-xl hover:shadow-black/30
      `}
      style={{
        background: `linear-gradient(135deg, ${d.color}${bgOpacity}, ${d.color}08)`,
        borderColor: `${d.color}${borderOpacity}`,
        width: '100%',
        height: '100%',
      }}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] opacity-50" style={{ background: `linear-gradient(90deg, transparent, ${d.color}80, transparent)` }} />

      <Handle type="target" position={Position.Top} className="!bg-zinc-500 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-500 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity" />

      <div className="px-3 py-2.5 h-full flex flex-col justify-between">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            {d.stageNumber !== undefined && d.stageNumber >= 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400 shrink-0">
                §{d.stageNumber}
              </span>
            )}
            {d.track && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md shrink-0 ${d.track === 'vibe' ? 'bg-cyan-900/50 text-cyan-400' : d.track === 'pro' ? 'bg-amber-900/50 text-amber-400' : 'bg-indigo-900/50 text-indigo-300'}`}>
                {d.track === 'vibe' ? 'Vibe' : d.track === 'pro' ? 'Pro' : 'Shared'}
              </span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-500 shrink-0">
              {typeLabels[d.type] || d.type}
            </span>
            {Icon && <Icon className="w-3 h-3 text-zinc-500 shrink-0" />}
          </div>

          <h4 className={`text-zinc-200 font-medium leading-tight line-clamp-2 ${isStage ? 'text-sm' : 'text-xs'}`}>
            {d.title}
          </h4>
        </div>

        {/* Summary */}
        {d.summary && !isTool && (
          <p className="text-zinc-500 text-[11px] leading-relaxed mt-1 line-clamp-2">
            {d.summary}
          </p>
        )}

        {/* Footer indicators */}
        <div className="flex items-center gap-2 mt-1.5">
          {d.toolReferences && d.toolReferences.length > 0 && (
            <span className="text-[10px] text-zinc-600 flex items-center gap-1">
              <Code2 className="w-2.5 h-2.5" />
              {d.toolReferences.length}
            </span>
          )}
          {d.promptTemplates && d.promptTemplates.length > 0 && (
            <span className="text-[10px] text-zinc-600 flex items-center gap-1">
              <MessageSquare className="w-2.5 h-2.5" />
              {d.promptTemplates.length}
            </span>
          )}
          {d.contentBlocksCount !== undefined && d.contentBlocksCount > 0 && (
            <span className="text-[10px] text-zinc-600 flex items-center gap-1">
              <Blocks className="w-2.5 h-2.5" />
              {d.contentBlocksCount}
            </span>
          )}
          {d.stageNumber !== undefined && d.stageNumber >= 1 && (
            <span className="text-[10px] text-zinc-600 ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              展开 <ChevronRight className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
