'use client';

import { useMemo, useState } from 'react';
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
  onOpenRoom: (regionId: string) => void;
  onBack: () => void;
  onOpenNode: (nodeId: string) => void;
}

type TrackKey = 'vibe' | 'shared' | 'pro';

export function MobileArchitectureView({
  documentTitle,
  version,
  floors,
  focused,
  onOpenRoom,
  onBack,
  onOpenNode,
}: Props) {
  const [openFloor, setOpenFloor] = useState(floors[0]?.id ?? '');
  const [activeTrack, setActiveTrack] = useState<TrackKey | null>(null);
  const grouped = useMemo<Record<TrackKey, DocNode[]>>(
    () => focused?.nodesByTrack ?? { vibe: [], shared: [], pro: [] },
    [focused],
  );

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

        <nav className="mobile-track-tabs" aria-label="内容轨道">
          {availableTracks.map(track => (
            <button
              type="button"
              key={track}
              className={selectedTrack === track ? 'is-active' : ''}
              onClick={() => setActiveTrack(track)}
            >
              {track === 'shared' ? '共享' : track === 'vibe' ? 'Vibe' : 'Pro'}
              <span>{grouped[track].length}</span>
            </button>
          ))}
        </nav>

        <section className="mobile-architecture__node-list">
          {grouped[selectedTrack].map(node => (
            <button key={node.id} type="button" onClick={() => onOpenNode(node.id)}>
              <span className="mobile-architecture__node-type">{node.type}</span>
              <strong>{node.title}</strong>
              {node.summary && <span>{node.summary}</span>}
              <ChevronRight aria-hidden="true" />
            </button>
          ))}
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
                onClick={() => setOpenFloor(open ? '' : floor.id)}
                aria-expanded={open}
              >
                <span><small>{floor.label}</small><strong>{floor.title}</strong></span>
                <ChevronDown aria-hidden="true" />
              </button>
              {open && (
                <div className="mobile-floor__rooms">
                  {floor.rooms.map(room => (
                    <button key={room.id} type="button" onClick={() => onOpenRoom(room.id)}>
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
