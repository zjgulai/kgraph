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

export function CardNode({ data, selected }: NodeProps) {
  const d = data as unknown as CardNodeData;
  const Icon = typeIcons[d.type];

  const isStage = d.type === 'section';
  const isTool = d.type === 'tool' || d.type === 'prompt';

  return (
    <div
      className={`group relative h-full w-full cursor-pointer overflow-hidden rounded-[14px] border bg-white transition-[border-color,box-shadow] duration-150 ${selected ? 'border-[#355C45] shadow-[0_0_0_2px_rgba(53,92,69,0.16),0_12px_30px_rgba(35,48,32,0.12)]' : 'border-[#D5DFD0] shadow-[0_8px_22px_rgba(35,48,32,0.07)] hover:border-[#9AAC96] hover:shadow-[0_12px_28px_rgba(35,48,32,0.11)]'}`}
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: d.color }} />

      <Handle id="top" type="target" position={Position.Top} className="architecture-card-handle" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="architecture-card-handle" />
      <Handle id="left" type="target" position={Position.Left} className="architecture-card-handle" />
      <Handle id="right" type="source" position={Position.Right} className="architecture-card-handle" />

      <div className="px-3 py-2.5 h-full flex flex-col justify-between">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            {d.stageNumber !== undefined && d.stageNumber >= 0 && (
              <span className="shrink-0 rounded-md bg-[#EDF3E9] px-1.5 py-0.5 font-mono text-[10px] text-[#637064]">
                §{d.stageNumber}
              </span>
            )}
            {d.track && (
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${d.track === 'vibe' ? 'bg-[#E2F2EF] text-[#147D78]' : d.track === 'pro' ? 'bg-[#F7ECDD] text-[#9A5B12]' : 'bg-[#E9ECF6] text-[#4F5F9B]'}`}>
                {d.track === 'vibe' ? 'Vibe' : d.track === 'pro' ? 'Pro' : 'Shared'}
              </span>
            )}
            <span className="shrink-0 rounded-md border border-[#D5DFD0] bg-[#F8FBF2] px-1.5 py-0.5 text-[10px] text-[#637064]">
              {typeLabels[d.type] || d.type}
            </span>
            {Icon && <Icon className="h-3 w-3 shrink-0 text-[#637064]" />}
          </div>

          <h4 className={`line-clamp-2 font-semibold leading-snug text-[#182019] ${isStage ? 'text-sm' : 'text-xs'}`}>
            {d.title}
          </h4>
        </div>

        {/* Summary */}
        {d.summary && !isTool && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#637064]">
            {d.summary}
          </p>
        )}

        {/* Footer indicators */}
        <div className="flex items-center gap-2 mt-1.5">
          {d.toolReferences && d.toolReferences.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[#637064]">
              <Code2 className="w-2.5 h-2.5" />
              {d.toolReferences.length}
            </span>
          )}
          {d.promptTemplates && d.promptTemplates.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[#637064]">
              <MessageSquare className="w-2.5 h-2.5" />
              {d.promptTemplates.length}
            </span>
          )}
          {d.contentBlocksCount !== undefined && d.contentBlocksCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[#637064]">
              <Blocks className="w-2.5 h-2.5" />
              {d.contentBlocksCount}
            </span>
          )}
          {d.stageNumber !== undefined && d.stageNumber >= 1 && (
            <span className="ml-auto flex items-center gap-0.5 text-[10px] text-[#355C45] opacity-0 transition-opacity group-hover:opacity-100">
              展开 <ChevronRight className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
