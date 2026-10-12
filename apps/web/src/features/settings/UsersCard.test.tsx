import type { User } from '@bcp/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aUser, authOff, loggedIn, viaAccess } from '../auth/auth-test-utils';
import { UsersCard } from './UsersCard';

const me = aUser({ id: 1, username: 'kubi', role: 'admin' });
const ana = aUser({ id: 2, username: 'ana', role: 'member' });

function stubUsers(users: User[], extra: Record<string, unknown> = {}) {
  return stubFetchRoutes({
    'GET /api/auth/me': loggedIn(me),
    'GET /api/users': { users },
    ...extra,
  });
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr');
  if (row === null) throw new Error(`no row for ${name}`);
  return row;
}

describe('UsersCard', () => {
  it('through Cloudflare Access: lists who waits to be let in, to approve or remove', async () => {
    const bo = aUser({ id: 3, username: 'bo@example.com', role: 'member' });
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': viaAccess(me),
      'GET /api/users': {
        users: [me, { ...ana, username: 'ana@example.com', disabled: true }, bo],
      },
      'PATCH /api/users/2': { user: { ...ana, disabled: false } },
    });
    renderWithProviders(<UsersCard />);
    const waiting = within(await screen.findByRole('region', { name: 'Waiting for approval' }));
    expect(waiting.getByText('ana@example.com')).toBeInTheDocument();
    expect(waiting.queryByText('bo@example.com')).toBeNull();
    // No passwords through Access: no new accounts, no resets, and admins come from the server.
    expect(screen.queryByRole('button', { name: /Add user/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for bo@example.com' }));
    expect(await screen.findByRole('menuitem', { name: 'Disable' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Reset password' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Make admin' })).toBeNull();
    fireEvent.click(waiting.getByRole('button', { name: 'Approve ana@example.com' }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === '/api/users/2' && init?.method === 'PATCH',
        ),
      ).toBe(true);
    });
  });

  it('lists the users with role and status', async () => {
    stubUsers([me, { ...ana, disabled: true }]);
    renderWithProviders(<UsersCard />);
    expect(await screen.findByText('ana')).toBeInTheDocument();
    expect(within(rowOf('ana')).getByText('Disabled')).toBeInTheDocument();
    expect(within(rowOf('kubi')).getByText('you')).toBeInTheDocument();
  });

  it('adds a user and shows their one-time password once, with a copy button', async () => {
    const fetchMock = stubUsers([me], {
      'POST /api/users': {
        user: aUser({ id: 3, username: 'bo', role: 'member', mustChangePassword: true }),
        temporaryPassword: 'tmp-Pass-1234567',
      },
    });
    renderWithProviders(<UsersCard />);
    fireEvent.change(await screen.findByLabelText('New username'), { target: { value: 'bo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
    expect(await screen.findByText('tmp-Pass-1234567')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy password' })).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ username: 'bo', role: 'member' });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('tmp-Pass-1234567')).not.toBeInTheDocument();
  });

  it('resets a password, disables and removes a user (after confirming)', async () => {
    const fetchMock = stubUsers([me, ana], {
      'POST /api/users/2/reset-password': { temporaryPassword: 'reset-Pass-12345' },
      'PATCH /api/users/2': { user: { ...ana, disabled: true } },
      'DELETE /api/users/2': { ok: true },
    });
    renderWithProviders(<UsersCard />);
    await screen.findByText('ana');

    fireEvent.click(within(rowOf('ana')).getByRole('button', { name: 'Actions for ana' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reset password' }));
    expect(await screen.findByText('reset-Pass-12345')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    fireEvent.click(within(rowOf('ana')).getByRole('button', { name: 'Actions for ana' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Disable' }));
    await waitForCall(fetchMock, 'PATCH');

    fireEvent.click(within(rowOf('ana')).getByRole('button', { name: 'Actions for ana' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove ana' }));
    await waitForCall(fetchMock, 'DELETE');
  });

  it('offers no actions on your own row', async () => {
    stubUsers([me, ana]);
    renderWithProviders(<UsersCard />);
    await screen.findByText('ana');
    expect(
      within(rowOf('kubi')).queryByRole('button', { name: /Actions/ }),
    ).not.toBeInTheDocument();
  });

  it('is hidden from members and when logins are off', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': loggedIn(ana) });
    const { unmount } = renderWithProviders(<UsersCard />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    unmount();
    stubFetchRoutes({ 'GET /api/auth/me': authOff });
    renderWithProviders(<UsersCard />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
  });
});

async function waitForCall(
  fetchMock: ReturnType<typeof stubFetchRoutes>,
  method: string,
): Promise<void> {
  await waitFor(() => {
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === method)).toBe(true);
  });
}
