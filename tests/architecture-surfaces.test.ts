import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArchitectureRegionReader } from '../components/canvas/ArchitectureRegionReader';
import { MobileArchitectureView } from '../components/canvas/MobileArchitectureView';
import { FACTORY_EMPLOYEE_ROLES, FACTORY_ENVIRONMENTS } from '../lib/canvas/factory-presentation';
import type { DocNode } from '../lib/parser/types';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const architectureNodes = read('components/canvas/ArchitectureNodes.tsx');
const cardNode = read('components/canvas/CardNode.tsx');
const mobileView = read('components/canvas/MobileArchitectureView.tsx');
const regionReader = read('components/canvas/ArchitectureRegionReader.tsx');
const canvasViewer = read('components/canvas/CanvasViewer.tsx');
const sceneCanvas = read('components/canvas/FactorySceneCanvas.tsx');
const sceneModel = read('lib/canvas/factory-scene.ts');
const layoutHook = read('components/canvas/useFactoryLayout.ts');
const layoutWorker = read('lib/canvas/factory-layout.worker.ts');
const factoryHeader = read('components/canvas/FactoryHeader.tsx');
const canvasToolbar = read('components/canvas/CanvasToolbar.tsx');
const mobileCanvasNavigation = read('components/canvas/MobileCanvasNavigation.tsx');
const presentationSwitch = read('components/canvas/CanvasPresentationSwitch.tsx');
const digitalEmployee = read('components/canvas/DigitalEmployee.tsx');
const ownerInspector = read('components/canvas/FactoryOwnerInspector.tsx');
const nodeDetail = read('components/canvas/NodeDetailSheet.tsx');
const performanceTelemetry = read('lib/client/performance-telemetry.ts');
const globalCss = read('app/globals.css');
const canvasCss = read('app/canvas.css');
const css = `${globalCss}\n${canvasCss}`;

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
  assert.match(architectureNodes, /export function ArchitectureRoomNode/);
  assert.match(architectureNodes, /room\.onSelectRoom\(room\.id\)/);
  assert.doesNotMatch(architectureNodes, /ArchitectureHandles|<Handle/u);
  assert.match(architectureNodes, /aria-label=\{`选择房间 \$\{room\.title\}`\}/);
  assert.match(architectureNodes, /aria-pressed=\{room\.selected\}/);
  assert.match(architectureNodes, /room\.selected \? ' is-selected' : ''/);
  assert.match(architectureNodes, /architecture-room__summary/);
  assert.match(architectureNodes, /\{room\.summary\}/);
  assert.doesNotMatch(architectureNodes, /aria-label=\{`进入 \$\{room\.title\}`\}/);
});

test('desktop canvas renders routed SVG pipelines with explicit relation data', () => {
  assert.match(canvasViewer, /<FactorySceneCanvas/);
  assert.doesNotMatch(canvasViewer, /ReactFlow|@xyflow\/react/u);
  assert.match(sceneCanvas, /factory-scene-edge__line/);
  assert.match(sceneCanvas, /markerEnd=\{`url\(#\$\{markerId\(edge\.kind\)\}\)`\}/);
  assert.match(sceneCanvas, /factory-scene-edge__tracer/);
  assert.match(sceneCanvas, /<animateMotion dur="260ms" repeatCount="1"/);
  assert.match(sceneModel, /waypointPath/);
  assert.match(sceneModel, /routeOrthogonalEdge/);
});

test('desktop defaults to Map and switches presentation without forking the scene engine', () => {
  assert.match(canvasViewer, /useState<CanvasPresentationMode>\('map'\)/);
  assert.match(canvasViewer, /<CanvasToolbar/);
  assert.match(canvasToolbar, /<CanvasPresentationSwitch/);
  assert.equal(canvasViewer.match(/\n\s*<FactorySceneCanvas\n/g)?.length, 1);
  assert.match(sceneCanvas, /data-presentation=\{presentationMode\}/);
  assert.match(presentationSwitch, /aria-label="画布表现"/);
  assert.match(presentationSwitch, /aria-pressed=\{mode === option\.id\}/);
  assert.match(presentationSwitch, /地图/);
  assert.match(presentationSwitch, /工厂/);
  assert.match(factoryHeader, /presentationMode/);
  assert.match(css, /\.factory-scene-canvas\[data-presentation="map"\]/u);
  assert.match(css, /\.factory-scene-canvas\[data-presentation="factory"\]/u);
});

