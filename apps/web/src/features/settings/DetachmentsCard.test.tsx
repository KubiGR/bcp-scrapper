import type { DetachmentsStatus } from '@bcp/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { DetachmentsCard } from './DetachmentsCard';

const status = (overrides: Partial<DetachmentsStatus> = {}): DetachmentsStatus => ({
  factions: [
    { faction: 'Necrons', detachments: 12 },
    { faction: 'Orks', detachments: 17 },
  ],
  uncovered: ['Deathwatch', 'Imperial Agents'],
  ...overrides,
});

describe('DetachmentsCard', () => {
  it('shows how many detachments are known, and the factions with none', async () => {
    stubFetchRoutes({ 'GET /api/detachments/known': status() });
    renderWithProviders(<DetachmentsCard />);
    expect(await screen.findByText('2 factions · 29 detachments')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No detachments known (BCP’s names count there): Deathwatch, Imperial Agents',
      ),
    ).toBeInTheDocument();
  });

  it('says when none have been read yet', async () => {
    stubFetchRoutes({ 'GET /api/detachments/known': status({ factions: [] }) });
    renderWithProviders(<DetachmentsCard />);
    expect(await screen.findByText('No detachments read yet.')).toBeInTheDocument();
    expect(screen.queryByText(/No detachments known/)).not.toBeInTheDocument();
  });
});
