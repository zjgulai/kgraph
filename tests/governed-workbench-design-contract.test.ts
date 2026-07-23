import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const design = read('DESIGN.md');
const inventory = read('docs/engineering/governed-workbench-ui-inventory.md');
const plan = read('docs/superpowers/plans/2026-07-22-doccanvas-governed-workspace-ui-interaction-redesign-plan.md');
const page = read('app/page.tsx');
const workspace = read('components/workspace/KnowledgeWorkspace.tsx');
const shell = read('components/workbench/WorkbenchShell.tsx');
const palette = read('components/workbench/CommandPalette.tsx');
const dialog = read('components/ui/Dialog.tsx');
const workbenchCss = read('components/workbench/workbench.css');
const routes = read('lib/workbench/routes.ts');

test('governed workbench design contract fixes the approved direction and implementation boundaries', () => {
  for (const heading of [
    'Visual Theme and Atmosphere',
    'Color Roles',
    'Typography Hierarchy',
    'Components and States',
    'Layout and Spacing',
    'Depth and Elevation',
    'Motion and Interaction',
    'Do / Don\'t',
    'Responsive Behavior',
    'Agent Implementation Prompt',
  ]) {
    assert.match(design, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), heading);
  }

  assert.match(design, /DESIGN_VARIANCE` \| 4\/10/u);
  assert.match(design, /MOTION_INTENSITY` \| 3\/10/u);
  assert.match(design, /VISUAL_DENSITY` \| 6\/10/u);
  assert.match(design, /Knowledge \/ Product \/ Operations \/ Sources/u);
  assert.match(design, /production unchanged/u);
  assert.match(design, /canonical promotion/u);
  assert.match(design, /Provider/u);
  assert.match(design, /prefers-reduced-motion/u);
});

test('workbench inventory covers every current workspace view and the governed object chain', () => {
  for (const view of [
    'knowledge',
    'capture',
    'enrichment',
    'review',
    'canvas',
    'workflow',
    'evidence',
    'provider',
    'timeline',
    'solutions',
    'blueprints',
    'artifacts',
    'evolution',
    'documents',
  ]) {
    assert.ok(inventory.includes('| `' + view + '` |'), view);
  }

  for (const object of [
    'Document',
    'Capture',
    'Knowledge Object',
    'Enrichment',
    'Human Gold',
    'Review Candidate',
    'Product Task',
    'Solution',
    'Blueprint',
    'Genome / Artifact',
    'Provider Authorization',
    'Release Evidence',
    'Digital Employee',
  ]) {
    assert.ok(inventory.includes('| ' + object + ' |'), object);
  }

  assert.match(inventory, /local L2 Knowledge workflow and full browser acceptance verified; source-checkpoint preparation only/u);
  assert.match(inventory, /ui098-preflight-reconciliation\.md/u);
  assert.match(inventory, /Evidence Registry v1/u);
  assert.match(inventory, /UI-029/u);
  assert.match(inventory, /production unchanged/u);
  assert.match(plan, /### D0 — 基线与设计契约/u);
});

test('D1: workspace destination, selected object, filters and revision restore from the URL', () => {
  assert.match(routes, /export interface WorkbenchRoute/u);
  assert.match(routes, /objectId: string \| null/u);
  assert.match(routes, /revision: number \| null/u);
  assert.match(routes, /filters: KnowledgeLibraryFilters/u);
  assert.match(page, /initialRoute=\{route\}/u);
});

test('D1: workspace navigation renders links and supports browser back, forward and new tabs', () => {
  assert.match(shell, /<a[\s\S]*?href=\{workbenchHref\(target\)\}/u);
  assert.match(workspace, /window\.history\[mode === 'replace' \? 'replaceState' : 'pushState'\]/u);
  assert.match(workspace, /window\.addEventListener\('popstate', restoreRoute\)/u);
});

test('D1: every workspace count comes from a server projection with no hard-coded business count', () => {
  assert.match(workspace, /useMemo<WorkbenchCountMap>/u);
  assert.match(workspace, /operations\.generatedFrom\.blueprintCount/u);
  assert.match(workspace, /operations\.generatedFrom\.artifactCount/u);
  assert.doesNotMatch(workspace, /<b>0?4<\/b>|<b>0?5<\/b>/u);
});

test('D1: Cmd/Ctrl+K opens a global object and command palette from every workspace', () => {
  assert.match(shell, /window\.addEventListener\('keydown', openPalette\)/u);
  assert.match(shell, /<CommandPalette/u);
  assert.match(palette, /from '@\/components\/ui\/Dialog'/u);
  assert.match(dialog, /role="dialog"/u);
  assert.match(dialog, /aria-modal="true"/u);
});

test('D3: Capture fields expose complete form semantics and protect unsaved drafts', () => {
  const capture = readFileSync(resolve(root, 'components/workspace/CaptureWorkspace.tsx'), 'utf8');
  assert.match(capture, /name="sourceUri"/u);
  assert.match(capture, /autoComplete="url"/u);
  assert.match(capture, /beforeunload/u);
  assert.match(capture, /CAPTURE_DRAFT_STORAGE_KEY/u);
  assert.match(capture, /duplicate/u);
});
test('D1: mobile presents four task domains instead of twelve horizontally scrolling destinations', () => {
  assert.match(shell, /Object\.keys\(MOBILE_AREA_DEFAULTS\)/u);
  assert.match(workbenchCss, /\.workbench-mobile-domains/u);
  assert.match(workbenchCss, /grid-template-columns: repeat\(4, 1fr\)/u);
});
