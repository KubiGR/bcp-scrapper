import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { stubFetchRoutes } from '../../test/render';
import { AccountMenu } from './AccountMenu';
import { aUser, authOff, loggedIn, loggedOut, renderAtRoutes, viaAccess } from './auth-test-utils';

describe('AccountMenu', () => {
  it('shows who is logged in, and Log out returns to the login page', async () => {
    let me = loggedIn(aUser({ username: 'ana', role: 'member' }));
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': () => Response.json(me),
      'POST /api/auth/logout': () => {
        me = loggedOut;
        return Response.json({ ok: true });
      },
    });
    const { router } = renderAtRoutes({
      initial: '/events',
      page: <AccountMenu />,
      login: <p>login page</p>,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Account: ana' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Log out' }));
    expect(await screen.findByText('login page')).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url === '/api/auth/logout' && init?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('opens the password change', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': loggedIn() });
    renderAtRoutes({ initial: '/', page: <AccountMenu />, login: <p>login page</p> });
    fireEvent.click(await screen.findByRole('button', { name: 'Account: kubi' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Change password' }));
    expect(await screen.findByLabelText('Current password')).toBeInTheDocument();
  });

  it('through Cloudflare Access: no password change, and Sign out goes to Cloudflare', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': viaAccess(aUser({ username: 'ana@example.com' })) });
    renderAtRoutes({ initial: '/', page: <AccountMenu />, login: <p>login page</p> });
    fireEvent.click(await screen.findByRole('button', { name: 'Account: ana@example.com' }));
    expect(screen.queryByRole('menuitem', { name: 'Change password' })).not.toBeInTheDocument();
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toHaveAttribute(
      'href',
      '/cdn-cgi/access/logout',
    );
  });

  it('is not there when logins are off', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff });
    renderAtRoutes({
      initial: '/',
      page: (
        <>
          <AccountMenu />
          <p>page</p>
        </>
      ),
      login: <p>login page</p>,
    });
    await screen.findByText('page');
    expect(screen.queryByRole('button', { name: /Account/ })).not.toBeInTheDocument();
  });
});
