import { expect, test } from '@playwright/test';

test('find a tournament, queue a team’s lists and read one', async ({ page }) => {
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

  // A team event: pick a whole team; the background worker (200 ms per list in e2e) fetches it.
  await page.getByRole('checkbox', { name: 'Select Alpha Squad' }).check();
  await page.getByRole('button', { name: 'Fetch lists' }).click();
  await page.getByRole('menuitem', { name: 'Selected teams (1 team · 2 lists)' }).click();

  const adaRow = page.getByRole('row', { name: /Ada Archer/ });
  // exact: 'Fetched' would otherwise substring-match the "Not fetched" badge she starts with.
  await expect(adaRow.getByText('Fetched', { exact: true })).toBeVisible({ timeout: 20_000 });

  // The other teams' lists are still one click away.
  await page.getByRole('button', { name: 'Fetch lists' }).click();
  await expect(page.getByRole('menuitem', { name: 'All missing lists (5)' })).toBeEnabled();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Ada Archer' }).click();
  await expect(page.getByText(/Gladius Task Force/)).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Export lists' }).click();
  await expect(page.getByRole('menuitem', { name: 'Download .txt' })).toHaveAttribute(
    'href',
    '/api/events/EVTTEAM0001/lists/export?format=txt',
  );

  // Top lists: Ada went X-n or better at a big event (the e2e size rule keeps every event).
  await page.goto('/analysis/top-lists?from=2026-01-01&to=2026-12-31&maxLosses=5');
  const adaTopRow = page.getByRole('row', { name: /Ada Archer/ });
  await expect(adaTopRow.getByRole('link', { name: 'Sample Team Open' })).toBeVisible();
  await adaTopRow.getByRole('button', { name: 'List' }).click();
  await expect(page.getByText(/Gladius Task Force/)).toBeVisible();
});
