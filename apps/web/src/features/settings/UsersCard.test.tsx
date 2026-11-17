import type { ListedUser, User } from '@bcp/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aUser, authOff, loggedIn, viaAccess } from '../auth/auth-test-utils';
import { UsersCard } from './UsersCard';

const me = aUser({ id: 1, username: 'kubi', role: 'admin' });
const ana = aUser({ id: 2, username: 'ana', role: 'member' });

function stubUsers(users: (User | ListedUser)[], extra: Record<string, unknown> = {}) {
  return stubFetchRoutes({
    'GET /api/auth/me': loggedIn(me),
    'GET /api/users': { users },
    ...extra,
  });
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest('article');
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

  it('says when each user was last seen', async () => {
    const hoursAgo = new Date(Date.now() - 3 * 60 * 60_000 - 60_000).toISOString();
    stubUsers([
      { ...me, lastSeenAt: hoursAgo },
      { ...ana, lastSeenAt: null },
    ]);
    renderWithProviders(<UsersCard />);
    expect(await screen.findByText('ana')).toBeInTheDocument();
    expect(within(rowOf('kubi')).getByText('Seen 3 h ago')).toBeInTheDocument();
    expect(within(rowOf('ana')).getByText('Never seen')).toBeInTheDocument();
  });

  it('through Access: says when someone waiting was last seen', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': viaAccess(me),
      'GET /api/users': {
        users: [
          me,
          {
            ...ana,
            username: 'ana@example.com',
            disabled: true,
            lastSeenAt: new Date(Date.now() - 5 * 60_000 - 1000).toISOString(),
          },
        ],
      },
    });
    renderWithProviders(<UsersCard />);
    const waiting = within(await screen.findByRole('region', { name: 'Waiting for approval' }));
    expect(waiting.getByText('Seen 5 min ago')).toBeInTheDocument();
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

  it('opens the pairings planner to a member, and shows who has it', async () => {
    const fetchMock = stubUsers(
      [me, { ...ana, canPair: true }, aUser({ id: 3, username: 'bo', role: 'member' })],
      {
        'PATCH /api/users/3': {
          user: aUser({ id: 3, username: 'bo', role: 'member', canPair: true }),
        },
      },
    );
    renderWithProviders(<UsersCard />);
    expect(await screen.findByText('ana')).toBeInTheDocument();
    expect(within(rowOf('ana')).getByText('Pairings')).toHaveClass('mantine-Badge-label');
    expect(within(rowOf('kubi')).getByText('Admin')).toHaveClass('mantine-Badge-label');
    expect(within(rowOf('bo')).queryByText('Pairings')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for bo' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Allow Pairings' }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) => url === '/api/users/3' && init?.method === 'PATCH',
      );
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ canPair: true });
    });
  });

  it('through Access: ignores someone waiting, who moves to an Ignored list', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': viaAccess(me),
      'GET /api/users': {
        users: [
          me,
          aUser({ id: 2, username: 'ana@example.com', role: 'member', disabled: true }),
          aUser({
            id: 3,
            username: 'spam@example.com',
            role: 'member',
            disabled: true,
            ignored: true,
          }),
        ],
      },
      'PATCH /api/users/2': { user: aUser({ id: 2, disabled: true, ignored: true }) },
    });
    renderWithProviders(<UsersCard />);
    const waiting = within(await screen.findByRole('region', { name: 'Waiting for approval' }));
    expect(waiting.getByText('ana@example.com')).toBeInTheDocument();
    expect(waiting.queryByText('spam@example.com')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ignored (1)' }));
    expect(await screen.findByText('spam@example.com')).toBeInTheDocument();
    fireEvent.click(waiting.getByRole('button', { name: 'Ignore ana@example.com' }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) => url === '/api/users/2' && init?.method === 'PATCH',
      );
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ ignored: true });
    });
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
