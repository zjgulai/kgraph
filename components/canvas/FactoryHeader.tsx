'use client';

import type { ReactNode } from 'react';
import { Building2, ShieldAlert } from 'lucide-react';

interface FactoryHeaderProps {
  title: string;
  modeLabel: string;
  version: string;
  roomCount: number;
  nodeCount: number;
  fileMeta?: string;
  statusMessage?: string;
  navigation?: ReactNode;
  actions: ReactNode;
}

function semanticTitleLines(title: string): [string, string?] {
  const normalized = title.replace(/\s+/gu, ' ').trim();
  const delimiter = normalized.match(/^(.{4,40}?)(?:\s*[—–｜|：:]\s*)(.{3,48})$/u);
  if (delimiter) return [delimiter[1], delimiter[2]];
  const productSuffix = normalized.match(/^(.{6,32}?)(Playbook(?:[-\s]?v?[\d.]+)?|VibeTrack(?:[-\s]?v?[\d.]+)?|v\d+(?:\.\d+)+(?:\s+Pro)?)$/iu);
  if (productSuffix) return [productSuffix[1].trim(), productSuffix[2].trim()];
  return [normalized];
}

export function FactoryHeader({
  title,
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
  return (
    <header className="factory-header">
      <div className="factory-header__identity">
        <span className="factory-header__mark" aria-hidden="true">
          <Building2 />
        </span>
        <div className="factory-header__title">
          <span>LIVING PRODUCT FACTORY / DOCUMENT ARCHITECTURE</span>
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
