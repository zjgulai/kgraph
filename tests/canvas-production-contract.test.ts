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
  assert.match(viewer, /if \(!canPersistServerView\)/);
  const readonlyGate = viewer.indexOf('if (!canPersistServerView)');
  const serverWrite = viewer.indexOf("fetch('/api/canvas-state'");
  assert.ok(readonlyGate >= 0 && readonlyGate < serverWrite);
});

test('readonly and unauthenticated owner node details disable mutation before any API callback', () => {
  assert.match(viewer, /readOnly=\{!editorWritable\}/);
  assert.match(viewer, /const editorWritable = !isMobileViewport && \(/);
  assert.match(viewer, /writePolicy\.mode === 'dev' \|\| \(writePolicy\.mode === 'owner' && ownerAuthenticated\)/);

  const markDeleted = viewer.indexOf('onMarkDeleted={async');
  const markDeletedGuard = viewer.indexOf('if (!editorWritable', markDeleted);
  const markDeletedMutation = viewer.indexOf("type: 'softDeleteNode'", markDeleted);
  assert.ok(markDeleted >= 0 && markDeletedGuard > markDeleted && markDeletedGuard < markDeletedMutation);

  const save = viewer.indexOf('onSave={async');
  const saveGuard = viewer.indexOf('if (!editorWritable', save);
  const saveMutation = viewer.indexOf("type: 'updateNode'", save);
  assert.ok(save >= 0 && saveGuard > save && saveGuard < saveMutation);

  assert.match(detailSheet, /readOnly\?: boolean/);
  assert.match(detailSheet, /if \(readOnly\) return/);
  assert.match(detailSheet, /disabled=\{busy \|\| readOnly\}/);
  assert.ok((detailSheet.match(/readOnly=\{readOnly\}/g) || []).length >= 2);
});

test('canvas restores positions only through the version and graph fingerprint gate', () => {
  assert.match(viewer, /const stored: unknown = await response\.json\(\)/);
  assert.match(viewer, /state = restoreCanvasState\(stored, identity\)/);
  assert.match(viewer, /getCanvasStateLocalStorageKey\(document\.id\)/);
  assert.match(viewer, /getPreviousCanvasStateLocalStorageKey\(document\.id\)/);
  assert.match(viewer, /removeItem\(getLegacyCanvasStateLocalStorageKey\(document\.id\)\)/);
  assert.doesNotMatch(viewer, /localStorage\.getItem\(`doccas-/);

  const restoreStart = viewer.indexOf('const restore = async () =>');
  const localRead = viewer.indexOf('localStorage.getItem(getCanvasStateLocalStorageKey(document.id))', restoreStart);
  const serverRead = viewer.indexOf('fetch(`/api/canvas-state?documentId=${document.id}`)', restoreStart);
  assert.ok(localRead > restoreStart && serverRead > localRead, 'browser-local v3 state must override server state');
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

test('exports the current viewport PNG and complete scene SVG without edit controls', () => {
  assert.doesNotMatch(viewer, /import\s*\{[^}]*getNodesBounds[^}]*\}\s*from '@xyflow\/react'/s);
  assert.doesNotMatch(viewer, /useReactFlow|<ReactFlow/u);
  assert.match(viewer, /querySelector<HTMLElement>\('\.desktop-architecture-canvas \.factory-scene-canvas'\)/);
  assert.match(viewer, /link\.download = `\$\{document\.id\}-viewport\.png`/);
  assert.match(viewer, /link\.download = `\$\{document\.id\}-\$\{layout\.view\}\.svg`/);
  assert.match(viewer, /if \(exportInFlightRef\.current\) return/);
  assert.match(viewer, /selectPngPixelRatio\(imageWidth, imageHeight\)/);
  assert.match(viewer, /createTreeWalker\(root, window\.NodeFilter\.SHOW_TEXT\)/);
  assert.match(viewer, /hasPresentationTextLeak/);
  assert.match(viewer, /pixelRatio,/);
  assert.match(viewer, /classList\.contains\('factory-scene-controls'\)/);
  assert.match(viewer, /classList\.contains\('factory-scene-minimap'\)/);
  assert.match(viewer, /sceneCanvasRef\.current\?\.getSceneElement\(\)/);
  assert.match(viewer, /await toSvg\(sceneElement/);
  assert.doesNotMatch(viewer, /pixelRatio:\s*PNG_PIXEL_RATIO/);

  const selectionIndex = viewer.indexOf('selectPngPixelRatio(imageWidth, imageHeight)');
  const nullGuardIndex = viewer.indexOf('if (pixelRatio === null)', selectionIndex);
  const renderIndex = viewer.indexOf('await toPng(viewportElement', selectionIndex);
  assert.ok(selectionIndex >= 0);
  assert.ok(nullGuardIndex > selectionIndex);
  assert.ok(renderIndex > nullGuardIndex);
});

test('Playwright serves the actual standalone output with copied static and public assets', () => {
  const config = readFileSync(resolve(root, 'playwright.config.ts'), 'utf8');
  const prepare = readFileSync(resolve(root, 'scripts/prepare-standalone-e2e.ts'), 'utf8');
  assert.match(config, /command:\s*'npm run test:e2e:serve'/);
  assert.doesNotMatch(config, /next start/);
  assert.match(prepare, /\.next\/standalone/);
  assert.match(prepare, /\.next\/static/);
  assert.match(prepare, /public/);
});
