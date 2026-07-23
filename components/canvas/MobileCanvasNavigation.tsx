'use client';

import Link from 'next/link';
import { Download, Home, ImageDown, Save, Search } from 'lucide-react';

interface Props {
  exportWorking: boolean;
  onSearch: () => void;
  onSaveView: () => void;
  onExportPng: () => void;
  onExportMarkdown: () => void;
}

export function MobileCanvasNavigation({
  exportWorking,
  onSearch,
  onSaveView,
  onExportPng,
  onExportMarkdown,
}: Props) {
  return (
    <nav className="mobile-canvas-navigation" aria-label="移动端画布导航">
      <Link href="/" aria-label="返回工作台"><Home aria-hidden="true" /><span>工作台</span></Link>
      <button type="button" onClick={onSearch} aria-label="搜索画布"><Search aria-hidden="true" /><span>搜索</span></button>
      <button type="button" onClick={onSaveView} aria-label="保存个人视图"><Save aria-hidden="true" /><span>视图</span></button>
      <button type="button" disabled={exportWorking} onClick={onExportPng} aria-label="导出 PNG"><ImageDown aria-hidden="true" /><span>PNG</span></button>
      <button type="button" disabled={exportWorking} onClick={onExportMarkdown} aria-label="导出 Markdown"><Download aria-hidden="true" /><span>Markdown</span></button>
    </nav>
  );
}
