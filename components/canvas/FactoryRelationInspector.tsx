'use client';

import { useEffect, useRef } from 'react';
import { ArrowRight, GitBranch, X } from 'lucide-react';
import type { FactorySceneEdge } from '@/lib/canvas/factory-scene';

interface Props {
  edge: FactorySceneEdge;
  sourceLabel: string;
  targetLabel: string;
  onClose: () => void;
}

function kindLabel(kind: FactorySceneEdge['kind']): string {
  if (kind === 'flow') return '主流程';
  if (kind === 'governance') return '治理约束';
  if (kind === 'resource') return '资源引用';
  return '工程依赖';
}

export function FactoryRelationInspector({ edge, sourceLabel, targetLabel, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      restoreFocusRef.current?.focus();
    };
  }, [edge.id, onClose]);

  return (
    <aside className="factory-relation-inspector" role="dialog" aria-modal="false" aria-labelledby="factory-relation-title">
      <header>
        <span><GitBranch aria-hidden="true" /> RELATION INSPECTOR</span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭关系详情"><X aria-hidden="true" /></button>
      </header>
      <div className="factory-relation-inspector__body">
        <span className={`factory-relation-inspector__kind factory-relation-inspector__kind--${edge.kind}`}>
          {kindLabel(edge.kind)}
        </span>
        <h2 id="factory-relation-title">生产关系</h2>
        <div className="factory-relation-inspector__route">
          <strong>{sourceLabel}</strong>
          <ArrowRight aria-hidden="true" />
          <strong>{targetLabel}</strong>
        </div>
        <dl>
          <div><dt>生成依据</dt><dd>由 Markdown 层级与确定性关系规则自动生成</dd></div>
          <div><dt>路径结构</dt><dd>{edge.waypoints.length - 1} 段正交管线</dd></div>
          <div><dt>路径长度</dt><dd>{Math.round(edge.length)} 场景单位</dd></div>
          {edge.label ? <div><dt>关系标签</dt><dd>{edge.label}</dd></div> : null}
        </dl>
        <p>关系为只读。调整文档结构后，画布会重新解析并生成线路。</p>
      </div>
    </aside>
  );
}
