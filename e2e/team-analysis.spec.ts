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

  // Players are grouped by team on team events, and whole teams can be picked for lists.
  await expect(page.getByRole('checkbox', { name: 'Select Alpha Squad' })).toBeVisible();
  // Charlie Wing: Eve (0-2) isn't among the lists the finder spec fetches by result.
  await page.getByRole('checkbox', { name: 'Select Charlie Wing' }).check();
  await page.getByRole('button', { name: 'Fetch lists' }).click();
  await page.getByRole('menuitem', { name: /^Selected teams \(1 team ·/ }).click();
  const eveRow = page.getByRole('row', { name: /Eve Evans/ });
  await expect(eveRow.getByText('Fetched', { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('tab', { name: 'Standings' }).click();
  await page.getByRole('button', { name: 'Fetch pairings' }).click();
  // The fetch queue (200 ms per job in e2e) fetches both rounds; the tab refreshes itself.
  const alpha = page.getByRole('link', { name: 'Alpha Squad' });
  await expect(alpha).toBeVisible({ timeout: 20_000 });

  await alpha.click();
  await expect(page.getByRole('heading', { name: 'Alpha Squad' })).toBeVisible();
  // The team's per-player table (Ada Archer also appears in the Matches section above it).
  await expect(page.getByRole('table').getByText('Ada Archer')).toBeVisible();

  // Back to the event's Matchups tab: the sample event's rounds only give each faction pair a
  // couple of games, below the default `minGames` of 3, so it's lowered to 1 first.
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Sample Team Open' })).toBeVisible();
  await page.getByRole('tab', { name: 'Matchups' }).click();
  await page.getByLabel('Min games').fill('1');
  const cell = page.getByRole('button', { name: /Space Marines vs Orks/ });
  await expect(cell).toBeVisible();
  await cell.click();
  await expect(page.getByRole('dialog').getByText('Ada Archer')).toBeVisible();
});
