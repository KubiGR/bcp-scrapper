import type { BsdataStatus } from '@bcp/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatDateTime } from '../../lib/format';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { authOff } from '../auth/auth-test-utils';
import { BsdataCard } from './BsdataCard';

const status = (overrides: Partial<BsdataStatus> = {}): BsdataStatus => ({
  checkedAt: '2026-10-03T10:00:00.000Z',
  factions: [
    { faction: 'Necrons', detachments: 12 },
    { faction: 'Orks', detachments: 17 },
  ],
  errors: [{ path: 'Tyranids.json', error: 'GitHub answered 500' }],
  ...overrides,
});

describe('BsdataCard', () => {
  it('shows what BSData gave, when, and its errors', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/bsdata': status() });
    renderWithProviders(<BsdataCard />);
    expect(await screen.findByText('2 factions · 29 detachments')).toBeInTheDocument();
    expect(
      screen.getByText(`Checked ${formatDateTime('2026-10-03T10:00:00.000Z')}`),
    ).toBeInTheDocument();
    expect(screen.getByText('Tyranids.json: GitHub answered 500')).toBeInTheDocument();
  });

  it('refreshes on request', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'POST /api/bsdata/refresh': status({ errors: [] }),
      'GET /api/bsdata': status(),
    });
    renderWithProviders(<BsdataCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText('Tyranids.json: GitHub answered 500')).not.toBeInTheDocument();
    });
  });

  it('says when BSData hasn’t been read yet', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/bsdata': status({ checkedAt: null, factions: [], errors: [] }),
    });
    renderWithProviders(<BsdataCard />);
    expect(await screen.findByText('Not read from BSData yet.')).toBeInTheDocument();
  });
});
