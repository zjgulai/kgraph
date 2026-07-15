'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, GitBranch, LibraryBig } from 'lucide-react';
import type { DocNode } from '@/lib/parser/types';
import type { ArchitectureRoomPreview } from './ArchitectureNodes';
import { DigitalEmployee } from './DigitalEmployee';

export interface MobileArchitectureFloor {
  id: string;
  label: string;
  title: string;
  rooms: ArchitectureRoomPreview[];
}

export interface MobileFocusedRoom {
  room: ArchitectureRoomPreview;
  searchQuery?: string;
  nodesByTrack: Record<TrackKey, DocNode[]>;
  resourceCount: number;
}

export interface MobileArchitectureRelation {
  id: string;
  source: string;
  target: string;
  kind: 'flow' | 'dependency' | 'governance' | 'resource';
  label?: string;
}

interface Props {
  documentTitle: string;
  version: string;
  floors: MobileArchitectureFloor[];
  relations?: readonly MobileArchitectureRelation[];
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
  relations = [],
  focused,
  presentationByNodeId,
  highlightedNodeId,
  onOpenRoom,
  onBack,
  onOpenNode,
}: Props) {
  const [activeTrack, setActiveTrack] = useState<TrackKey | null>(null);
  const grouped = useMemo<Record<TrackKey, DocNode[]>>(
    () => focused?.nodesByTrack ?? { vibe: [], shared: [], pro: [] },
    [focused],
  );
  const highlightedTrack = useMemo<TrackKey | null>(() => {
    if (!highlightedNodeId) return null;
    return (['vibe', 'shared', 'pro'] as TrackKey[])
      .find(track => grouped[track].some(node => node.id === highlightedNodeId)) ?? null;
  }, [grouped, highlightedNodeId]);

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
          {focused.room.factory && (
            <div className="mobile-room-owner mobile-room-owner--focused">
              <DigitalEmployee
                employee={focused.room.factory.employee}
                statusLabel={focused.room.factory.statusLabel}
                compact
              />
            </div>
          )}
          {focused.searchQuery && (
            <p className="mobile-architecture__search-origin">定位搜索：{focused.searchQuery}</p>
          )}
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

      <div className="mobile-process-rail" aria-label="模块关系纵向流程轨">
        {floors.map(floor => (
          <section key={floor.id} className="mobile-process-floor">
            <header><small>{floor.label}</small><strong>{floor.title}</strong></header>
            {floor.rooms.map(room => {
              const outgoing = relations.filter(relation => relation.source === room.id);
              return (
                <article key={room.id} className={`mobile-process-room${room.selected ? ' is-selected' : ''}`}>
                  <span className="mobile-process-room__rail" aria-hidden="true"><i /></span>
                  <button type="button" aria-pressed={room.selected} onClick={() => onOpenRoom(room.id)}>
                    <span className="mobile-room-code">{room.eyebrow}</span>
                    <strong>{room.title}</strong>
                    {room.factory?.employee ? (
                      <span className="mobile-room-owner">
                        <span className="mobile-room-owner__avatar" aria-hidden="true">{room.factory.employee.displayName.slice(0, 1)}</span>
                        <span className="mobile-room-owner__identity"><b>{room.factory.employee.displayName}</b><small>{room.factory.employee.roleTitle}</small></span>
                        <span className="mobile-room-owner__status">{room.factory.statusLabel}</span>
                      </span>
                    ) : <span className="mobile-room-owner mobile-room-owner--unassigned">{room.factory?.environment.label ?? '岗位待配置'}</span>}
                    <small className="mobile-room-counts">{room.counts.vibe + room.counts.shared + room.counts.pro} 个内容节点 · {room.counts.resources} 个资源</small>
                    <ChevronRight aria-hidden="true" />
                  </button>
                  {outgoing.length > 0 && (
                    <div className="mobile-process-room__relations" aria-label={`${room.title} 的下游关系`}>
                      {outgoing.slice(0, 3).map(relation => {
                        const target = floors.flatMap(candidate => candidate.rooms).find(candidate => candidate.id === relation.target);
                        const kind = relation.kind === 'flow' ? '流程' : relation.kind === 'governance' ? '治理' : relation.kind === 'resource' ? '资源' : '依赖';
                        return <span key={relation.id} data-kind={relation.kind}><GitBranch aria-hidden="true" />{kind} 至 {target?.title ?? '下一模块'}</span>;
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </main>
  );
}
