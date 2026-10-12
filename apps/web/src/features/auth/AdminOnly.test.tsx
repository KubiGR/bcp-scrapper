import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { AdminOnly } from './AdminOnly';
import { aUser, authOff, loggedIn } from './auth-test-utils';

describe('AdminOnly', () => {
  it('shows its page to an admin, and to everyone when logins are off', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': loggedIn(aUser({ role: 'admin' })) });
    const admin = renderWithProviders(<AdminOnly>secret page</AdminOnly>);
    expect(await screen.findByText('secret page')).toBeInTheDocument();
    admin.unmount();
    stubFetchRoutes({ 'GET /api/auth/me': authOff });
    renderWithProviders(<AdminOnly>secret page</AdminOnly>);
    expect(await screen.findByText('secret page')).toBeInTheDocument();
  });

  it('tells a member it is for admins only', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': loggedIn(aUser({ role: 'member' })) });
    renderWithProviders(<AdminOnly>secret page</AdminOnly>);
    expect(await screen.findByText('This page is for the site’s admins only.')).toBeInTheDocument();
    expect(screen.queryByText('secret page')).toBeNull();
  });
});
