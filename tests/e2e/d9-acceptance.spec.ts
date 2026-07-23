import { expect, test, type Page, type TestInfo } from '@playwright/test';

const context7 = 'knowledge.mcp_servers.context7';
const blueprintId = 'blueprint.support-gpt';

async function unlockOwner(page: Page) {
  const trigger = page.getByRole('button', { name: /Owner 解锁/u });
  const locked = page.getByRole('button', { name: '锁定编辑' });
  await expect(trigger.or(locked)).toBeVisible();
  if (await trigger.isVisible()) {
    await trigger.click();
    await page.getByLabel('Owner token').fill('playwright-owner-token');
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/owner/session') && response.request().method() === 'POST');
    await page.getByRole('button', { name: '解锁编辑' }).click();
    expect((await responsePromise).status()).toBe(200);
    await expect(page.getByRole('button', { name: '锁定编辑' })).toBeVisible();
  }
}

async function assertNamedInteractiveControls(page: Page) {
  const report = await page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const labelText = (element: Element) => {
      const labelledBy = element.getAttribute('aria-labelledby');
      const labelled = labelledBy ? labelledBy.split(/\s+/u).map(id => document.getElementById(id)?.textContent ?? '').join(' ') : '';
      const id = element.getAttribute('id');
      const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent ?? '' : '';
      const wrapped = element.closest('label')?.textContent ?? '';
      return [element.getAttribute('aria-label'), labelled, explicit, wrapped, element.getAttribute('alt'), element.getAttribute('title'), element.textContent]
        .filter(Boolean).join(' ').replace(/\s+/gu, ' ').trim();
    };
    const controls = [...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="link"], [role="option"]')]
      .filter(visible);
    const unnamed = controls.filter(element => labelText(element).length === 0).map(element => ({
      tag: element.tagName,
      className: element.getAttribute('class'),
      role: element.getAttribute('role'),
    }));
    const duplicateIds = [...document.querySelectorAll('[id]')]
      .map(element => element.id)
      .filter((id, index, ids) => ids.indexOf(id) !== index);
    const imagesWithoutAlt = [...document.querySelectorAll('img')].filter(image => !image.hasAttribute('alt')).length;
    return { unnamed, duplicateIds: [...new Set(duplicateIds)], imagesWithoutAlt };
  });
  expect(report).toEqual({ unnamed: [], duplicateIds: [], imagesWithoutAlt: 0 });
}

function srgbChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: string): number {
  const channels = rgb.match(/[\d.]+/gu)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`无法解析颜色：${rgb}`);
  return 0.2126 * srgbChannel(channels[0]!) + 0.7152 * srgbChannel(channels[1]!) + 0.0722 * srgbChannel(channels[2]!);
}

