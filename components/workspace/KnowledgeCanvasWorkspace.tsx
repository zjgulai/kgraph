'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CircleDotDashed,
  ExternalLink,
  Fingerprint,
  GitFork,
  Layers3,
  Network,
  Route,
  ShieldCheck,
} from 'lucide-react';
import { FactorySceneCanvas } from '@/components/canvas/FactorySceneCanvas';
import type { FactorySceneEdge, FactorySceneNode } from '@/lib/canvas/factory-scene';
import {
  buildKnowledgeCanvasProjection,
  type KnowledgeCanvasRelation,
} from '@/lib/knowledge/canvas-projection';
import type { KnowledgeLibraryProjection } from '@/lib/knowledge/library-types';

interface Props {
  library: KnowledgeLibraryProjection;
  initialObjectId?: string | null;
  onSelectKnowledge: (objectId: string) => void;
}

function useMobileCanvas(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return isMobile;
}

export function KnowledgeCanvasWorkspace({ library, initialObjectId, onSelectKnowledge }: Props) {
  const projection = useMemo(() => buildKnowledgeCanvasProjection(library.items), [library.items]);
  const [selectedObjectId, setSelectedObjectId] = useState(
    initialObjectId && projection.objects.some(object => object.objectId === initialObjectId)
      ? initialObjectId
      : projection.objects[0]?.objectId ?? '',
  );
  const [selectedRelation, setSelectedRelation] = useState<KnowledgeCanvasRelation | null>(null);
  const isMobile = useMobileCanvas();
  const objectBySceneId = useMemo(
    () => new Map(projection.objects.map(object => [object.sceneNodeId, object])),
    [projection.objects],
  );
  const groupBySceneId = useMemo(
    () => new Map(projection.groups.map(group => [group.sceneNodeId, group])),
    [projection.groups],
  );
  const relationBySceneId = useMemo(
    () => new Map(projection.relations.map(relation => [relation.sceneEdgeId, relation])),
    [projection.relations],
  );
  const selectedObject = projection.objects.find(object => object.objectId === selectedObjectId)
    ?? projection.objects[0]
    ?? null;

  useEffect(() => {
    if (initialObjectId && projection.objects.some(object => object.objectId === initialObjectId)) {
      setSelectedObjectId(initialObjectId);
      setSelectedRelation(null);
    }
  }, [initialObjectId, projection.objects]);

  const selectObject = (objectId: string) => {
    setSelectedRelation(null);
    setSelectedObjectId(objectId);
  };
  const activateNode = (node: FactorySceneNode) => {
    const object = objectBySceneId.get(node.id);
    if (object) selectObject(object.objectId);
  };
  const activateEdge = (edge: FactorySceneEdge) => {
    const relation = relationBySceneId.get(edge.id);
    if (relation) setSelectedRelation(relation);
  };
  const relationObject = (objectId: string) => projection.objects.find(object => object.objectId === objectId)?.item;

  const renderNode = (node: FactorySceneNode) => {
    const group = groupBySceneId.get(node.id);
    if (group) {
      return (
        <section className="knowledge-canvas-domain" aria-hidden="true">
          <span>{group.code}</span>
          <strong>{group.title}</strong>
          <small>{group.objectIds.length} OBJECTS</small>
        </section>
      );
    }
    const object = objectBySceneId.get(node.id);
    if (!object) return null;
    const outgoing = object.item.relations.length;
    const incoming = projection.relations.filter(relation => relation.targetId === object.objectId).length;
    return (
      <button
        type="button"
        className="knowledge-canvas-card"
        data-form={object.item.knowledgeForm}
        onClick={() => selectObject(object.objectId)}
      >
        <span className="knowledge-canvas-card__meta"><b>{object.item.knowledgeForm}</b><i>R{object.item.revision}</i></span>
        <strong>{object.item.title}</strong>
        <small>{object.item.summary}</small>
        <span className="knowledge-canvas-card__relations"><GitFork aria-hidden="true" />{outgoing} OUT / {incoming} IN</span>
      </button>
    );
  };

  return (
    <div className="knowledge-canvas">
      <header className="knowledge-canvas__masthead">
        <div>
          <span><Network aria-hidden="true" />SPATIAL READ MODEL / 03</span>
          <h1>Knowledge Canvas</h1>
          <p>按领域组织知识对象；连接线只呈现对象已声明的语义关系。</p>
        </div>
        <dl>
          <div><dt>Objects</dt><dd>{projection.objects.length}</dd></div>
          <div><dt>Domains</dt><dd>{projection.groups.length}</dd></div>
          <div><dt>Relations</dt><dd>{projection.relations.length}</dd></div>
        </dl>
      </header>

      {projection.relations.length === 0 ? (
        <div className="knowledge-canvas__zero" role="status">
          <CircleDotDashed aria-hidden="true" />
          <p><strong>尚无语义关系</strong><span>当前对象未声明 relations；系统没有自动推断或伪造连接线。</span></p>
        </div>
      ) : null}

      {isMobile ? (
        <div className="knowledge-canvas-mobile" aria-label="移动端知识领域轨">
          {projection.groups.map(group => (
            <section key={group.domainId}>
              <header><span>{group.code}</span><h2>{group.title}</h2><b>{group.objectIds.length}</b></header>
              <div>
                {group.objectIds.map(objectId => {
                  const object = projection.objects.find(candidate => candidate.objectId === objectId)!;
                  return (
                    <button key={objectId} type="button" onClick={() => selectObject(objectId)}>
                      <span>{object.item.knowledgeForm} · R{object.item.revision}</span>
                      <strong>{object.item.title}</strong>
                      <small>{object.item.relations.length} outgoing relations</small>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="knowledge-canvas__layout">
          <div
            className="knowledge-canvas__stage"
            data-model-objects={projection.objects.length}
            data-model-relations={projection.relations.length}
            data-routed-relations={projection.layout.edges.length}
          >
            <FactorySceneCanvas
              layout={projection.layout}
              viewKey={`${library.source.packHash}:${library.items.map(item => `${item.objectId}@${item.revision}`).join('|')}`}
              selectedSceneNodeId={selectedObject?.sceneNodeId ?? null}
              renderNode={renderNode}
              getNodeLabel={node => objectBySceneId.get(node.id)?.item.title ?? groupBySceneId.get(node.id)?.title ?? node.id}
              onNodeActivate={activateNode}
              onEdgeActivate={activateEdge}
              ariaLabel="知识对象关系画布"
              relationAriaLabel="知识语义关系"
              fitControlLabel="适应知识画布"
            />
          </div>

          <aside className="knowledge-canvas-inspector" aria-label="知识画布详情">
            {selectedRelation ? (
              <>
                <header><span>RELATION INSPECTOR</span><h2>{selectedRelation.relationType}</h2></header>
                <div className="knowledge-canvas-inspector__route">
                  <p><small>FROM</small><strong>{relationObject(selectedRelation.sourceId)?.title ?? selectedRelation.sourceId}</strong></p>
                  <ArrowRight aria-hidden="true" />
                  <p><small>TO</small><strong>{relationObject(selectedRelation.targetId)?.title ?? selectedRelation.targetId}</strong></p>
                </div>
                <p>{selectedRelation.rationale || '该关系没有额外 rationale。'}</p>
                <dl><div><dt>Semantic type</dt><dd>{selectedRelation.relationType}</dd></div><div><dt>Line style</dt><dd>{selectedRelation.presentationKind}</dd></div></dl>
              </>
            ) : selectedObject ? (
              <>
                <header><span>OBJECT INSPECTOR / R{selectedObject.item.revision}</span><h2>{selectedObject.item.title}</h2></header>
                <p>{selectedObject.item.summary}</p>
                <div className="knowledge-canvas-inspector__identity"><Fingerprint aria-hidden="true" /><code>{selectedObject.objectId}</code></div>
                <dl>
                  <div><dt>Domain</dt><dd>{selectedObject.domainId}</dd></div>
                  <div><dt>Form</dt><dd>{selectedObject.item.knowledgeForm}</dd></div>
                  <div><dt>Evidence</dt><dd>{selectedObject.item.evidenceGrade}</dd></div>
                  <div><dt>Revision</dt><dd>{selectedObject.item.revision}</dd></div>
                </dl>
                <button type="button" onClick={() => onSelectKnowledge(selectedObject.objectId)}>在 Library 查看<ExternalLink aria-hidden="true" /></button>
              </>
            ) : null}
            <footer><ShieldCheck aria-hidden="true" /><span>Canvas 是投影，不修改 Knowledge Object 语义。</span></footer>
          </aside>
        </div>
      )}

      <footer className="knowledge-canvas__legend">
        <span><Layers3 aria-hidden="true" />领域分组仅用于展示</span>
        <span><Route aria-hidden="true" />关系来自 Knowledge Object</span>
      </footer>
    </div>
  );
}
