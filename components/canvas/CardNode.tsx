'use client';
/**
 * CardNode.tsx — Factory scene content card.
 *
 * Each node is a card showing: title, type badge, summary preview, tool/step/track indicators.
 */
import React from 'react';
import { ChevronRight, Code2, Wrench, MessageSquare, ArrowRight, Star, Blocks } from 'lucide-react';

export interface CardNodeData {
  displayTitle: string;
  displaySummary: string;
  sourceLabel: string;
  type: string;
  level: number;
  track?: 'vibe' | 'pro' | 'both';
  stageNumber?: number;
  toolReferences?: string[];
  promptTemplates?: string[];
  contentBlocksCount?: number;
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

export function CardNode({ data, selected = false }: { data: CardNodeData; selected?: boolean }) {
  const d = data;
  const Icon = typeIcons[d.type];

  const isStage = d.type === 'section';
  const isTool = d.type === 'tool' || d.type === 'prompt';

  return (
    <div
      className={`architecture-content-card${selected ? ' is-selected' : ''}`}
      data-track={d.track ?? 'shared'}
      data-node-type={d.type}
    >
      <div className="architecture-content-card__body">
        <div>
          <div className="architecture-content-card__badges">
            {d.stageNumber !== undefined && d.stageNumber >= 0 && (
              <span>
                Stage {d.stageNumber}
              </span>
            )}
            {d.track && (
              <span data-track-badge={d.track}>
                {d.track === 'vibe' ? 'Vibe' : d.track === 'pro' ? 'Pro' : 'Shared'}
              </span>
            )}
            <span>
              {typeLabels[d.type] || d.type}
            </span>
            {Icon && <Icon aria-hidden="true" />}
          </div>

          <h4 className={isStage ? 'is-stage' : undefined}>
            {d.displayTitle}
          </h4>
        </div>

        {d.displaySummary && !isTool && (
          <p>
            {d.displaySummary}
          </p>
        )}

        <div className="architecture-content-card__metrics">
          {d.toolReferences && d.toolReferences.length > 0 && (
            <span><Code2 aria-hidden="true" />
              {d.toolReferences.length}
            </span>
          )}
          {d.promptTemplates && d.promptTemplates.length > 0 && (
            <span><MessageSquare aria-hidden="true" />
              {d.promptTemplates.length}
            </span>
          )}
          {d.contentBlocksCount !== undefined && d.contentBlocksCount > 0 && (
            <span><Blocks aria-hidden="true" />
              {d.contentBlocksCount}
            </span>
          )}
          {d.stageNumber !== undefined && d.stageNumber >= 1 && (
            <span className="architecture-content-card__open">
              展开 <ChevronRight aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
