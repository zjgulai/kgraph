import { expect, test } from '@playwright/test';

const sourceUri = 'https://example.test/e2e/retrieval-evaluation';
const sourceBody = '# Retrieval evaluation\n\nUse a fixed golden set before changing chunking.\n\n- Measure recall\n- Inspect failures';

test('Capture draft restore and Capture to Library to Review to Canvas handoff remain traceable', async ({ context, page }, testInfo) => {
  await page.goto('/?view=capture');
  await expect(page.getByRole('heading', { name: 'Capture Inbox' })).toBeVisible();

  if (testInfo.project.name === 'chromium-mobile') {
    await expect(page.getByText('移动端只读')).toBeVisible();
    await expect(page.locator('.capture-workspace__intake')).toHaveCount(0);
    return;
  }

  await page.getByRole('button', { name: /Owner 解锁/u }).click();
  await page.getByLabel('Owner token').fill('playwright-owner-token');
  const loginResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/owner/session') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '解锁编辑' }).click();
  const loginResponse = await loginResponsePromise;
  if (testInfo.project.name === 'webkit-desktop') {
    const signedValue = loginResponse.headers()['set-cookie']?.match(/doccanvas_owner_session=([^;]+)/u)?.[1];
    expect(signedValue).toBeTruthy();
    await context.addCookies([{
      name: 'doccanvas_owner_session', value: signedValue!, domain: 'localhost', path: '/',
      httpOnly: true, secure: false, sameSite: 'Strict',
    }]);
  }

  await page.getByLabel('来源 URL').fill(sourceUri);
  await page.getByLabel('用户提供正文').fill(sourceBody);
  await page.getByLabel('候选标题（可留空）').fill('E2E retrieval evaluation');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('doccanvas:capture-draft:v1'))).not.toBeNull();

  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByText('已恢复上次未提交的 Capture 草稿。')).toBeVisible();
  await expect(page.getByLabel('来源 URL')).toHaveValue(sourceUri);
  await expect(page.getByLabel('用户提供正文')).toHaveValue(sourceBody);

  await page.getByRole('button', { name: '上传并生成候选' }).click();
  await expect(page).toHaveURL(/view=knowledge.*object=capture\..*capture=capture-/u);
  await expect(page.getByRole('heading', { name: '来源到知识资产' })).toBeVisible();
  await expect(page.getByText('Capture', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: '进入 Review' }).click();
  await expect(page).toHaveURL(/view=review.*object=capture\./u);
  await expect(page.getByRole('heading', { name: 'Review Queue' })).toBeVisible();
  await expect(page.locator('.review-dossier__header')).toContainText('E2E retrieval evaluation');

  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page).toHaveURL(/view=knowledge.*object=capture\./u);
  await page.getByRole('link', { name: '在 Canvas 定位' }).click();
  await expect(page).toHaveURL(/view=canvas.*object=capture\./u);
  await expect(page.locator('.knowledge-canvas-inspector')).toContainText('E2E retrieval evaluation');
});
