'use client';

import { useEffect, useMemo, useRef } from 'react';
import { buildArchitectureViewModel } from '@/lib/canvas/architecture-view-model';
import type { DocCanvas, DocEdge, DocNode } from '@/lib/parser/types';
import { FactorySceneCanvas, type FactorySceneCanvasHandle } from './FactorySceneCanvas';
import { useFactoryLayout } from './useFactoryLayout';
import { resolveFactorySceneNodes } from '@/lib/canvas/factory-scene';

const CONTENT_NODE_COUNT = 997;
const RELATION_COUNT = 2_000;

function fixtureNode(id: string, level: number, type: DocNode['type'], title: string, children: string[]): DocNode {
  return {
    id,
    type,
    title,
    content: '',
    summary: `${title} 性能验收节点`,
    level,
    position: { x: 0, y: 0 },
    contentBlocks: [],
    metadata: { sectionHash: `scale-${id}` },
    children,
  };
}

function createScaleDocument(): DocCanvas {
  const contentIds = Array.from({ length: CONTENT_NODE_COUNT }, (_, index) => `scale-node-${index}`);
  const nodes: DocNode[] = [
    fixtureNode('scale-document', 1, 'document', 'Factory scale fixture', ['scale-module']),
    fixtureNode('scale-module', 2, 'section', '规模验收模块', contentIds),
    ...contentIds.map((id, index) => fixtureNode(id, 3, 'subsection', `规模节点 ${index + 1}`, [])),
  ];
  const edges: DocEdge[] = [];
  for (let index = 0; index < CONTENT_NODE_COUNT && edges.length < RELATION_COUNT; index += 1) {
    for (const offset of [1, 37, 113]) {
      if (edges.length >= RELATION_COUNT) break;
      const targetIndex = (index + offset) % CONTENT_NODE_COUNT;
      if (targetIndex === index) continue;
      edges.push({
        id: `scale-edge-${edges.length}`,
        source: contentIds[index],
        target: contentIds[targetIndex],
        type: offset === 37 ? 'reference' : offset === 113 ? 'expansion' : 'flow',
      });
    }
  }
  if (edges.length !== RELATION_COUNT) throw new Error('Scale fixture relation count is incomplete.');
  return {
    id: 'factory-scale-fixture',
    title: 'Factory scale fixture',
    version: '1000n-2000e',
    documentPath: '/e2e-fixtures/factory-scale',
    nodes,
    edges,
    metadata: { totalSections: nodes.length, depth: 3, lastParsed: '2026-07-15T00:00:00.000Z' },
  };
}

export function FactoryScaleFixture() {
  const handleRef = useRef<FactorySceneCanvasHandle>(null);
  const model = useMemo(() => buildArchitectureViewModel(createScaleDocument()), []);
  const regionId = model.regions.find(region => region.kind === 'room')?.id;
  if (!regionId) throw new Error('Scale fixture room was not created.');
  const layoutView = useMemo(() => ({ kind: 'focused-region' as const, regionId }), [regionId]);
  const layout = useFactoryLayout(model, layoutView, 'desktop');

  useEffect(() => {
    if (layout.nodes.length !== 1_000 || layout.edges.length !== RELATION_COUNT) return;
    const firstContent = resolveFactorySceneNodes(layout.nodes).find(node => node.kind === 'content');
    if (!firstContent) throw new Error('Scale fixture has no content node to inspect.');
    handleRef.current?.setViewport({
      x: 96 - firstContent.absolutePosition.x * 0.9,
      y: 96 - firstContent.absolutePosition.y * 0.9,
      zoom: 0.9,
    });
  }, [layout.edges.length, layout.nodes.length]);

  const ready = layout.nodes.length === 1_000 && layout.edges.length === RELATION_COUNT;
  return (
    <main
      className="factory-scale-fixture"
      data-scale-ready={ready ? 'true' : 'false'}
      data-model-nodes={layout.nodes.length}
      data-model-edges={layout.edges.length}
    >
      <FactorySceneCanvas
        ref={handleRef}
        layout={layout}
        viewKey="factory-scale-fixture"
        autoFitOnMount={false}
        renderNode={node => (
          <article className="factory-scale-node">
            <span>{node.nodeId?.replace('scale-node-', 'N') ?? 'STRUCTURE'}</span>
          </article>
        )}
        getNodeLabel={node => node.nodeId ? `规模节点 ${node.nodeId}` : '规模验收结构'}
      />
    </main>
  );
}
