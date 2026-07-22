import { expect, test } from '@playwright/test';

test('Evidence Registry, Provider Ops and unified Timeline remain traceable and read-only', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  const evidenceId = 'evidence:production:release';
  await page.goto(`/?view=evidence&record=${encodeURIComponent(evidenceId)}`);
  const registry = page.locator('.evidence-registry-workspace');
  await expect(registry.getByRole('heading', { name: 'Evidence Registry' })).toBeVisible();
  await expect(page.locator('.evidence-register a[aria-current="true"]')).toContainText('Production release identity');
  await expect(page.locator('.evidence-inspector')).toContainText(evidenceId);
  await expect(page.locator('.evidence-register li[data-state="not_measured"]').first()).toBeVisible();
  await expect(page.locator('.evidence-register li[data-freshness="stale"]')).toHaveCount(0);

  await page.goto('/?view=provider');
  await expect(page.locator('.provider-operations-workspace').getByRole('heading', { name: 'Provider Operations' })).toBeVisible();
  await expect(page.getByText('只读控制面')).toBeVisible();
  await expect(page.getByRole('button', { name: /执行调用|开始批次|运行 Provider/u })).toHaveCount(0);

  await page.goto('/?view=timeline&tab=governance');
  await expect(page.getByRole('tab', { name: /治理动作/u })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.timeline-unified li[data-axis="governance"]').first()).toBeVisible();
  await page.getByRole('tab', { name: /系统获知/u }).click();
  await expect(page).toHaveURL(/view=timeline.*tab=observed/u);
  await expect(page.locator('.timeline-unified li[data-axis="observed"]').first()).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
