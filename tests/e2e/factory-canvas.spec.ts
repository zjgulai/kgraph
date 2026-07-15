import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import sharp from 'sharp';

async function waitForCameraSettled(page: Page) {
  await page.waitForFunction(() => {
    const world = document.querySelector<HTMLElement>('.factory-scene-canvas__world');
    if (!world) return false;
    const browser = window as typeof window & {
      __factoryCameraProbe?: { signature: string; since: number };
    };
    const signature = `${world.style.transform}:${world.classList.contains('is-camera-animating')}`;
    const now = performance.now();
    if (!browser.__factoryCameraProbe || browser.__factoryCameraProbe.signature !== signature) {
      browser.__factoryCameraProbe = { signature, since: now };
      return false;
    }
    return !world.classList.contains('is-camera-animating')
      && now - browser.__factoryCameraProbe.since >= 320;
  }, undefined, { timeout: 5_000 });
}

async function waitForScene(page: Page) {
  await page.goto('/canvas/playbook-v2');
  await expect(page.locator('.factory-scene-canvas')).toBeVisible();
  await expect(page.locator('.factory-scene-node')).not.toHaveCount(0);
  await waitForCameraSettled(page);
}

async function waitForDocumentScene(page: Page, documentId: string) {
  await page.goto(`/canvas/${documentId}`);
  const canvas = page.locator('.factory-scene-canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => Number(await canvas.getAttribute('data-scene-nodes'))).toBeGreaterThan(0);
  return canvas;
}

test('all builtin documents keep layout, routed scene, and rendered SVG relation counts aligned', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Desktop SVG contract is replaced by the mobile process rail.');
  for (const documentId of ['vibe-track', 'v2-pro', 'playbook-v2']) {
    const canvas = await waitForDocumentScene(page, documentId);
    const layoutEdges = Number(await canvas.getAttribute('data-layout-edges'));
    const sceneEdges = Number(await canvas.getAttribute('data-scene-edges'));
    expect(sceneEdges, `${documentId} routed scene edge count`).toBe(layoutEdges);
    expect(sceneEdges, `${documentId} must expose relations`).toBeGreaterThan(0);
    await expect(page.locator('.factory-scene-edge__line')).toHaveCount(sceneEdges);
    await expect(page.locator('.factory-scene-edge__hit')).toHaveCount(sceneEdges);
  }
});

test('desktop scene renders every routed relation and exposes one-shot interaction feedback', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Desktop SVG scene is intentionally replaced by the mobile process rail.');
  await waitForScene(page);

  const svg = page.locator('.factory-scene-canvas__pipelines');
  const announcedCount = Number((await svg.getAttribute('aria-label'))?.match(/^\d+/)?.[0]);
  const lines = page.locator('.factory-scene-edge__line');
  const hitTargets = page.locator('.factory-scene-edge__hit');
  expect(await lines.count()).toBe(announcedCount);
  expect(await hitTargets.count()).toBe(announcedCount);
  expect(announcedCount).toBeGreaterThan(0);

  const exposedHit = await hitTargets.evaluateAll(paths => {
    const svgPaths = paths as SVGPathElement[];
    for (const path of svgPaths) {
      const length = path.getTotalLength();
      const matrix = path.getScreenCTM();
      if (!matrix || length <= 0) continue;
      for (let step = 1; step < 10; step += 1) {
        const point = path.getPointAtLength(length * step / 10);
        const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(matrix);
        const element = document.elementFromPoint(screenPoint.x, screenPoint.y);
        if (!element?.classList.contains('factory-scene-edge__hit')) continue;
        const index = svgPaths.indexOf(element as SVGPathElement);
        if (index >= 0) return { index, x: screenPoint.x, y: screenPoint.y };
      }
    }
    return null;
  });
  if (!exposedHit) throw new Error('No routed relation exposes a browser-hit-testable segment.');
  const firstHit = hitTargets.nth(exposedHit.index);
  await expect(firstHit).toHaveAttribute('aria-label', /从“.+”到“.+”/u);
  await expect(firstHit).not.toHaveAttribute('aria-label', /node-playbook|region:/u);
  await page.mouse.move(0, 0);
  await page.mouse.move(exposedHit.x, exposedHit.y);
  await expect(page.locator('.factory-scene-edge__tracer')).not.toHaveCount(0);
  await page.mouse.click(exposedHit.x, exposedHit.y);
  await expect(page.getByRole('dialog', { name: /生产关系/u })).toBeVisible();
  await expect(page.getByText('由 Markdown 层级与确定性关系规则自动生成')).toBeVisible();
  await page.getByRole('button', { name: '关闭关系详情' }).click();

  await expect(page).toHaveScreenshot('playbook-overview.png');
});

