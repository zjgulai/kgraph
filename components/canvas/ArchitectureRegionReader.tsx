'use client';

import React from 'react';
import { BookOpenText, DoorOpen, X } from 'lucide-react';

export interface ArchitectureRegionReaderRegion {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  sourceLabels: string[];
  previewNodeIds: string[];
}

export interface ArchitectureRegionReaderPresentation {
  displayTitle: string;
  displaySummary: string;
  sourceLabel: string;
}

interface Props {
  region: ArchitectureRegionReaderRegion;
  presentations: Readonly<Record<string, ArchitectureRegionReaderPresentation>>;
  highlightedNodeId?: string;
  onEnterRoom: (regionId: string) => void;
  onClose: () => void;
}

export function ArchitectureRegionReader({
  region,
  presentations,
  highlightedNodeId,
  onEnterRoom,
  onClose,
}: Props) {
  const prioritizedPreviewNodeIds = highlightedNodeId && presentations[highlightedNodeId]
    ? [highlightedNodeId, ...region.previewNodeIds.filter(nodeId => nodeId !== highlightedNodeId)]
    : region.previewNodeIds;
  const previews = prioritizedPreviewNodeIds
    .map(nodeId => ({ nodeId, presentation: presentations[nodeId] }))
    .filter((entry): entry is { nodeId: string; presentation: ArchitectureRegionReaderPresentation } => (
      Boolean(entry.presentation)
    ))
    .slice(0, 3);

  return (
    <aside className="architecture-region-reader" aria-label={`房间速读 ${region.title}`}>
      <button
        type="button"
        className="architecture-region-reader__close"
        onClick={onClose}
        aria-label="关闭房间速读"
      >
        <X aria-hidden="true" />
      </button>
      <header className="architecture-region-reader__header">
        <span className="architecture-kicker">{region.eyebrow}</span>
        <h2>{region.title}</h2>
        {region.summary && <p>{region.summary}</p>}
      </header>

      {region.sourceLabels.length > 0 && (
        <section className="architecture-region-reader__sources" aria-labelledby={`${region.id}-sources`}>
          <h3 id={`${region.id}-sources`}>
            <BookOpenText aria-hidden="true" />
            来源章节
          </h3>
          <ul>
            {region.sourceLabels.slice(0, 3).map(sourceLabel => (
              <li key={sourceLabel}>{sourceLabel}</li>
            ))}
          </ul>
        </section>
      )}

      {previews.length > 0 && (
        <section className="architecture-region-reader__previews" aria-labelledby={`${region.id}-previews`}>
          <h3 id={`${region.id}-previews`}>内容预览</h3>
          <ol>
            {previews.map(({ nodeId, presentation }) => {
              const highlighted = highlightedNodeId === nodeId;
              return (
                <li
                  key={nodeId}
                  className={highlighted ? 'is-highlighted' : undefined}
                  aria-current={highlighted ? true : undefined}
                >
                  <strong>{presentation.displayTitle}</strong>
                  {presentation.displaySummary && <span>{presentation.displaySummary}</span>}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <button
        type="button"
        className="architecture-region-reader__enter"
        onClick={() => onEnterRoom(region.id)}
      >
        <DoorOpen aria-hidden="true" />
        进入完整房间
      </button>
    </aside>
  );
}
