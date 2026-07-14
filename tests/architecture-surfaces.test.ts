import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArchitectureRegionReader } from '../components/canvas/ArchitectureRegionReader';
import { MobileArchitectureView } from '../components/canvas/MobileArchitectureView';
import type { DocNode } from '../lib/parser/types';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const architectureNodes = read('components/canvas/ArchitectureNodes.tsx');
const cardNode = read('components/canvas/CardNode.tsx');
const mobileView = read('components/canvas/MobileArchitectureView.tsx');
const regionReader = read('components/canvas/ArchitectureRegionReader.tsx');
const canvasViewer = read('components/canvas/CanvasViewer.tsx');

function fixtureNode(id: string, title: string, summary: string): DocNode {
  return {
    id,
    type: 'section',
    title,
    summary,
    content: '',
    level: 2,
    position: { x: 0, y: 0 },
    contentBlocks: [],
    metadata: {},
    children: [],
  };
}

test('overview room surfaces select a room and show one bounded summary line', () => {
  assert.match(architectureNodes, /onSelectRoom: \(regionId: string\) => void/);
  assert.match(architectureNodes, /selected: boolean/);
  assert.match(architectureNodes, /d\.onSelectRoom\(room\.id\)/);
  assert.match(architectureNodes, /aria-label=\{`选择房间 \$\{room\.title\}`\}/);
  assert.match(architectureNodes, /aria-pressed=\{room\.selected\}/);
  assert.match(architectureNodes, /room\.selected \? ' is-selected' : ''/);
  assert.match(architectureNodes, /architecture-room__summary/);
  assert.match(architectureNodes, /\{room\.summary\}/);
  assert.doesNotMatch(architectureNodes, /aria-label=\{`进入 \$\{room\.title\}`\}/);
});

test('content cards accept presentation copy and use a textual Stage label', () => {
  assert.match(cardNode, /export interface CardNodeData/);
  assert.match(cardNode, /displayTitle: string/);
  assert.match(cardNode, /displaySummary: string/);
  assert.match(cardNode, /sourceLabel: string/);
  assert.match(cardNode, /\{d\.displayTitle\}/);
  assert.match(cardNode, /\{d\.displaySummary\}/);
  assert.doesNotMatch(cardNode, /来源：\{d\.sourceLabel\}/);
  assert.match(cardNode, /Stage \{d\.stageNumber\}/);
  assert.doesNotMatch(cardNode, /§/u);
});

test('mobile focus renders the presentation map instead of raw graph copy', () => {
  assert.match(mobileView, /presentationByNodeId/);
  assert.doesNotMatch(mobileView, /\{node\.title\}/);
  assert.doesNotMatch(mobileView, /\{node\.summary\}/);

  const rawTitle = 'RAW TITLE SHOULD NOT RENDER';
  const rawSummary = 'RAW SUMMARY SHOULD NOT RENDER';
  const node = fixtureNode('node-1', rawTitle, rawSummary);
  const markup = renderToStaticMarkup(React.createElement(MobileArchitectureView, {
    documentTitle: '产品工厂',
    version: 'v1',
    floors: [],
    focused: {
      room: {
        id: 'room-1',
        eyebrow: 'STAGE 01',
        title: '机会与需求',
        summary: '识别真实问题',
        selected: true,
        counts: { vibe: 0, shared: 1, pro: 0, resources: 0 },
      },
      nodesByTrack: { vibe: [], shared: [node], pro: [] },
      resourceCount: 0,
    },
    presentationByNodeId: {
      'node-1': {
        displayTitle: '问题验证',
        displaySummary: '确认用户、场景与约束',
        sourceLabel: '需求研究',
      },
    },
    onOpenRoom: () => {},
    onBack: () => {},
    onOpenNode: () => {},
  }));

  assert.match(markup, /问题验证/);
  assert.match(markup, /确认用户、场景与约束/);
  assert.doesNotMatch(markup, /来源：需求研究/);
  assert.doesNotMatch(markup, new RegExp(rawTitle));
  assert.doesNotMatch(markup, new RegExp(rawSummary));
});

