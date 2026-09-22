import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchJson } from '../../test/render';
import { BcpStatusCard } from './BcpStatusCard';

describe('BcpStatusCard', () => {
  it('shows a live connection with its token expiry', async () => {
    stubFetchJson({
      source: 'bcp',
      authenticated: true,
      accessTokenExpiresAt: '2026-09-23T13:00:00.000Z',
      lastRefreshAt: '2026-09-23T12:00:00.000Z',
    });
    renderWithProviders(<BcpStatusCard />);
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText(/Token valid until/)).toBeInTheDocument();
  });

  it('explains fixture mode', async () => {
    stubFetchJson({
      source: 'fixtures',
      authenticated: false,
      accessTokenExpiresAt: null,
      lastRefreshAt: null,
    });
    renderWithProviders(<BcpStatusCard />);
    expect(await screen.findByText('Offline · fixtures')).toBeInTheDocument();
    expect(screen.getByText(/TOURNAMENT_SOURCE=bcp/)).toBeInTheDocument();
  });

  it('tells the user how to fix a missing login', async () => {
    stubFetchJson({
      source: 'bcp',
      authenticated: false,
      accessTokenExpiresAt: null,
      lastRefreshAt: null,
    });
    renderWithProviders(<BcpStatusCard />);
    expect(await screen.findByText('Not connected')).toBeInTheDocument();
    expect(screen.getByText(/BCP_REFRESH_TOKEN/)).toBeInTheDocument();
  });

  it('shows the API error with a retry button', async () => {
    stubFetchJson({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500);
    renderWithProviders(<BcpStatusCard />);
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
