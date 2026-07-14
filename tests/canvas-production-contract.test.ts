import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const viewer = readFileSync(resolve(root, 'components/canvas/CanvasViewer.tsx'), 'utf8');
const detailSheet = readFileSync(resolve(root, 'components/canvas/NodeDetailSheet.tsx'), 'utf8');
const mobileView = readFileSync(resolve(root, 'components/canvas/MobileArchitectureView.tsx'), 'utf8');
const page = readFileSync(resolve(root, 'app/canvas/[documentId]/page.tsx'), 'utf8');
const css = readFileSync(resolve(root, 'app/globals.css'), 'utf8');

test('canvas receives the server write policy and readonly saves stay browser-local', () => {
  assert.match(page, /writePolicy=\{getWritePolicy\(\)\}/);
  assert.match(viewer, /if \(!writePolicy\.writable\)/);
  const readonlyGate = viewer.indexOf('if (!writePolicy.writable)');
  const serverWrite = viewer.indexOf("fetch('/api/canvas-state'");
  assert.ok(readonlyGate >= 0 && readonlyGate < serverWrite);
});

test('readonly node details disable document mutation before any API callback', () => {
  assert.match(viewer, /readOnly=\{!writePolicy\.writable\}/);

  const markDeleted = viewer.indexOf('onMarkDeleted={async');
  const markDeletedGuard = viewer.indexOf('if (!writePolicy.writable)', markDeleted);
  const markDeletedFetch = viewer.indexOf("fetch('/api/documents'", markDeleted);
  assert.ok(markDeleted >= 0 && markDeletedGuard > markDeleted && markDeletedGuard < markDeletedFetch);

  const save = viewer.indexOf('onSave={async');
  const saveGuard = viewer.indexOf('if (!writePolicy.writable)', save);
  const saveFetch = viewer.indexOf("fetch('/api/documents'", save);
  assert.ok(save >= 0 && saveGuard > save && saveGuard < saveFetch);

  assert.match(detailSheet, /readOnly\?: boolean/);
  assert.match(detailSheet, /if \(readOnly\) return/);
  assert.match(detailSheet, /disabled=\{busy \|\| readOnly\}/);
  assert.ok((detailSheet.match(/readOnly=\{readOnly\}/g) || []).length >= 2);
});

test('canvas restores positions only through the version and graph fingerprint gate', () => {
  assert.match(viewer, /restoreCanvasState\(await response\.json\(\), identity\)/);
  assert.match(viewer, /getCanvasStateLocalStorageKey\(document\.id\)/);
  assert.match(viewer, /removeItem\(getLegacyCanvasStateLocalStorageKey\(document\.id\)\)/);
  assert.doesNotMatch(viewer, /localStorage\.getItem\(`doccas-/);

  const restoreStart = viewer.indexOf('const restore = async () =>');
  const localRead = viewer.indexOf('localStorage.getItem(getCanvasStateLocalStorageKey(document.id))', restoreStart);
  const serverRead = viewer.indexOf('fetch(`/api/canvas-state?documentId=${document.id}`)', restoreStart);
  assert.ok(localRead > restoreStart && serverRead > localRead, 'browser-local v2 state must override server state');
  assert.match(viewer, /localStorage\.setItem\(getCanvasStateLocalStorageKey\(document\.id\), JSON\.stringify\(reset\)\)/);
  assert.match(viewer, /restoreCanvasState\(restoredState, identity\)/);
  assert.match(viewer, /generation !== restoreGenerationRef\.current/);
  assert.match(viewer, /const freshLocal = freshRaw \? restoreCanvasState\(JSON\.parse\(freshRaw\), identity\) : null/);
  assert.match(viewer, /const saveCanvasState = useCallback\(async \(\) => \{\s+restoreGenerationRef\.current \+= 1/);
  assert.match(viewer, /setRestoredState\(state\)/);
});

test('mobile focus uses the view-model resource aggregation instead of reclassifying nodes', () => {
  assert.match(viewer, /focusedRegion\.trackSummaries\.find\(summary => summary\.track === track\)\?\.nodeIds/);
  assert.match(viewer, /resourceCount: focusedRegion\.resources\.count/);
  assert.match(mobileView, /focused\?\.nodesByTrack/);
  assert.match(mobileView, /track === 'shared' \|\| grouped\[track\]\.length > 0/);
  assert.doesNotMatch(mobileView, /metadata\.isToolReference/);
  assert.doesNotMatch(mobileView, /nodeTrack\(/);
});

test('PNG export always projects the architecture overview at the highest safe pixel ratio', () => {
  assert.doesNotMatch(viewer, /import\s*\{[^}]*getNodesBounds[^}]*\}\s*from '@xyflow\/react'/s);
  assert.match(viewer, /const \{ fitView, getNodesBounds, getViewport, setViewport \} = useReactFlow\(\)/);
  assert.match(viewer, /setCanvasView\(\{ kind: 'overview' \}\)/);
  assert.match(viewer, /link\.download = `\$\{document\.id\}-architecture\.png`/);
  assert.match(viewer, /if \(exportInFlightRef\.current\) return/);
  assert.match(viewer, /if \(!projectionReady\) throw new Error\('建筑全景投影未在时限内稳定。'\)/);
  assert.match(viewer, /isPngPaintSurfaceReady\(/);
  assert.match(viewer, /shellExporting: canvasShellRef\.current\?\.classList\.contains\('is-exporting-panorama'\) === true/);
  assert.match(viewer, /projectionDeadline = window\.performance\.now\(\) \+ 3_000/);
  assert.match(viewer, /restoreGenerationRef\.current \+= 1;\s*setExportStatus\('正在导出暖白全景 PNG\.\.\.'\)/);
  assert.match(viewer, /domIds\.size === expectedLayout\.nodes\.length/);
  assert.match(viewer, /domEdgeIds\.size === expectedLayout\.edges\.length/);
  assert.match(viewer, /if \(projectionMatches\(\)\) \{\s*await waitForPaintTick\(\);\s*if \(projectionMatches\(\)\)/);
  assert.match(viewer, /inert=\{exportingPanorama\}/);
  assert.match(viewer, /className="architecture-export-overlay" role="status"/);
  assert.match(css, /\.architecture-export-overlay\s*\{[^}]*background:\s*#f8fbf0/s);
  assert.match(css, /is-focused-region\.is-exporting-panorama \.desktop-architecture-canvas\s*\{[^}]*display:\s*block/s);
  assert.match(viewer, /selectPngPixelRatio\(imageWidth, imageHeight\)/);
  assert.match(viewer, /createTreeWalker\(root, window\.NodeFilter\.SHOW_TEXT\)/);
  assert.match(viewer, /hasPresentationTextLeak/);
  assert.match(viewer, /pixelRatio,/);
  assert.doesNotMatch(viewer, /pixelRatio:\s*PNG_PIXEL_RATIO/);

  const selectionIndex = viewer.indexOf('selectPngPixelRatio(imageWidth, imageHeight)');
  const nullGuardIndex = viewer.indexOf('if (pixelRatio === null)', selectionIndex);
  const renderIndex = viewer.indexOf('await toPng(viewportElement', selectionIndex);
  assert.ok(selectionIndex >= 0);
  assert.ok(nullGuardIndex > selectionIndex);
  assert.ok(renderIndex > nullGuardIndex);
});