test('pipeline layer remains above structural shells and below interactive cards', () => {
  assert.match(css, /\.factory-scene-canvas__pipelines\s*\{[^}]*z-index:\s*2/u);
  assert.match(css, /\.factory-scene-canvas__nodes\s*\{[^}]*z-index:\s*auto/u);
  assert.match(
    sceneCanvas,
    /node\.kind === 'floor' \|\| node\.kind === 'group' \? 0[\s\S]*?node\.kind === 'room' \|\| node\.kind === 'content' \? 3/u,
  );
});

test('factory layout leaves the main thread through a module worker and retains a fail-fast fallback', () => {
  assert.match(canvasViewer, /useFactoryLayout/);
  assert.match(layoutHook, /new Worker\(/);
  assert.match(layoutHook, /factory-layout\.worker\.ts/);
  assert.match(layoutWorker, /computeArchitectureLayout/);
  assert.match(layoutHook, /Factory layout failed in worker and fallback/);
});

test('canvas stylesheet consumes semantic factory tokens without naked hexadecimal colors', () => {
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/iu);
  assert.match(css, /var\(--factory-pipeline-main\)/);
  assert.match(css, /var\(--factory-canvas\)/);
});

test('D8 gives Canvas an owned stylesheet and defers virtualization commits during camera interaction', () => {
  assert.match(globalCss, /@import "\.\/canvas\.css"/u);
  assert.match(canvasCss, /Architecture house canvas/u);
  assert.doesNotMatch(canvasCss, /#[0-9a-f]{3,8}\b/iu);
  assert.doesNotMatch(canvasCss, /transition:\s*all\b/iu);
  assert.match(sceneCanvas, /const VIEWPORT_COMMIT_DELAY_MS = 80/u);
  assert.match(sceneCanvas, /commitMode: 'immediate' \| 'deferred'/u);
  assert.match(sceneCanvas, /false, 'deferred'/u);
  assert.match(sceneCanvas, /sceneRef\.current\.style\.transform/u);
  assert.match(sceneCanvas, /addEventListener\('wheel', handleWheel, \{ passive: false \}\)/u);
  assert.doesNotMatch(sceneCanvas, /onWheel=\{handleWheel\}/u);
  for (const metric of ['canvas-pan', 'canvas-zoom', 'canvas-drag', 'canvas-reroute']) {
    assert.match(sceneCanvas, new RegExp(`recordClientPerformance\\('${metric}'`, 'u'));
  }
  assert.match(performanceTelemetry, /'fcp'/u);
  assert.match(performanceTelemetry, /'inp'/u);
  assert.match(performanceTelemetry, /durationThreshold: 16/u);
});

test('Owner portrait flow previews the 4:5 crop before confirmed server normalization', () => {
  assert.match(ownerInspector, /URL\.createObjectURL\(file\)/);
  assert.match(ownerInspector, /4:5 裁剪预览/);
  assert.match(ownerInspector, /attention 对焦生成最终 800×1000 WebP/);
  assert.match(ownerInspector, /确认上传/);
  assert.match(ownerInspector, /URL\.revokeObjectURL/);
  assert.match(css, /factory-owner-assets__preview/);
  assert.match(css, /aspect-ratio: 4 \/ 5/);
  assert.match(digitalEmployee, /loading="lazy"/u);
  assert.match(ownerInspector, /width=\{80\} height=\{100\} loading="lazy" decoding="async"/u);
});

test('desktop factory owns a readable lintel outside the scene zoom layer', () => {
  assert.match(canvasViewer, /<FactoryHeader/);
  assert.ok(
    canvasViewer.indexOf('<FactoryHeader') < canvasViewer.indexOf('<FactorySceneCanvas\n'),
    'factory lintel must precede the zoom layer',
  );
  assert.match(factoryHeader, /semanticTitleLines/);
  assert.match(factoryHeader, /<span>\{primaryTitle\}<\/span>/);
  assert.match(factoryHeader, /LIVING PRODUCT FACTORY/);
  assert.match(css, /\.factory-header__title h1[\s\S]*?font-size:\s*clamp\(1\.45rem,[^;]+1\.9rem\)/u);
});

test('overview rooms render deterministic digital employees over semantic room environments', () => {
  assert.match(canvasViewer, /buildFactoryPresentationMap/);
  assert.match(architectureNodes, /DigitalEmployee/);
  assert.match(architectureNodes, /data-environment=\{room\.factory\.environment\.id\}/);
  assert.match(digitalEmployee, /data-portrait-key=\{employee\?\.portraitKey/);
  assert.match(digitalEmployee, /employee\?\.roleTitle/);
  assert.match(digitalEmployee, /employee\?\.responsibility/);
  assert.match(css, /\.architecture-room\[data-environment="security-control"\]/u);
  assert.match(css, /\.architecture-room__environment/u);
});

test('roof is a restrained 72px industrial cornice and room text remains front-facing in 2.5D', () => {
  assert.match(architectureNodes, /d\.kind === 'roof'/);
  assert.match(architectureNodes, /factory-roof__cornice/);
  assert.match(architectureNodes, /factory-roof__profile/);
  assert.match(architectureNodes, /factory-roof__depth/);
  assert.match(css, /\.factory-roof__cornice/u);
  assert.match(css, /\.factory-roof__profile i::before[\s\S]*?clip-path:\s*polygon/u);
  assert.match(css, /\.factory-roof__profile i::after[\s\S]*?clip-path:\s*polygon/u);
  assert.match(read('lib/canvas/layout-engine.ts'), /const ROOF_HEIGHT = 72/);
  assert.match(css, /\.architecture-floor::before/u);
  assert.match(css, /\.architecture-room:hover[\s\S]*?translateY\(-2px\)/u);
  assert.doesNotMatch(css, /\.architecture-room(?::hover)?[^}]*rotate[XYZ]?\(/u);
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
    onOpenNode: () => {},
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
  assert.match(markup, /打开节点 第四节点/);
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

test('mobile overview preserves module relations in a vertical process rail', () => {
  assert.match(mobileView, /mobile-process-rail/);
  assert.match(mobileView, /relations\.filter\(relation => relation\.source === room\.id\)/);
  assert.match(mobileView, /data-kind=\{relation\.kind\}/);
  assert.match(mobileView, /room\.selected \? ' is-selected' : ''/);
  assert.match(mobileView, /aria-pressed=\{room\.selected\}/);
  assert.doesNotMatch(mobileView, /setOpenFloor|mobile-floor__toggle/u);
});

test('mobile overview splits long product titles into at most two semantic lines', () => {
  const markup = renderToStaticMarkup(React.createElement(MobileArchitectureView, {
    documentTitle: 'AI产品全链路开发骨干路线图 — Vibe Track Edition',
    version: 'v1',
    floors: [],
    presentationByNodeId: {},
    onOpenRoom: () => {},
    onBack: () => {},
    onOpenNode: () => {},
  }));

  assert.match(markup, /<h1><span>AI产品全链路开发骨干路线图<\/span><span>Vibe Track Edition<\/span><\/h1>/u);
  assert.match(css, /\.mobile-architecture__hero h1,[\s\S]*?-webkit-line-clamp:\s*2/u);
});

test('mobile rooms expose the same digital employee, status, and work counts as desktop', () => {
  const employee = FACTORY_EMPLOYEE_ROLES[0];
  const factory = {
    regionId: 'room-1',
    roomCode: 'STAGE 01',
    employee,
    environment: FACTORY_ENVIRONMENTS[employee.environmentKey],
    status: employee.defaultStatus,
    statusLabel: '待验证',
    accentTone: employee.accentTone,
  } as const;
  const markup = renderToStaticMarkup(React.createElement(MobileArchitectureView, {
    documentTitle: '产品工厂',
    version: 'v1',
    floors: [{
      id: 'floor-1',
      label: 'FLOOR 01',
      title: '生命周期层',
      rooms: [{
        id: 'room-1',
        eyebrow: 'STAGE 01',
        title: '机会与需求',
        summary: '识别真实问题',
        selected: true,
        factory,
        counts: { vibe: 2, shared: 3, pro: 1, resources: 4 },
      }],
    }],
    presentationByNodeId: {},
    onOpenRoom: () => {},
    onBack: () => {},
    onOpenNode: () => {},
  }));

  assert.match(markup, /林序/);
  assert.match(markup, /产品导航顾问/);
  assert.match(markup, /待验证/);
  assert.match(markup, /6 个内容节点/);
  assert.match(markup, /4 个资源/);
  assert.match(mobileView, /<DigitalEmployee/);
});

test('mobile factory uses bounded headings, viewport-safe width, and 44px controls', () => {
  const mobileMedia = css.slice(css.indexOf('@media (max-width: 767px)', css.indexOf('.architecture-canvas-shell.is-exporting-panorama')));
  assert.match(mobileMedia, /\.mobile-architecture\s*\{[\s\S]*?max-width:\s*100%[\s\S]*?overflow-x:\s*clip/u);
  assert.match(mobileMedia, /\.mobile-architecture__hero h1,[\s\S]*?font-size:\s*clamp\(1\.35rem,[^;]+1\.75rem\)/u);
  assert.match(mobileMedia, /\.mobile-canvas-navigation a,[\s\S]*?min-width:\s*44px[\s\S]*?min-height:\s*48px/u);
  assert.match(mobileMedia, /\.mobile-process-room > button[\s\S]*?min-height:\s*(?:[4-9][4-9]|[1-9]\d{2,})px/u);
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

test('D7 uses one 1280/768/mobile responsive contract across layout and reader surfaces', () => {
  assert.match(canvasViewer, /width >= 768 && width <= 1279 \? 'tablet' : 'desktop'/u);
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1279px\)/u);
  assert.match(canvasViewer, /architecture-region-reader__backdrop/u);
  assert.match(css, /\.architecture-region-reader__backdrop[\s\S]*?display:\s*block/u);
  assert.match(css, /\.architecture-region-reader\s*\{[\s\S]*?grid-column:\s*1[\s\S]*?top:\s*12px[\s\S]*?right:\s*12px[\s\S]*?bottom:\s*12px[\s\S]*?width:\s*min\(420px,/u);
});

test('D7 mobile canvas is bottom navigated, safe-area aware, and readonly detail is touch contained', () => {
  const mobileMedia = css.slice(css.indexOf('@media (max-width: 767px)', css.indexOf('.architecture-canvas-shell.is-exporting-panorama')));
  assert.match(mobileCanvasNavigation, /mobile-canvas-navigation/u);
  assert.match(mobileMedia, /\.mobile-canvas-navigation\s*\{[\s\S]*?bottom:\s*0/u);
  assert.match(mobileMedia, /env\(safe-area-inset-bottom\)/u);
  assert.match(mobileMedia, /\.mobile-architecture\s*\{[\s\S]*?overscroll-behavior:\s*contain/u);
  assert.match(mobileMedia, /\.mobile-process-room > button[\s\S]*?touch-action:\s*manipulation/u);
  assert.match(nodeDetail, /node-detail-sheet/u);
  assert.match(css, /\.node-detail-sheet[\s\S]*?overscroll-behavior:\s*contain/u);
  assert.match(css, /\.node-detail-sheet__body[\s\S]*?env\(safe-area-inset-bottom\)/u);
});

test('normal surface source adds no emoji, section sign, or decorative arrow text', () => {
  const sources = [architectureNodes, cardNode, mobileView, regionReader].join('\n');
  assert.doesNotMatch(
    sources,
    /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u20E3]/u,
  );
  assert.doesNotMatch(sources, /[§↑↓→]/u);
});
