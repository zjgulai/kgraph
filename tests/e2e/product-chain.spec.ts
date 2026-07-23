import { expect, test } from '@playwright/test';

const blueprintId = 'blueprint.support-gpt';
const taskId = 'task.support-gpt';

test('Product Task to Blueprint diff to Artifact lineage is deep-linkable and governed', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto(`/?view=solutions&task=${taskId}&blueprint=${blueprintId}`);
  await expect(page.getByRole('heading', { name: '从证据到候选方案' })).toBeVisible();

  if (testInfo.project.name === 'chromium-mobile') {
    await expect(page.getByText('移动端只读')).toBeVisible();
    await expect(page.getByRole('button', { name: '建立结构化候选' })).toHaveCount(0);
  } else {
    await expect(page.getByRole('region', { name: '已持久化 Product Task' }).getByText('SupportGPT')).toBeVisible();
  }

  await page.goto(`/?view=blueprints&task=${taskId}&blueprint=${blueprintId}&revision=1`);
  await expect(page.getByRole('heading', { name: 'SupportGPT' })).toBeVisible();

  if (testInfo.project.name !== 'chromium-mobile') {
    await page.getByRole('button', { name: 'Revision Diff' }).click();
    await expect(page.getByLabel('Blueprint revision diff')).toContainText('R1 → R2');
    await expect(page.getByLabel('Blueprint revision diff')).toContainText('product_task.goal');
    await expect(page.getByLabel('Blueprint revision diff')).toContainText('受影响 Artifact：1');
  } else {
    await expect(page.getByText('移动端只读 Blueprint')).toBeVisible();
    await expect(page.getByRole('button', { name: '生成编译预览', exact: true })).toHaveCount(0);
  }

  await page.goto(`/?view=artifacts&task=${taskId}&blueprint=${blueprintId}&artifact=r000001-20260722T060500Z&tab=evaluation`);
  await expect(page.getByRole('heading', { name: 'Compiled Views' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Evaluation' })).toHaveAttribute('aria-selected', 'true');
  const provenance = page.getByLabel('Artifact provenance');
  await expect(provenance).toContainText(taskId);
  await expect(provenance).toContainText('blueprint-compiler-v1.1');
  await expect(provenance).toContainText('replayable');
  await expect(provenance).toContainText('productTask:product_task');
  await expect(page).toHaveURL(/artifact=r000001-20260722T060500Z.*tab=evaluation/u);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('dirty Product Task draft blocks workbench navigation and remains recoverable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'mobile Product workspace is readonly');
  await page.goto(`/?view=solutions&task=${taskId}&blueprint=${blueprintId}`);
  const productName = page.getByRole('textbox', { name: '产品名' });
  await productName.fill('SupportGPT 未保存草稿');

  page.once('dialog', dialog => {
    expect(dialog.message()).toContain('未保存草稿');
    void dialog.dismiss();
  });
  await page.getByRole('link', { name: /工作队列/u }).first().click();
  await expect(page).toHaveURL(/view=solutions/u);
  await expect(productName).toHaveValue('SupportGPT 未保存草稿');

  await page.reload();
  await expect(page.getByRole('textbox', { name: '产品名' })).toHaveValue('SupportGPT 未保存草稿');
});
