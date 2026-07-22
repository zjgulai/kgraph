import { expect, test } from '@playwright/test';

test('design system primitives preserve keyboard, focus and responsive contracts', async ({ page }, testInfo) => {
  await page.goto('/e2e-fixtures/design-system');
  await expect(page.getByRole('heading', { name: 'Governed interaction primitives' })).toBeVisible();

  const dialogTrigger = page.getByRole('button', { name: '打开保存 Dialog' });
  await dialogTrigger.focus();
  await dialogTrigger.press('Enter');
  const dialog = page.getByRole('dialog', { name: '保存候选修订' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('修订说明')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(dialogTrigger).toBeFocused();

  const menuTrigger = page.getByRole('button', { name: '更多动作' });
  await menuTrigger.click();
  const menu = page.getByRole('menu', { name: '更多动作' });
  await expect(menu.getByRole('menuitem', { name: '查看修订历史' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: '导出当前候选' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: '导出当前候选' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem', { name: '查看修订历史' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menuTrigger).toBeFocused();

  const tabs = page.getByRole('tablist', { name: '状态示例' });
  await tabs.getByRole('tab', { name: 'Ready' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Loading' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('正在载入候选…')).toBeVisible();

  await page.getByRole('button', { name: '打开 Inspector Drawer' }).click();
  const drawer = page.getByRole('dialog', { name: '当前知识对象' });
  await expect(drawer).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await drawer.getByRole('button', { name: '关闭 Inspector' }).click();

  if (testInfo.project.name === 'chromium-desktop') {
    await expect(page).toHaveScreenshot('workbench-primitives.png', { fullPage: true });
  }
});

test('reduced motion disables loading rotation and press translation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/e2e-fixtures/design-system');
  const button = page.getByRole('button', { name: '打开保存 Dialog' });
  expect(await button.evaluate(element => parseFloat(getComputedStyle(element).transitionDuration) <= 0.00001)).toBe(true);
  await page.getByRole('tab', { name: 'Loading' }).click();
  await expect(page.locator('.ds-async svg')).toHaveCSS('animation-name', 'none');
});
