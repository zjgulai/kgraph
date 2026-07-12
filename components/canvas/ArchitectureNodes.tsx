'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  ArrowRight,
  BookOpenText,
  Boxes,
  Building2,
  Layers3,
  LibraryBig,
  Route,
  ShieldCheck,
} from 'lucide-react';

export interface ArchitectureRoomPreview {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  stageNumber?: number;
  counts: {
    vibe: number;
    shared: number;
    pro: number;
    resources: number;
  };
}

export interface ArchitectureFloorData {
  floorLabel: string;
  title: string;
  rooms: ArchitectureRoomPreview[];
  mode: 'lifecycle' | 'module';
  onOpenRoom: (regionId: string) => void;
}

export interface ArchitectureCapData {
  kind: 'roof' | 'foyer' | 'foundation' | 'annex';
  eyebrow: string;
  title: string;
  summary: string;
  chips: string[];
  roomId?: string;
  onOpenRoom?: (regionId: string) => void;
}

export interface ArchitectureLaneData {
  track: 'vibe' | 'shared' | 'pro';
  title: string;
  count: number;
}

export interface ArchitectureRoomGroupData {
  eyebrow: string;
  title: string;
  summary: string;
  resourceCount: number;
}

export interface ArchitectureResourceData {
  title: string;
  count: number;
  previews: string[];
}

function ArchitectureHandles() {
  return (
    <>
      <Handle id="top-in" type="target" position={Position.Top} className="architecture-handle" />
      <Handle id="top-out" type="source" position={Position.Top} className="architecture-handle" />
      <Handle id="bottom-in" type="target" position={Position.Bottom} className="architecture-handle" />
      <Handle id="bottom-out" type="source" position={Position.Bottom} className="architecture-handle" />
      <Handle id="left-in" type="target" position={Position.Left} className="architecture-handle" />
      <Handle id="left-out" type="source" position={Position.Left} className="architecture-handle" />
      <Handle id="right-in" type="target" position={Position.Right} className="architecture-handle" />
      <Handle id="right-out" type="source" position={Position.Right} className="architecture-handle" />
    </>
  );
}

function TrackCount({ label, value, track }: { label: string; value: number; track: 'vibe' | 'shared' | 'pro' }) {
  return (
    <span className={`architecture-track-count architecture-track-count--${track}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

export function ArchitectureFloorNode({ data }: NodeProps) {
  const d = data as unknown as ArchitectureFloorData;
  const columns = d.mode === 'module' ? Math.min(4, Math.max(1, d.rooms.length)) : 2;

  return (
    <section className="architecture-floor" aria-label={`${d.floorLabel} ${d.title}`}>
      <ArchitectureHandles />
      <header className="architecture-floor__header">
        <div>
          <span className="architecture-kicker">{d.floorLabel}</span>
          <h3>{d.title}</h3>
        </div>
        <Layers3 aria-hidden="true" />
      </header>
      <div className="architecture-floor__rooms" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {d.rooms.map((room, index) => (
          <button
            type="button"
            key={room.id}
            className="architecture-room nodrag nopan"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              d.onOpenRoom(room.id);
            }}
            aria-label={`进入 ${room.title}`}
          >
            <span className="architecture-room__index">{String(index + 1).padStart(2, '0')}</span>
            <span className="architecture-room__copy">
              <span className="architecture-room__eyebrow">{room.eyebrow}</span>
              <strong className="architecture-room__title">{room.title}</strong>
            </span>
            <span className="architecture-room__metrics" aria-label="轨道节点统计">
              <TrackCount label="Vibe" value={room.counts.vibe} track="vibe" />
              <TrackCount label="共享" value={room.counts.shared} track="shared" />
              <TrackCount label="Pro" value={room.counts.pro} track="pro" />
              <span className="architecture-resource-count"><LibraryBig aria-hidden="true" />{room.counts.resources}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

const capIcons = {
  roof: Building2,
  foyer: Route,
  foundation: ShieldCheck,
  annex: BookOpenText,
};

export function ArchitectureCapNode({ data }: NodeProps) {
  const d = data as unknown as ArchitectureCapData;
  const Icon = capIcons[d.kind];
  const interactive = Boolean(d.roomId && d.onOpenRoom);
  const content = (
    <>
      <span className="architecture-cap__icon"><Icon aria-hidden="true" /></span>
      <span className="architecture-cap__copy">
        <span className="architecture-kicker">{d.eyebrow}</span>
        <strong>{d.title}</strong>
        {d.summary && <span>{d.summary}</span>}
      </span>
      {d.chips.length > 0 && (
        <span className="architecture-cap__chips">
          {d.chips.slice(0, 6).map((chip) => <span key={chip}>{chip}</span>)}
          {d.chips.length > 6 && <span>+{d.chips.length - 6}</span>}
        </span>
      )}
      {interactive && <ArrowRight className="architecture-cap__arrow" aria-hidden="true" />}
    </>
  );

  return (
    <section className={`architecture-cap architecture-cap--${d.kind}`}>
      <ArchitectureHandles />
      {interactive ? (
        <button
          type="button"
          className="architecture-cap__button nodrag nopan"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            d.onOpenRoom?.(d.roomId!);
          }}
        >
          {content}
        </button>
      ) : <div className="architecture-cap__button">{content}</div>}
    </section>
  );
}

export function ArchitectureLaneNode({ data }: NodeProps) {
  const d = data as unknown as ArchitectureLaneData;
  return (
    <section className={`architecture-lane architecture-lane--${d.track}`}>
      <header>
        <span>{d.track === 'vibe' ? 'VIBE TRACK' : d.track === 'pro' ? 'PRO TRACK' : 'SHARED CORE'}</span>
        <strong>{d.title}</strong>
        <small>{d.count} 个内容节点</small>
      </header>
    </section>
  );
}

export function ArchitectureRoomGroupNode({ data }: NodeProps) {
  const d = data as unknown as ArchitectureRoomGroupData;
  return (
    <section className="architecture-room-group">
      <header>
        <span className="architecture-kicker">{d.eyebrow}</span>
        <h2>{d.title}</h2>
        {d.summary && <p>{d.summary}</p>}
      </header>
      <div className="architecture-room-group__resource-count">
        <LibraryBig aria-hidden="true" />
        {d.resourceCount} 个资源收纳在抽屉中
      </div>
    </section>
  );
}

export function ArchitectureResourceNode({ data }: NodeProps) {
  const d = data as unknown as ArchitectureResourceData;
  return (
    <section className="architecture-resource-node">
      <LibraryBig aria-hidden="true" />
      <span>
        <small>RESOURCE SHELF</small>
        <strong>{d.title}</strong>
      </span>
      <div>
        {d.previews.slice(0, 3).map(preview => <span key={preview}>{preview}</span>)}
        {d.count > 3 && <span>+{d.count - 3}</span>}
      </div>
    </section>
  );
}

export function ArchitectureEmptyNode() {
  return (
    <div className="architecture-empty-node">
      <Boxes aria-hidden="true" />
      <span>当前房间暂无可展示内容</span>
    </div>
  );
}
