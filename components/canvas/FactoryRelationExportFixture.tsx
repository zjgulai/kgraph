'use client';

import { useCallback, useRef, useState } from 'react';
import { toSvg } from 'html-to-image';
import type {
  ArchitectureLayoutEdge,
  ArchitectureLayoutNode,
  ArchitectureLayoutResult,
} from '@/lib/canvas/layout-engine';
import { FactorySceneCanvas, type FactorySceneCanvasHandle } from './FactorySceneCanvas';

const RELATION_KINDS = ['flow', 'dependency', 'governance', 'resource'] as const;

const nodes: ArchitectureLayoutNode[] = RELATION_KINDS.flatMap((kind, index) => {
  const y = 48 + index * 140;
  return [
    {
      id: `fixture:${kind}:source`,
      kind: 'content',
      position: { x: 48, y },
      width: 168,
      height: 80,
      nodeId: `fixture:${kind}:source`,
      draggable: false,
    },
    {
      id: `fixture:${kind}:target`,
      kind: 'content',
      position: { x: 520, y },
      width: 168,
      height: 80,
      nodeId: `fixture:${kind}:target`,
      draggable: false,
    },
  ];
});

const edges: ArchitectureLayoutEdge[] = RELATION_KINDS.map((kind, index) => {
  const centerY = 88 + index * 140;
  return {
    id: `fixture:${kind}`,
    source: `fixture:${kind}:source`,
    target: `fixture:${kind}:target`,
    kind,
    sourceHandle: 'right-out',
    targetHandle: 'left-in',
    marker: 'arrow-closed',
    waypoints: [{ x: 216, y: centerY }, { x: 520, y: centerY }],
    label: kind,
    animated: false,
  };
});

const layout: ArchitectureLayoutResult = {
  view: 'focused-region',
  regionId: 'fixture:relations',
  nodes,
  edges,
  bounds: { x: 0, y: 0, width: 736, height: 608 },
};

export function FactoryRelationExportFixture() {
  const sceneRef = useRef<FactorySceneCanvasHandle>(null);
  const [exporting, setExporting] = useState(false);

  const exportSvg = useCallback(async () => {
    const sceneElement = sceneRef.current?.getSceneElement();
    if (!sceneElement) throw new Error('Relation export fixture scene is unavailable.');
    setExporting(true);
    try {
      const dataUrl = await toSvg(sceneElement, {
        width: layout.bounds.width,
        height: layout.bounds.height,
        style: {
          width: `${layout.bounds.width}px`,
          height: `${layout.bounds.height}px`,
          transform: 'none',
          transformOrigin: '0 0',
        },
      });
      const link = document.createElement('a');
      link.download = 'factory-relation-presentation.svg';
      link.href = dataUrl;
      link.click();
      link.remove();
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <main
      className="factory-scale-fixture factory-relation-export-fixture"
      data-relation-kinds={RELATION_KINDS.join(',')}
    >
      <FactorySceneCanvas
        ref={sceneRef}
        layout={layout}
        viewKey="factory-relation-export-fixture"
        renderAll
        renderNode={node => <article className="factory-scale-node">{node.nodeId}</article>}
        getNodeLabel={node => node.nodeId ?? node.id}
      />
      <button
        className="factory-relation-export-fixture__export"
        type="button"
        disabled={exporting}
        onClick={exportSvg}
      >
        {exporting ? '正在导出' : '导出关系 SVG'}
      </button>
    </main>
  );
}