test('keyboard navigation moves between scene nodes and reduced motion removes path animation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Mobile uses document-flow controls instead of the desktop scene keyboard model.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await waitForScene(page);
  const nodes = page.locator('.factory-scene-node[tabindex="0"]');
  await nodes.first().focus();
  const firstId = await nodes.first().getAttribute('data-node-id');
  await page.keyboard.press('ArrowRight');
  const focusedId = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.nodeId ?? null);
  expect(focusedId).not.toBe(firstId);
  await page.locator('.factory-scene-edge__hit').first().focus();
  await expect(page.locator('.factory-scene-edge__tracer')).toHaveCount(0);
});

test('mobile keeps module relationship semantics in a readable vertical process rail', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile-only relationship acceptance.');
  const login = await page.request.post('/api/owner/session', { data: { token: 'playwright-owner-token' } });
  expect(login.status()).toBe(200);
  await page.goto('/canvas/playbook-v2');
  await expect(page.locator('.mobile-process-rail')).toBeVisible();
  await expect(page.locator('.mobile-process-room')).not.toHaveCount(0);
  await expect(page.locator('.mobile-process-room__relations span')).not.toHaveCount(0);
  await expect(page.locator('.factory-module-actions')).toBeHidden();
  await expect(page.locator('.factory-owner-inspector')).toBeHidden();
  await expect(page).toHaveScreenshot('playbook-mobile-process-rail.png');
});

test('Owner security boundary rejects unauthenticated, cross-origin, and invalid portrait writes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Security mutation acceptance runs once.');
  const unauthenticated = await page.request.post('/api/canvases', {
    data: { title: 'Unauthenticated fixture' },
  });
  expect(unauthenticated.status()).toBe(401);

  const login = await page.request.post('/api/owner/session', {
    data: { token: 'playwright-owner-token' },
  });
  expect(login.status()).toBe(200);
  expect(login.headers()['set-cookie']).toMatch(/HttpOnly/i);
  expect(login.headers()['set-cookie']).toMatch(/SameSite=Strict/i);
  expect(login.headers()['set-cookie']).toMatch(/Secure/i);

  const crossOrigin = await page.request.post('/api/canvases', {
    headers: { Origin: 'https://invalid.example' },
    data: { title: 'Cross-origin fixture' },
  });
  expect(crossOrigin.status()).toBe(403);

  const invalidPortrait = await page.request.post('/api/assets/portraits', {
    multipart: {
      portrait: {
        name: 'portrait.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('not an image'),
      },
    },
  });
  expect(invalidPortrait.status()).toBe(415);

  const portraitInput = await sharp({
    create: { width: 40, height: 50, channels: 3, background: { r: 42, g: 82, b: 60 } },
  }).png().toBuffer();
  const validPortrait = await page.request.post('/api/assets/portraits', {
    multipart: {
      portrait: {
        name: 'portrait.png',
        mimeType: 'image/png',
        buffer: portraitInput,
      },
    },
  });
  expect(validPortrait.status()).toBe(201);
  const portrait = await validPortrait.json() as { asset: { id: string; width: number; height: number; url: string } };
  expect(portrait.asset).toMatchObject({ width: 800, height: 1000 });
  const portraitRead = await page.request.get(portrait.asset.url);
  expect(portraitRead.status()).toBe(200);
  expect(portraitRead.headers()['content-type']).toBe('image/webp');
  const portraitDelete = await page.request.delete(`/api/assets/portraits/${portrait.asset.id}`);
  expect(portraitDelete.status()).toBe(200);
});

test('viewport PNG and full-scene SVG export real production-rendered artifacts without Owner controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Binary export acceptance runs once.');
  await waitForScene(page);
  const expectedSceneNodes = Number(await page.locator('.factory-scene-canvas').getAttribute('data-scene-nodes'));
  const expectedSceneEdges = Number(await page.locator('.factory-scene-canvas').getAttribute('data-scene-edges'));

  const pngDownloadPromise = page.waitForEvent('download');
  await page.getByTitle('导出当前视口 PNG').click();
  const pngDownload = await pngDownloadPromise;
  const pngPath = await pngDownload.path();
  expect(pngPath).not.toBeNull();
  const png = readFileSync(pngPath!);
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.byteLength).toBeGreaterThan(1_000);

  const svgDownloadPromise = page.waitForEvent('download');
  await page.getByTitle('导出完整场景 SVG').click();
  const svgDownload = await svgDownloadPromise;
  const svgPath = await svgDownload.path();
  expect(svgPath).not.toBeNull();
  const svg = readFileSync(svgPath!, 'utf8');
  expect(svg).toMatch(/<svg/i);
  expect(svg).toContain('factory-scene-edge__line');
  expect((svg.match(/data-node-id=/g) ?? []).length).toBe(expectedSceneNodes);
  expect((svg.match(/data-edge-id=/g) ?? []).length).toBe(expectedSceneEdges);
  expect(svg).not.toContain('OWNER / MODULE');
  await expect(page.locator('.factory-scene-canvas')).toHaveAttribute('data-render-mode', 'virtualized');
});

