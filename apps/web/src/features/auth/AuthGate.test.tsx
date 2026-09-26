import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { stubFetchRoutes } from '../../test/render';
import { aUser, authOff, loggedIn, loggedOut, renderAtRoutes } from './auth-test-utils';
import { AuthGate } from './AuthGate';

const gated = (
  <AuthGate>
    <p>the app</p>
  </AuthGate>
);

describe('AuthGate', () => {
  it('renders the app without logins when auth is off', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff });
    renderAtRoutes({ initial: '/events/X', page: gated, login: <p>login page</p> });
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });

  it('sends a logged-out visitor to the login page, remembering where they were', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': loggedOut });
    const { router } = renderAtRoutes({
      initial: '/events/X?tab=players',
      page: gated,
      login: <p>login page</p>,
    });
    expect(await screen.findByText('login page')).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ next: '/events/X?tab=players' });
    });
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
  });

  it('shows only the password change while one is required', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': loggedIn(aUser({ mustChangePassword: true })) });
    renderAtRoutes({ initial: '/', page: gated, login: <p>login page</p> });
    expect(
      await screen.findByRole('heading', { name: 'Choose your password' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
  });

  it('renders the app for a logged-in user', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': loggedIn() });
    renderAtRoutes({ initial: '/', page: gated, login: <p>login page</p> });
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });
});
