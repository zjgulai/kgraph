'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, LibraryBig } from 'lucide-react';
import type { DocNode } from '@/lib/parser/types';
import type { ArchitectureRoomPreview } from './ArchitectureNodes';

export interface MobileArchitectureFloor {
  id: string;
  label: string;
  title: string;
  rooms: ArchitectureRoomPreview[];
}

export interface MobileFocusedRoom {
  room: ArchitectureRoomPreview;
  nodesByTrack: Record<TrackKey, DocNode[]>;
  resourceCount: number;
}

interface Props {
  documentTitle: string;
  version: string;
  floors: MobileArchitectureFloor[];
  focused?: MobileFocusedRoom;
  presentationByNodeId: PresentationByNodeId;
  highlightedNodeId?: string;
  onOpenRoom: (regionId: string) => void;
  onBack: () => void;
  onOpenNode: (nodeId: string) => void;
}

type TrackKey = 'vibe' | 'shared' | 'pro';

export interface ArchitectureNodePresentation {
  displayTitle: string;
  displaySummary: string;
  sourceLabel: string;
}

export type PresentationByNodeId = Readonly<Record<string, ArchitectureNodePresentation>>;

const nodeTypeLabels: Record<DocNode['type'], string> = {
  document: '文档',
  section: '阶段',
  subsection: '子节',
  track: '轨道',
  step: '步骤',
  tool: '工具',
  prompt: '提示词',
  principle: '原则',
};

const missingPresentation: ArchitectureNodePresentation = {
  displayTitle: '内容节点',
  displaySummary: '暂无摘要',
  sourceLabel: '来源未标注',
};

export function MobileArchitectureView({
  documentTitle,
  version,
  floors,
  focused,
  presentationByNodeId,
  highlightedNodeId,
  onOpenRoom,
  onBack,
  onOpenNode,
}: Props) {
  const [openFloor, setOpenFloor] = useState(floors[floors.length - 1]?.id ?? '');
  const [activeTrack, setActiveTrack] = useState<TrackKey | null>(null);
  const grouped = useMemo<Record<TrackKey, DocNode[]>>(
    () => focused?.nodesByTrack ?? { vibe: [], shared: [], pro: [] },
    [focused],
  );
  const selectedFloor = useMemo(
    () => floors.find(floor => floor.rooms.some(room => room.selected)),
    [floors],
  );
  const highlightedTrack = useMemo<TrackKey | null>(() => {
    if (!highlightedNodeId) return null;
    return (['vibe', 'shared', 'pro'] as TrackKey[])
      .find(track => grouped[track].some(node => node.id === highlightedNodeId)) ?? null;
  }, [grouped, highlightedNodeId]);

  useEffect(() => {
    if (selectedFloor) {
      setOpenFloor(selectedFloor.id);
      return;
    }
    setOpenFloor(current => (
      floors.some(floor => floor.id === current)
        ? current
        : floors[floors.length - 1]?.id ?? ''
    ));
  }, [floors, selectedFloor]);

  useEffect(() => {
    if (highlightedTrack) setActiveTrack(highlightedTrack);
  }, [highlightedTrack]);

  if (focused) {
    const availableTracks = (['vibe', 'shared', 'pro'] as TrackKey[]).filter(track =>
      track === 'shared' || grouped[track].length > 0,
    );
    const selectedTrack = activeTrack && availableTracks.includes(activeTrack)
      ? activeTrack
      : availableTracks.find(track => grouped[track].length > 0) ?? 'shared';
    return (
      <main className="mobile-architecture mobile-architecture--focused">
        <header className="mobile-architecture__sticky-header">
          <button type="button" onClick={onBack} className="mobile-architecture__back">
            <ArrowLeft aria-hidden="true" />
            返回全景
          </button>
          <span>{focused.room.eyebrow}</span>
          <h1>{focused.room.title}</h1>
          {focused.room.summary && <p>{focused.room.summary}</p>}
        </header>

        <div className="mobile-track-tabs" role="tablist" aria-label="内容轨道">
          {availableTracks.map(track => (
            <button
              type="button"
              role="tab"
              key={track}
              className={selectedTrack === track ? 'is-active' : ''}
              aria-selected={selectedTrack === track}
              onClick={() => setActiveTrack(track)}
            >
              {track === 'shared' ? '共享' : track === 'vibe' ? 'Vibe' : 'Pro'}
              <span>{grouped[track].length}</span>
            </button>
          ))}
        </div>

        <section className="mobile-architecture__node-list">
          {grouped[selectedTrack].map(node => {
            const presentation = presentationByNodeId[node.id] ?? missingPresentation;
            const highlighted = node.id === highlightedNodeId;
            return (
              <button
                key={node.id}
                type="button"
                className={highlighted ? 'is-highlighted' : undefined}
                aria-current={highlighted ? true : undefined}
                onClick={() => onOpenNode(node.id)}
              >
                <span className="mobile-architecture__node-type">{nodeTypeLabels[node.type]}</span>
                <strong>{presentation.displayTitle}</strong>
                {presentation.displaySummary && <span>{presentation.displaySummary}</span>}
                <ChevronRight aria-hidden="true" />
              </button>
            );
          })}
          {grouped[selectedTrack].length === 0 && <p className="mobile-architecture__empty">该轨道暂无内容。</p>}
        </section>

        {focused.resourceCount > 0 && (
          <div className="mobile-resource-shelf">
            <LibraryBig aria-hidden="true" />
            <span>资源抽屉</span>
            <strong>{focused.resourceCount}</strong>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="mobile-architecture">
      <header className="mobile-architecture__hero">
        <span>PRODUCT FACTORY / ARCHITECTURE</span>
        <h1>{documentTitle}</h1>
        <p>{version} · 点击楼层展开，再进入房间查看完整内容</p>
      </header>

      <div className="mobile-architecture__floors">
        {[...floors].reverse().map(floor => {
          const open = floor.id === openFloor;
          return (
            <section key={floor.id} className={`mobile-floor ${open ? 'is-open' : ''}`}>
              <button
                type="button"
                className="mobile-floor__toggle"
                onClick={() => setOpenFloor(floor.id)}
                aria-expanded={open}
              >
                <span><small>{floor.label}</small><strong>{floor.title}</strong></span>
                <ChevronDown aria-hidden="true" />
              </button>
              {open && (
                <div className="mobile-floor__rooms">
                  {floor.rooms.map(room => (
                    <button
                      key={room.id}
                      type="button"
                      className={room.selected ? 'is-selected' : undefined}
                      aria-pressed={room.selected}
                      onClick={() => onOpenRoom(room.id)}
                    >
                      <span>{room.eyebrow}</span>
                      <strong>{room.title}</strong>
                      <small>{room.counts.vibe + room.counts.shared + room.counts.pro} 个内容节点 · {room.counts.resources} 个资源</small>
                      <ChevronRight aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
