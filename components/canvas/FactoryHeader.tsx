'use client';

import type { ReactNode } from 'react';
import { Building2, Map as MapIcon, ShieldAlert } from 'lucide-react';
import { semanticTitleLines } from '@/lib/canvas/semantic-title';
import type { CanvasPresentationMode } from './CanvasPresentationSwitch';

interface FactoryHeaderProps {
  title: string;
  presentationMode: CanvasPresentationMode;
  modeLabel: string;
  version: string;
  roomCount: number;
  nodeCount: number;
  fileMeta?: string;
  statusMessage?: string;
  navigation?: ReactNode;
  actions: ReactNode;
}

export function FactoryHeader({
  title,
  presentationMode,
  modeLabel,
  version,
  roomCount,
  nodeCount,
  fileMeta,
  statusMessage,
  navigation,
  actions,
}: FactoryHeaderProps) {
  const [primaryTitle, secondaryTitle] = semanticTitleLines(title);
  const HeaderIcon = presentationMode === 'map' ? MapIcon : Building2;
  return (
    <header className="factory-header" data-presentation={presentationMode}>
      <div className="factory-header__identity">
        <span className="factory-header__mark" aria-hidden="true">
          <HeaderIcon />
        </span>
        <div className="factory-header__title">
          <span>{presentationMode === 'map' ? 'KNOWLEDGE MAP / DOCUMENT ARCHITECTURE' : 'LIVING PRODUCT FACTORY / DOCUMENT ARCHITECTURE'}</span>
          <h1>
            <span>{primaryTitle}</span>
            {secondaryTitle && <span>{secondaryTitle}</span>}
          </h1>
          <p>
            <strong>{modeLabel}</strong>
            <span>{version}</span>
            <span>{roomCount} 个岗位工作间</span>
            <span>{nodeCount} 个源节点</span>
            {fileMeta && <span>{fileMeta}</span>}
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className="factory-header__status" role="status" aria-live="polite">
          <ShieldAlert aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="factory-header__controls">
        <div className="factory-header__navigation">{navigation}</div>
        <div className="factory-header__actions">{actions}</div>
      </div>
    </header>
  );
}
