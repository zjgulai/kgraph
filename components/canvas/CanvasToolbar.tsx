'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  FileCode2,
  Home,
  ImageDown,
  MoreHorizontal,
  RotateCcw,
  Save,
  Search,
} from 'lucide-react';
import {
  CanvasPresentationSwitch,
  type CanvasPresentationMode,
} from './CanvasPresentationSwitch';

interface CanvasToolbarProps {
  presentationMode: CanvasPresentationMode;
  onPresentationChange: (mode: CanvasPresentationMode) => void;
  showOverviewAction: boolean;
  activeStage: number | null;
  isTrackExpanded: (track: 'vibe' | 'pro') => boolean;
  onToggleTrack: (track: 'vibe' | 'pro') => void;
  onReturnToOverview: () => void;
  onSearch: () => void;
  onFit: () => void;
  onResetLayout: () => void;
  onSaveView: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportMarkdown: () => void;
  exportWorking: boolean;
  ownerControl: ReactNode;
}

export function CanvasToolbar({
  presentationMode,
  onPresentationChange,
  showOverviewAction,
  activeStage,
  isTrackExpanded,
  onToggleTrack,
  onReturnToOverview,
  onSearch,
  onFit,
  onResetLayout,
  onSaveView,
  onExportPng,
  onExportSvg,
  onExportMarkdown,
  exportWorking,
  ownerControl,
}: CanvasToolbarProps) {
  return (
    <nav className="architecture-toolbar" aria-label="画布工具栏">
      <Link href="/" aria-label="返回工作台" title="返回工作台"><Home aria-hidden="true" />工作台</Link>
      {showOverviewAction && (
        <button type="button" title="返回全景" onClick={onReturnToOverview}><ArrowLeft aria-hidden="true" />全景</button>
      )}
      <CanvasPresentationSwitch mode={presentationMode} onChange={onPresentationChange} />
      {activeStage && (['vibe', 'pro'] as const).map(track => {
        const expanded = isTrackExpanded(track);
        return (
          <button
            type="button"
            key={track}
            className={`architecture-toolbar__track architecture-toolbar__track--${track} ${expanded ? 'is-active' : ''}`}
            aria-pressed={expanded}
            title={`${expanded ? '收起' : '展开'} ${track === 'vibe' ? 'Vibe' : 'Pro'} 轨道`}
            onClick={() => onToggleTrack(track)}
          >
            {track === 'vibe' ? 'Vibe' : 'Pro'}
          </button>
        );
      })}
      <button type="button" title="搜索" onClick={onSearch}><Search aria-hidden="true" />搜索</button>
      <button type="button" title="适应画布" onClick={onFit}><RotateCcw aria-hidden="true" />适应</button>
      {ownerControl}
      <details className="architecture-toolbar__more">
        <summary><MoreHorizontal aria-hidden="true" /><span>更多</span></summary>
        <div className="architecture-toolbar__menu">
          <button type="button" title="重置自动布局" onClick={onResetLayout}><RotateCcw aria-hidden="true" />重置布局</button>
          <button type="button" title="保存个人视图" onClick={onSaveView}><Save aria-hidden="true" />保存视图</button>
          <button type="button" title="导出当前视口 PNG" disabled={exportWorking} onClick={onExportPng}><ImageDown aria-hidden="true" />当前视口 PNG</button>
          <button type="button" title="导出完整场景 SVG" disabled={exportWorking} onClick={onExportSvg}><FileCode2 aria-hidden="true" />完整场景 SVG</button>
        </div>
      </details>
      <button type="button" title="导出 Markdown" disabled={exportWorking} className="architecture-toolbar__primary" onClick={onExportMarkdown}><Download aria-hidden="true" />Markdown</button>
    </nav>
  );
}
