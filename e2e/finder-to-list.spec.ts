import { expect, test } from '@playwright/test';

test('find a tournament, fetch its lists and read one', async ({ page }) => {
  // A deep search over 2026: it hasn't been fetched from BCP yet, so the finder offers to.
  await page.goto('/?size=all&from=2026-01-01&to=2026-12-31');

  // If the automatic latest refresh is still running, the notice says so and the Fetch
  // button isn't visible yet; wait for it before clicking.
  const fetchButton = page.getByRole('button', { name: 'Fetch', exact: true });
  await expect(fetchButton).toBeVisible({ timeout: 20_000 });
  await fetchButton.click();

  await page.getByRole('button', { name: 'Sample Team Open' }).click();
  await expect(page.getByRole('heading', { name: 'Sample Team Open' })).toBeVisible();

  // Opening a never-synced event loads its players automatically.
  await expect(page.getByRole('button', { name: 'Ada Archer' })).toBeVisible();

  await page.getByRole('button', { name: 'Fetch all lists (7 missing)' }).click();
  await expect(page.getByRole('button', { name: 'All lists fetched' })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole('button', { name: 'Ada Archer' }).click();
  await expect(page.getByText(/Gladius Task Force/)).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Export lists' }).click();
  await expect(page.getByRole('menuitem', { name: 'Download .txt' })).toHaveAttribute(
    'href',
    '/api/events/EVTTEAM0001/lists/export?format=txt',
  );
});
