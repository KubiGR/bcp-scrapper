import type { RulesStatus } from '@bcp/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatDateTime } from '../../lib/format';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { authOff } from '../auth/auth-test-utils';
import { RulesCard } from './RulesCard';

const status = (overrides: Partial<RulesStatus> = {}): RulesStatus => ({
  checkedAt: '2026-10-04T10:00:00.000Z',
  readAt: '2026-10-03T10:00:00.000Z',
  bundle: 'https://39k.pro/assets/index-47cf0977.js',
  dataVersion: 972,
  counts: { factions: 34, datasheets: 1056, weapons: 4576 },
  error: 'No rules data found in 39k.pro’s script (the site changed)',
  ...overrides,
});

describe('RulesCard', () => {
  it('shows what was read, when, and the last error', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/rules': status() });
    renderWithProviders(<RulesCard />);
    expect(
      await screen.findByText('34 factions · 1056 datasheets · 4576 weapons'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Read ${formatDateTime('2026-10-03T10:00:00.000Z')} · data version 972`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Checked ${formatDateTime('2026-10-04T10:00:00.000Z')}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Last check failed: No rules data found in 39k.pro’s script (the site changed)',
      ),
    ).toBeInTheDocument();
  });

  it('refreshes on request', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'POST /api/rules/refresh': status({ error: null }),
      'GET /api/rules': status(),
    });
    renderWithProviders(<RulesCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Last check failed/)).not.toBeInTheDocument();
    });
  });

  it('says when nothing has been read yet', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/rules': status({
        checkedAt: null,
        readAt: null,
        bundle: null,
        dataVersion: null,
        counts: null,
        error: null,
      }),
    });
    renderWithProviders(<RulesCard />);
    expect(await screen.findByText('Not read from 39k.pro yet.')).toBeInTheDocument();
  });
});
