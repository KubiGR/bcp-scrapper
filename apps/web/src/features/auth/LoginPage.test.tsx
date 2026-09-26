import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { stubFetchRoutes } from '../../test/render';
import { aUser, loggedOut, renderAtRoutes } from './auth-test-utils';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('logs in and goes back to the page the user came from', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': loggedOut,
      'POST /api/auth/login': { user: aUser() },
    });
    const { router } = renderAtRoutes({
      initial: '/login?next=%2Fevents%2FX%3Ftab%3Dplayers',
      login: <LoginPage next="/events/X?tab=players" />,
      page: <p>event page</p>,
    });
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'kubi' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'my password 12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('event page')).toBeInTheDocument();
    expect(router.state.location.href).toBe('/events/X?tab=players');
    const login = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(login?.[1]?.body as string)).toEqual({
      username: 'kubi',
      password: 'my password 12',
    });
  });

  it('says the login was wrong without saying which part', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': loggedOut,
      'POST /api/auth/login': () =>
        Response.json(
          { error: { code: 'UNAUTHORIZED', message: 'Invalid username or password' } },
          { status: 401 },
        ),
    });
    renderAtRoutes({ initial: '/login', login: <LoginPage next="/" />, page: <p>home</p> });
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'kubi' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope nope nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Invalid username or password')).toBeInTheDocument();
  });

  it('explains a lockout after too many attempts', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': loggedOut,
      'POST /api/auth/login': () =>
        Response.json(
          { error: { code: 'RATE_LIMITED', message: 'Too many failed logins; try again later' } },
          { status: 429 },
        ),
    });
    renderAtRoutes({ initial: '/login', login: <LoginPage next="/" />, page: <p>home</p> });
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'kubi' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope nope nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText(/Too many failed logins/)).toBeInTheDocument();
  });

  it('never sends the user to another site after login', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': loggedOut, 'POST /api/auth/login': { user: aUser() } });
    const { router } = renderAtRoutes({
      initial: '/login',
      login: <LoginPage next="//evil.example/x" />,
      page: <p>home</p>,
    });
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'kubi' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'my password 12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });
});
