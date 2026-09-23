import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchJson } from '../../test/render';
import { BcpStatusCard } from './BcpStatusCard';

describe('BcpStatusCard', () => {
  it('shows a live connection with its token expiry', async () => {
    stubFetchJson({
      source: 'bcp',
      state: 'connected',
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
      state: 'fixtures',
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
      state: 'missing',
      accessTokenExpiresAt: null,
      lastRefreshAt: null,
    });
    renderWithProviders(<BcpStatusCard />);
    expect(await screen.findByText('Not connected')).toBeInTheDocument();
    expect(screen.getByText(/BCP_REFRESH_TOKEN/)).toBeInTheDocument();
  });

  it('tells the user how to replace a login BCP rejected', async () => {
    stubFetchJson({
      source: 'bcp',
      state: 'rejected',
      accessTokenExpiresAt: '2026-09-23T11:00:00.000Z',
      lastRefreshAt: '2026-09-22T12:00:00.000Z',
    });
    renderWithProviders(<BcpStatusCard />);
    expect(await screen.findByText('Login expired')).toBeInTheDocument();
    expect(
      screen.getByText(
        'BCP rejected the saved login. Log in at bestcoastpairings.com, copy a fresh refresh token into BCP_REFRESH_TOKEN in .env, and restart the API.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the API error with a retry button', async () => {
    stubFetchJson({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500);
    renderWithProviders(<BcpStatusCard />);
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
