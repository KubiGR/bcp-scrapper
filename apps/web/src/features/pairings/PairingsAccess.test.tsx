import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aUser, authOff, loggedIn } from '../auth/auth-test-utils';
import { PairingsAccess } from './PairingsAccess';

describe('PairingsAccess', () => {
  it('opens the planner to those it was opened to', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': loggedIn(aUser({ role: 'member', canPair: true })) });
    renderWithProviders(<PairingsAccess />);
    expect(await screen.findByRole('heading', { name: 'Pairings' })).toBeInTheDocument();
  });

  it('opens it to everyone when logins are off', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff });
    renderWithProviders(<PairingsAccess />);
    expect(await screen.findByRole('heading', { name: 'Pairings' })).toBeInTheDocument();
  });

  it('says it is not open to a member without it', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': loggedIn(aUser({ role: 'member', canPair: false })) });
    renderWithProviders(<PairingsAccess />);
    expect(
      await screen.findByText(
        'The pairings planner isn’t open to your account. Ask the site’s admin.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pairings' })).toBeNull();
  });
});
