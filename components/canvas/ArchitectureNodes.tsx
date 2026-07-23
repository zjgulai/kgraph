'use client';

import React from 'react';
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
import type { FactoryPresentation } from '@/lib/canvas/factory-presentation';
import { DigitalEmployee } from './DigitalEmployee';

export interface ArchitectureRoomPreview {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  selected: boolean;
  stageNumber?: number;
  factory?: FactoryPresentation;
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
  mode: 'lifecycle' | 'module';
}

export interface ArchitectureRoomData extends ArchitectureRoomPreview {
  roomIndex: number;
  factory: FactoryPresentation;
  onSelectRoom: (regionId: string) => void;
}

export interface ArchitectureCapData {
  kind: 'roof' | 'foyer' | 'foundation' | 'annex';
  eyebrow: string;
  title: string;
  summary: string;
  chips: string[];
  selected: boolean;
  roomId?: string;
  onSelectRoom?: (regionId: string) => void;
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

function TrackCount({ label, value, track }: { label: string; value: number; track: 'vibe' | 'shared' | 'pro' }) {
  return (
    <span className={`architecture-track-count architecture-track-count--${track}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

export function ArchitectureFloorNode({ data }: { data: ArchitectureFloorData }) {
  const d = data;

  return (
    <section className="architecture-floor" aria-label={`${d.floorLabel} ${d.title}`}>
      <header className="architecture-floor__header">
        <div>
          <span className="architecture-kicker">{d.floorLabel}</span>
          <h3>{d.title}</h3>
        </div>
        <Layers3 aria-hidden="true" />
      </header>
      <div className="architecture-floor__spine" aria-hidden="true" />
      <div className="architecture-floor__beam" aria-hidden="true" />
    </section>
  );
}

export function ArchitectureRoomNode({ data }: { data: ArchitectureRoomData }) {
  const room = data;
  return (
    <section className="architecture-room-node">
      <button
        type="button"
        className={`architecture-room nodrag nopan${room.selected ? ' is-selected' : ''}`}
        data-environment={room.factory.environment.id}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          room.onSelectRoom(room.id);
        }}
        aria-label={`选择房间 ${room.title}`}
        aria-pressed={room.selected}
      >
        <span className="architecture-room__environment" aria-hidden="true" />
        <span className="architecture-room__index">{String(room.roomIndex).padStart(2, '0')}</span>
        <span className="architecture-room__copy">
          <span className="architecture-room__eyebrow">{room.eyebrow}</span>
          <strong className="architecture-room__title">{room.title}</strong>
          {room.summary && <span className="architecture-room__summary">{room.summary}</span>}
        </span>
        <DigitalEmployee
          employee={room.factory.employee}
          statusLabel={room.factory.statusLabel}
          compact
        />
        <span className="architecture-room__metrics" aria-label="轨道节点统计">
          <TrackCount label="Vibe" value={room.counts.vibe} track="vibe" />
          <TrackCount label="共享" value={room.counts.shared} track="shared" />
          <TrackCount label="Pro" value={room.counts.pro} track="pro" />
          <span className="architecture-resource-count"><LibraryBig aria-hidden="true" />{room.counts.resources}</span>
        </span>
      </button>
    </section>
  );
}

const capIcons = {
  roof: Building2,
  foyer: Route,
  foundation: ShieldCheck,
  annex: BookOpenText,
};

export function ArchitectureCapNode({ data }: { data: ArchitectureCapData }) {
  const d = data;
  if (d.kind === 'roof') {
    return (
      <section className="architecture-cap architecture-cap--roof" aria-label="产品工厂工业檐口">
        <div className="factory-roof" aria-hidden="true">
          <span className="factory-roof__cornice" />
          <span className="factory-roof__label factory-roof__label--factory">LIVING PRODUCT FACTORY</span>
          <span className="factory-roof__label factory-roof__label--map">KNOWLEDGE MAP</span>
          <span className="factory-roof__legend">
            <span data-kind="flow">主流程</span>
            <span data-kind="governance">治理</span>
            <span data-kind="dependency">依赖</span>
            <span data-kind="resource">资源</span>
          </span>
          <span className="factory-roof__profile"><i /><i /><i /></span>
          <span className="factory-roof__depth" />
        </div>
      </section>
    );
  }
  const Icon = capIcons[d.kind];
  const interactive = Boolean(d.roomId && d.onSelectRoom);
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
      {interactive ? (
        <button
          type="button"
          className={`architecture-cap__button nodrag nopan${d.selected ? ' is-selected' : ''}`}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            d.onSelectRoom?.(d.roomId!);
          }}
          aria-label={`选择房间 ${d.title}`}
          aria-pressed={d.selected}
        >
          {content}
        </button>
      ) : <div className="architecture-cap__button">{content}</div>}
    </section>
  );
}

export function ArchitectureLaneNode({ data }: { data: ArchitectureLaneData }) {
  const d = data;
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

export function ArchitectureRoomGroupNode({ data }: { data: ArchitectureRoomGroupData }) {
  const d = data;
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

export function ArchitectureResourceNode({ data }: { data: ArchitectureResourceData }) {
  const d = data;
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
