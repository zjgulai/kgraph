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

test('knowledge Library persists view state, roves selection and keeps Inspector and Review evidence synchronized', async ({ page }) => {
  await page.goto(`/?view=knowledge&object=${context7}&sort=title&density=compact&layout=grid`);

  const listbox = page.getByRole('listbox', { name: '知识对象列表' });
  await expect(listbox).toHaveAttribute('data-density', 'compact');
  await expect(listbox).toHaveAttribute('data-layout', 'grid');
  await expect(page.getByRole('combobox', { name: '排序' })).toHaveValue('title');

  const selected = listbox.getByRole('option', { selected: true });
  const selectedId = await selected.getAttribute('id');
  await selected.focus();
  await page.keyboard.press('ArrowDown');
  const nextSelected = listbox.getByRole('option', { selected: true });
  await expect(nextSelected).not.toHaveAttribute('id', selectedId ?? '');
  await expect(page).toHaveURL(/view=knowledge.*object=/u);
  await expect(page.getByRole('complementary', { name: '知识对象详情' }).getByRole('heading', { level: 2 }))
    .toHaveText((await nextSelected.locator('.knowledge-row__body > strong').innerText()));

  await page.reload();
  await expect(listbox).toHaveAttribute('data-density', 'compact');
  await expect(listbox).toHaveAttribute('data-layout', 'grid');
  await expect(page.getByRole('combobox', { name: '排序' })).toHaveValue('title');
  await expect(page.getByLabel('可信度、边界与下一动作')).toContainText('下一允许动作');

  await page.getByRole('link', { name: /进入 Review/u }).click();
  await expect(page).toHaveURL(/view=review.*object=/u);
  await expect(page.getByRole('complementary', { name: '来源证据' })).toBeVisible();
  await expect(page.getByRole('main', { name: '字段差异与候选修订' })).toBeVisible();
  await expect(page.getByLabel('当前字段差异')).toContainText('当前候选与已保存 revision 一致');
});