function contrastRatio(foreground: string, background: string): number {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((left, right) => right - left);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

test('D9 state gallery captures loading, empty, error, stale, conflict, unauthorized and expired states', async ({ page }) => {
  await page.goto('/e2e-fixtures/design-system');
  for (const state of ['loading', 'empty', 'error', 'stale', 'conflict', 'unauthorized', 'expired']) {
    await expect(page.locator(`[data-governance-state="${state}"]`)).toBeVisible();
  }
  await expect(page.locator('.ds-mutation-status')).toHaveCount(6);
  await expect(page).toHaveScreenshot('governed-state-gallery.png', { fullPage: true });
});

test('D9 accessibility gate covers names, focus, reflow, reduced motion and touch targets', async ({ page }, testInfo) => {
  const routes = [
    '/',
    `/?view=knowledge&object=${context7}&domain=ai-product.tooling.mcp&q=context`,
    `/?view=blueprints&blueprint=${blueprintId}&revision=1`,
    '/canvas/playbook-v2?presentation=map',
  ];
  for (const route of routes) {
    await page.goto(route);
    await assertNamedInteractiveControls(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }

  await page.goto('/');
  const commandTrigger = page.getByRole('button', { name: '搜索对象与命令' });
  await commandTrigger.focus();
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog', { name: '搜索对象与命令' })).toBeVisible();
  await page.keyboard.press('Escape');
  if (testInfo.project.name !== 'chromium-mobile') await expect(commandTrigger).toBeFocused();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/e2e-fixtures/design-system');
  await expect(page.locator('.ds-async[data-state="loading"] svg')).toHaveCSS('animation-name', 'none');

  const contrastPairs = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.position = 'fixed';
    probe.style.visibility = 'hidden';
    document.body.append(probe);
    const read = (foreground: string, background: string) => {
      probe.style.color = `var(${foreground})`;
      probe.style.backgroundColor = `var(${background})`;
      const style = getComputedStyle(probe);
      return { foreground: style.color, background: style.backgroundColor };
    };
    const pairs = [
      read('--factory-ink', '--factory-surface'),
      read('--factory-muted', '--factory-surface'),
      read('--factory-green', '--factory-surface'),
      read('--factory-copper', '--factory-surface'),
      read('--factory-slate', '--factory-surface'),
    ];
    probe.remove();
    return pairs;
  });
  for (const pair of contrastPairs) expect(contrastRatio(pair.foreground, pair.background)).toBeGreaterThanOrEqual(4.5);

  if (testInfo.project.name === 'chromium-mobile') {
    const targets = await page.evaluate(() => [...document.querySelectorAll('.workbench-mobile-domains a, .workbench-commandbar__search')]
      .filter(element => getComputedStyle(element).display !== 'none')
      .map(element => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
    for (const target of targets) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test('D9 keyboard-only route reaches a knowledge object without pointer input', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: '搜索对象与命令' });
  await expect(palette).toBeVisible();
  const searchbox = palette.getByRole('searchbox');
  await expect(searchbox).toBeFocused();
  await page.keyboard.type('Context7');
  await expect(palette.getByRole('option', { name: /Context7/u }).first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`object=${context7.replaceAll('.', '\\.')}`, 'u'));
  await expect(page.locator('.knowledge-row[aria-current="true"]')).toContainText('Context7');
});

test('D9 real Review CAS merge and approved Blueprint compile remain transactional', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Mutable D9 acceptance runs once against the isolated fixture root.');

  await page.goto(`/?view=review&object=${context7}`);
  await unlockOwner(page);
  const editor = page.locator('.review-editor');
  await expect(editor).toBeVisible();
  const title = editor.getByLabel(/^标题/u);
  await title.fill('Context7 local D9 title');

  const concurrentStatus = await page.evaluate(async objectId => {
    const currentResponse = await fetch(`/api/knowledge/review/${encodeURIComponent(objectId)}`, { cache: 'no-store' });
    const current = await currentResponse.json();
    const patch = {
      title: `${current.object.title} server D9`,
      body: current.object.body,
      knowledge_form: current.object.knowledge_form,
      domain_refs: current.object.domain_refs,
      asset_maturity: current.object.asset_maturity,
      cognitive_lenses: current.object.cognitive_lenses,
      scope: current.object.scope,
      valid_time: current.object.valid_time,
      observed_at: current.object.observed_at,
      source_refs: current.object.source_refs,
      relations: current.object.relations,
      supersedes: current.object.supersedes,
      evidence_grade: current.object.evidence_grade,
      confidence: current.object.confidence,
      usage_context: current.object.usage_context,
      value_context: current.object.value_context,
    };
    const response = await fetch(`/api/knowledge/review/${encodeURIComponent(objectId)}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: current.revision, baseObjectHash: current.objectHash, patch }),
    });
    return response.status;
  }, context7);
  expect(concurrentStatus).toBe(200);

  await editor.getByRole('button', { name: '保存候选修订' }).click();
  await expect(page.getByRole('heading', { name: '三方合并：基线 / 服务器 / 本地' })).toBeVisible();
  await page.getByRole('button', { name: '形成合并草稿' }).click();
  await expect(page.locator('.ds-mutation-status[data-state="dirty"]')).toBeVisible();
  await editor.getByRole('button', { name: '保存候选修订' }).click();
  await expect(page.locator('.ds-mutation-status[data-state="saved"]')).toContainText(/候选 revision \d+ 已保存/u);

  await page.goto(`/?view=blueprints&blueprint=${blueprintId}&revision=1`);
  await unlockOwner(page);
  const previewResponsePromise = page.waitForResponse(response => response.url().includes(`/api/blueprints/${blueprintId}/compile?`) && response.request().method() === 'GET');
  await page.getByRole('button', { name: '生成编译预览', exact: true }).click();
  expect((await previewResponsePromise).status()).toBe(200);
  await expect(page.getByLabel('编译预览')).toBeVisible();
  await page.getByRole('button', { name: '确认并编译 Artifact' }).click();
  await expect(page.getByText(/Genome 已通过二次校验并 create-only 保存/u)).toBeVisible();
  await expect(page.getByRole('button', { name: '下载 Genome' })).toBeVisible();
});

test('D9 five-task usability probe records success, time, errors and help points', async ({ page }, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Usability timing baseline is recorded once in Chromium desktop.');
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const results: Array<{ task: string; durationMs: number; actions: number; errors: number; helpPoints: number }> = [];
  const measure = async (task: string, actions: number, run: () => Promise<void>) => {
    const started = performance.now();
    const beforeErrors = errors.length;
    await run();
    results.push({ task, durationMs: Math.round(performance.now() - started), actions, errors: errors.length - beforeErrors, helpPoints: 0 });
  };

  await measure('diagnose-readiness', 1, async () => {
    await page.goto('/');
    await page.getByRole('link', { name: '打开 Evidence Registry' }).click();
    await expect(page.locator('.operations-masthead').getByRole('heading', { name: 'Evidence Registry', level: 1 })).toBeVisible();
  });
  await measure('find-knowledge-object', 3, async () => {
    await page.goto('/');
    await page.keyboard.press('Control+K');
    const palette = page.getByRole('dialog', { name: '搜索对象与命令' });
    await expect(palette.getByRole('searchbox')).toBeFocused();
    await page.keyboard.type('Context7');
    await expect(palette.getByRole('option', { name: /Context7/u }).first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(page.locator('.knowledge-row[aria-current="true"]')).toContainText('Context7');
  });
  await measure('review-candidate', 1, async () => {
    await page.goto(`/?view=review&object=${context7}`);
    await expect(page.getByRole('main', { name: '字段差异与候选修订' })).toContainText('Context7');
  });
  await measure('inspect-blueprint-diff', 2, async () => {
    await page.goto(`/?view=blueprints&blueprint=${blueprintId}&revision=1`);
    await page.getByRole('button', { name: 'Revision Diff' }).click();
    await expect(page.getByLabel('Blueprint revision diff')).toContainText('R1 → R2');
  });
  await measure('understand-canvas-relation', 2, async () => {
    await page.goto('/canvas/playbook-v2?presentation=map');
    const relations = page.locator('.factory-scene-edge__hit');
    await expect(relations).not.toHaveCount(0);
    const relationCount = await relations.count();
    expect(relationCount).toBeGreaterThan(0);
    await relations.nth(0).press('Enter');
    await expect(page.getByRole('dialog', { name: '生产关系' })).toBeVisible();
  });

  expect(results).toHaveLength(5);
  expect(results.every(result => result.durationMs < 8_000 && result.errors === 0 && result.helpPoints === 0)).toBe(true);
  await testInfo.attach('d9-usability-results.json', {
    body: Buffer.from(`${JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2)}\n`),
    contentType: 'application/json',
  });
});