test('desktop owner workflow performs CRUD, CAS conflict and revision restore in isolated data', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Mutable acceptance runs once against the isolated fixture root.');

  const login = await page.request.post('/api/owner/session', {
    data: { token: 'playwright-owner-token' },
  });
  expect(login.status()).toBe(200);
  const created = await page.request.post('/api/canvases', {
    data: { title: 'Playwright Owner 画布', description: '隔离 CRUD 验收' },
  });
  expect(created.status()).toBe(201);
  const payload = await created.json() as { canvas: { id: string } };
  await page.goto(`/canvas/${payload.canvas.id}`);
  await expect(page.locator('.factory-scene-canvas')).toBeVisible();

  const firstRoom = page.getByRole('button', { name: /选择房间/u }).first();
  const moduleId = await firstRoom.evaluate(element => (
    element.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId ?? ''
  ));
  expect(moduleId).not.toBe('');
  await firstRoom.click();
  await expect(firstRoom).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /新增与排序/u }).click();
  const inspector = page.locator('.factory-owner-inspector');
  await expect(inspector).toBeVisible();
  await inspector.getByLabel('标题').fill('E2E 新增节点');
  await inspector.getByLabel('节点类型').selectOption('prompt');
  await inspector.getByLabel('Markdown').fill('由 Playwright 创建的可恢复内容。');
  await inspector.getByRole('button', { name: '新增到模块' }).click();
  await expect(inspector.getByText('节点已新增。')).toBeVisible();
  const row = inspector.locator('.factory-owner-node-list article').filter({ hasText: 'E2E 新增节点' }).first();
  await expect(row).toBeVisible();
  await row.getByTitle('复制节点').click();
  await expect(inspector.getByText('节点已复制。')).toBeVisible();
  const copyRow = inspector.locator('.factory-owner-node-list article').filter({ hasText: 'E2E 新增节点 副本' }).first();
  await expect(copyRow).toBeVisible();
  await copyRow.dragTo(row);
  await expect(inspector.getByText('节点顺序已更新。')).toBeVisible();

  const currentMutationPromise = page.waitForResponse(
    response => response.url().includes('/mutations') && response.request().method() === 'POST',
  );
  await row.getByTitle('编辑节点').click();
  await page.getByRole('tab', { name: '编辑 Markdown' }).click();
  await page.locator('#node-source-content').fill('更新后的正文。');
  await page.locator('#node-source-type').selectOption('tool');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const currentMutation = await currentMutationPromise;
  const current = await currentMutation.json() as {
    presentation: { revision: number; documentHash: string };
  };
  await expect(inspector.locator('.factory-owner-node-list article').filter({ hasText: 'E2E 新增节点' }).first()).toContainText('tool');

  const concurrent = await page.evaluate(async ({ documentId, moduleId, revision, documentHash }) => {
    const request = (title: string) => fetch(`/api/documents/${documentId}/mutations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseRevision: revision,
        baseDocumentHash: documentHash,
        operation: { type: 'updateModule', moduleId, profile: { title } },
      }),
    }).then(response => response.status);
    return Promise.all([request('并发写入 A'), request('并发写入 B')]);
  }, {
    documentId: payload.canvas.id,
    moduleId,
    revision: current.presentation.revision,
    documentHash: current.presentation.documentHash,
  });
  expect(concurrent.sort((left, right) => left - right)).toEqual([200, 409]);

  await page.reload();
  await page.getByRole('button', { name: /选择房间/u }).first().click();
  await page.getByRole('button', { name: /新增与排序/u }).click();
  const refreshedInspector = page.locator('.factory-owner-inspector');
  const refreshedCopyRow = refreshedInspector.locator('.factory-owner-node-list article').filter({ hasText: 'E2E 新增节点 副本' }).first();
  await refreshedCopyRow.getByTitle('软删除节点').click();
  await refreshedCopyRow.getByRole('button', { name: '确认' }).click();
  await expect(refreshedInspector.getByText('节点已软删除，可从修订历史恢复。')).toBeVisible();
  await expect(refreshedInspector.locator('.factory-owner-node-list article').filter({ hasText: 'E2E 新增节点 副本' })).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: /选择房间/u }).first().click();
  await page.getByRole('button', { name: /查看历史/u }).click();
  await expect(page.locator('.factory-owner-history article')).not.toHaveCount(0);
  await page.locator('.factory-owner-history article').first().getByRole('button', { name: '恢复' }).click();
  await expect(page.getByText('修订已恢复，并生成新的修订记录。')).toBeVisible();

  await page.getByRole('button', { name: '肖像素材' }).click();
  const portraitBuffer = await sharp({
    create: { width: 320, height: 180, channels: 3, background: { r: 52, g: 88, b: 66 } },
  }).png().toBuffer();
  await page.locator('.factory-owner-assets input[type="file"]').setInputFiles({
    name: 'owner-preview.png',
    mimeType: 'image/png',
    buffer: portraitBuffer,
  });
  await expect(page.locator('.factory-owner-assets__preview')).toBeVisible();
  await expect(page.getByText('4:5 裁剪预览')).toBeVisible();
  await page.getByRole('button', { name: '确认上传' }).click();
  await expect(page.getByText('肖像已标准化为 800×1000 WebP，并选为当前模块肖像。')).toBeVisible();
  await expect(page.locator('.factory-owner-assets__grid img')).not.toHaveCount(0);
});

test('1000-node 2000-edge worker fixture stays within interaction and virtualization gates', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Scale acceptance runs once in Chromium desktop.');
  const navigationStartedAt = Date.now();
  await page.goto('/e2e-fixtures/factory-scale');
  const fixture = page.locator('.factory-scale-fixture');
  await expect(fixture).toHaveAttribute('data-scale-ready', 'true', { timeout: 2_500 });
  expect(Date.now() - navigationStartedAt).toBeLessThanOrEqual(2_500);
  await expect(fixture).toHaveAttribute('data-model-nodes', '1000');
  await expect(fixture).toHaveAttribute('data-model-edges', '2000');

  const canvas = page.locator('.factory-scene-canvas');
  await expect(canvas).toBeVisible();
  expect(Number(await canvas.getAttribute('data-rendered-nodes'))).toBeLessThanOrEqual(350);
  expect(Number(await canvas.getAttribute('data-rendered-edges'))).toBeLessThanOrEqual(700);

  const frameMetrics = await page.evaluate(async () => {
    const target = document.querySelector<HTMLElement>('.factory-scene-canvas');
    if (!target) throw new Error('Scale canvas is unavailable for frame sampling.');
    const rect = target.getBoundingClientRect();
    const values: number[] = [];
    let previous = await new Promise<number>(requestAnimationFrame);
    for (let index = 0; index < 60; index += 1) {
      target.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        deltaY: index % 2 === 0 ? -0.75 : 0.75,
      }));
      const current = await new Promise<number>(requestAnimationFrame);
      values.push(current - previous);
      previous = current;
    }
    const sorted = [...values].sort((left, right) => left - right);
    return {
      averageMs: values.reduce((total, value) => total + value, 0) / values.length,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    };
  });
  expect(1000 / frameMetrics.averageMs).toBeGreaterThanOrEqual(55);
  expect(frameMetrics.p95Ms).toBeLessThanOrEqual(25);

  const materializeMs = Number(await canvas.getAttribute('data-scene-materialize-ms'));
  expect(materializeMs).toBeLessThanOrEqual(50);

  const rerouteSamples: number[] = [];
  const contentNode = page.locator('.factory-scene-node[data-node-kind="content"]').first();
  await expect(contentNode).toBeVisible();
  for (let index = 0; index < 8; index += 1) {
    const box = await contentNode.boundingBox();
    if (!box) throw new Error('Scale content node has no drag box.');
    const direction = index % 2 === 0 ? 1 : -1;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + direction * 16, box.y + box.height / 2 + 8, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(70);
    rerouteSamples.push(Number(await canvas.getAttribute('data-scene-materialize-ms')));
  }
  rerouteSamples.sort((left, right) => left - right);
  const rerouteP95 = rerouteSamples[Math.floor(rerouteSamples.length * 0.95)];
  expect(rerouteP95).toBeLessThanOrEqual(50);
});