test('region reader bounds provenance and prioritizes a search hit beyond the default preview set', () => {
  const markup = renderToStaticMarkup(React.createElement(ArchitectureRegionReader, {
    region: {
      id: 'room-1',
      eyebrow: 'STAGE 01',
      title: '机会与需求',
      summary: '识别值得解决的问题与真实约束',
      sourceLabels: ['需求研究', '问题访谈', '证据整理', '不应出现的第四项'],
      previewNodeIds: ['node-1', 'node-2', 'node-3', 'node-4'],
    },
    presentations: {
      'node-1': { displayTitle: '用户问题', displaySummary: '明确核心痛点', sourceLabel: '需求研究' },
      'node-2': { displayTitle: '使用场景', displaySummary: '定位高频任务', sourceLabel: '问题访谈' },
      'node-3': { displayTitle: '约束边界', displaySummary: '记录不能牺牲的条件', sourceLabel: '证据整理' },
      'node-4': { displayTitle: '第四节点', displaySummary: '不应出现的第四摘要', sourceLabel: '其他来源' },
    },
    highlightedNodeId: 'node-4',
    onEnterRoom: () => {},
    onClose: () => {},
  }));

  assert.match(markup, /机会与需求/);
  assert.match(markup, /识别值得解决的问题与真实约束/);
  assert.match(markup, /来源章节/);
  assert.match(markup, /需求研究/);
  assert.match(markup, /问题访谈/);
  assert.match(markup, /证据整理/);
  assert.doesNotMatch(markup, /不应出现的第四项/);
  assert.match(markup, /第四节点/);
  assert.match(markup, /不应出现的第四摘要/);
  assert.match(markup, /is-highlighted/);
  assert.match(markup, /aria-current="true"/);
  assert.match(markup, /进入完整房间/);
  assert.match(markup, /aria-label="关闭房间速读"/);
  assert.equal((markup.match(/需求研究/g) ?? []).length, 1);
});

test('search highlight continues from the reader into focused desktop and mobile nodes', () => {
  assert.match(canvasViewer, /selected:\s*layoutNode\.kind === 'content'\s*&& layoutNode\.nodeId === highlightedSearchNodeId/);
  assert.match(canvasViewer, /highlightedNodeId=\{highlightedSearchNodeId \?\? undefined\}/);
  assert.match(mobileView, /highlightedNodeId\?: string/);
  assert.match(mobileView, /aria-current=\{highlighted \? true : undefined\}/);
  assert.match(mobileView, /className=\{highlighted \? 'is-highlighted' : undefined\}/);
});

test('mobile overview exposes and automatically expands the selected room', () => {
  assert.match(mobileView, /room\.selected \? 'is-selected' : undefined/);
  assert.match(mobileView, /aria-pressed=\{room\.selected\}/);
  assert.match(mobileView, /selectedFloor/);
  assert.match(mobileView, /setOpenFloor\(selectedFloor\.id\)/);
  assert.match(mobileView, /floors\[floors\.length - 1\]/);
  assert.match(mobileView, /onClick=\{\(\) => setOpenFloor\(floor\.id\)\}/);
  assert.doesNotMatch(mobileView, /setOpenFloor\(open \? '' : floor\.id\)/);
});

test('mobile search selects the hit track once and then allows manual track changes', () => {
  assert.match(mobileView, /if \(highlightedTrack\) setActiveTrack\(highlightedTrack\)/);
  assert.match(mobileView, /const selectedTrack = activeTrack/);
  assert.doesNotMatch(mobileView, /const selectedTrack = highlightedTrack \?\?/);
  assert.match(mobileView, /role="tablist"/);
  assert.match(mobileView, /role="tab"/);
  assert.match(mobileView, /aria-selected=\{selectedTrack === track\}/);
});

test('tablet reader can close without clearing the selected room highlight', () => {
  assert.match(regionReader, /onClose: \(\) => void/);
  assert.match(regionReader, /aria-label="关闭房间速读"/);
  assert.match(canvasViewer, /dismissedReaderRegionId/);
  assert.match(canvasViewer, /setDismissedReaderRegionId\(selectedRegion\.id\)/);
  assert.match(canvasViewer, /onClose=/);
});

test('normal surface source adds no emoji, section sign, or decorative arrow text', () => {
  const sources = [architectureNodes, cardNode, mobileView, regionReader].join('\n');
  assert.doesNotMatch(
    sources,
    /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u20E3]/u,
  );
  assert.doesNotMatch(sources, /[§↑↓→]/u);
});
