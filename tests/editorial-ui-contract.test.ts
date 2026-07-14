import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const viewer = read('components/canvas/CanvasViewer.tsx');
const architectureNodes = read('components/canvas/ArchitectureNodes.tsx');
const reader = read('components/canvas/ArchitectureRegionReader.tsx');
const card = read('components/canvas/CardNode.tsx');
const mobile = read('components/canvas/MobileArchitectureView.tsx');
const search = read('components/canvas/SearchPanel.tsx');
const detail = read('components/canvas/NodeDetailSheet.tsx');
const css = read('app/globals.css');
const documentsRoute = read('app/api/documents/route.ts');
const errorBoundary = read('components/canvas/CanvasErrorBoundary.tsx');
const saveIndicator = read('components/canvas/SaveIndicator.tsx');

test('editorial architecture keeps overview context beside a productized room reader', () => {
  assert.match(viewer, /ArchitectureRegionReader/);
  assert.match(viewer, /regionPresentationById/);
  assert.match(reader, /architecture-region-reader/);
  assert.match(reader, /进入完整房间/);
  assert.match(css, /\.architecture-region-reader\s*\{/);
  assert.match(architectureNodes, /architecture-room__summary/);
  assert.match(architectureNodes, /\{room\.summary\}/);
});

test('node detail defaults to rendered Markdown and exposes raw source only in explicit owner edit mode', () => {
  assert.match(detail, /SafeMarkdown/);
  assert.match(detail, /阅读/);
  assert.match(detail, /编辑 Markdown/);
  assert.match(detail, /activeTab === 'edit'/);
  assert.match(detail, /readOnly \? 'read'/);
  assert.match(detail, /来源章节/);
});

test('search, cards, and mobile render presentation copy while preserving source provenance', () => {
  assert.match(viewer, /presentationByNodeId/);
  assert.match(search, /presentations/);
  assert.match(search, /来源：/);
  assert.match(card, /sourceLabel/);
  assert.doesNotMatch(card, /sourceTitle/);
  assert.match(mobile, /presentationByNodeId/);
});

test('DocumentPresentation is the final display owner for every architecture region surface', () => {
  assert.match(viewer, /type RegionPresentation/);
  assert.match(viewer, /presentation\?\.displayTitle/);
  assert.match(viewer, /presentation\?\.displaySummary/);
  assert.match(viewer, /regionPresentationById\.get\(region\.id\)/);
});

test('error surfaces clean external messages before normal product display', () => {
  assert.match(errorBoundary, /cleanPresentationText\(this\.state\.error\)/);
  assert.match(saveIndicator, /cleanPresentationText\(errorMessage\)/);
});

test('normal product components do not add Unicode emoji or decorative text glyphs', () => {
  const productSources = [viewer, architectureNodes, reader, card, mobile, search, detail].join('\n');
  assert.doesNotMatch(
    productSources,
    /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u20E3]/u,
  );
  assert.doesNotMatch(productSources, /[§↑↓→]/u);
});

test('owner save rebuilds the complete parsed graph instead of patching stale derived fields', () => {
  assert.match(documentsRoute, /document:\s*graph/);
  assert.match(viewer, /result\.document/);
  assert.doesNotMatch(viewer, /updateDocNodeAfterSave/);
});

test('tablet controls keep 44px targets without wrapping the fixed header', () => {
  const tabletStart = css.indexOf('@media (min-width: 768px) and (max-width: 1100px)');
  const tabletEnd = css.indexOf('@media (min-width: 768px) and (max-width: 900px)', tabletStart);
  const tablet = css.slice(tabletStart, tabletEnd);
  assert.match(tablet, /\.react-flow__controls-button[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px/u);
  assert.match(tablet, /\.architecture-toolbar button,[\s\S]*?width:\s*44px[\s\S]*?min-height:\s*44px/u);
  assert.match(tablet, /\.architecture-stage-nav button[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px/u);
  assert.match(tablet, /\.architecture-toolbar[\s\S]*?flex-wrap:\s*nowrap/u);
  assert.match(tablet, /\.architecture-stage-nav[\s\S]*?overflow-x:\s*auto/u);
});

test('mobile headings and cards wrap long unbroken labels instead of relying on body clipping', () => {
  assert.match(css, /\.mobile-architecture__hero h1,[\s\S]*?overflow-wrap:\s*anywhere/u);
  assert.match(css, /\.mobile-floor__toggle > span[\s\S]*?min-width:\s*0/u);
  assert.match(css, /\.mobile-floor__rooms button strong,[\s\S]*?overflow-wrap:\s*anywhere/u);
  assert.match(css, /\.mobile-architecture__node-list strong[\s\S]*?overflow-wrap:\s*anywhere/u);
});
