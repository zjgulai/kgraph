import { expect, test } from '@playwright/test';

const context7 = 'knowledge.mcp_servers.context7';

test('governed workbench restores deep links, browser history and the command palette', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '工作队列', level: 1 })).toBeVisible();

  const mobile = (page.viewportSize()?.width ?? 0) <= 760;
  const knowledgeLink = mobile
    ? page.getByRole('navigation', { name: '移动端工作区导航' }).getByRole('link', { name: '知识' })
    : page.getByRole('complementary', { name: '产品工作区导航' }).getByRole('link', { name: /知识库/u });
  await knowledgeLink.click();
  await expect(page).toHaveURL(/view=knowledge/u);
  await expect(page.getByRole('heading', { name: '知识资产', level: 1 })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/localhost:3210\/$/u);
  await expect(page.getByRole('heading', { name: '工作队列', level: 1 })).toBeVisible();

  await page.goto(`/?view=knowledge&object=${context7}&domain=ai-product.tooling.mcp&q=context`);
  await expect(page.getByRole('searchbox', { name: '搜索知识对象' })).toHaveValue('context');
  await expect(page.locator('.knowledge-row[aria-current="true"]')).toContainText('Context7');

  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: '搜索对象与命令' });
  await expect(palette).toBeVisible();
  await palette.getByRole('searchbox').fill('时间线');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/view=timeline/u);
  await expect(page.getByRole('heading', { name: '双时态时间线', level: 1 })).toBeVisible();

  if (mobile) {
    await expect(page.getByRole('navigation', { name: '移动端工作区导航' }).getByRole('link')).toHaveCount(4);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(consoleErrors).toEqual([]);
});
