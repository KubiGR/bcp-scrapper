import { expect, test } from '@playwright/test';

test('fetch a team event’s pairings, read the standings and open a team', async ({ page }) => {
  await page.goto('/?size=all&from=2026-01-01&to=2026-12-31');
  const fetchButton = page.getByRole('button', { name: 'Fetch', exact: true });
  const event = page.getByRole('button', { name: 'Sample Team Open' });
  // Another spec may already have fetched this range from the same server.
  await expect(event.or(fetchButton)).toBeVisible({ timeout: 20_000 });
  if (await fetchButton.isVisible()) await fetchButton.click();
  await event.click();
  await expect(page.getByRole('heading', { name: 'Sample Team Open' })).toBeVisible();

  // Players are grouped by team on team events.
  await expect(page.getByRole('button', { name: /Alpha Squad/ })).toBeVisible();

  await page.getByRole('tab', { name: 'Standings' }).click();
  await page.getByRole('button', { name: 'Fetch pairings' }).click();
  // The fetch queue (200 ms per job in e2e) fetches both rounds; the tab refreshes itself.
  const alpha = page.getByRole('link', { name: 'Alpha Squad' });
  await expect(alpha).toBeVisible({ timeout: 20_000 });

  await alpha.click();
  await expect(page.getByRole('heading', { name: 'Alpha Squad' })).toBeVisible();
  // The team's per-player table (Ada Archer also appears in the Matches section above it).
  await expect(page.getByRole('table').getByText('Ada Archer')).toBeVisible();
});
