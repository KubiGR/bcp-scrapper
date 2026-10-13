import type { DetachmentNamesResponse } from '@bcp/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { AdminTodo } from './AdminTodo';
import { aUser, authOff, loggedIn, viaAccess } from './auth-test-utils';

const admin = aUser({ id: 1, role: 'admin' });
const waiting = aUser({ id: 2, username: 'ana@example.com', role: 'member', disabled: true });
const ignored = aUser({
  id: 3,
  username: 'x@example.com',
  role: 'member',
  disabled: true,
  ignored: true,
});
const detachments = (unsure: number, wrong: number): DetachmentNamesResponse => ({
  unsure: Array.from({ length: unsure }, (_, i) => ({
    name: `N${String(i)}`,
    lists: 1,
    factions: [],
  })),
  foreign: [],
  ignored: [],
  learned: [],
  targets: [],
  links: [],
  bsdataFactions: [],
  wrong: Array.from({ length: wrong }, (_, i) => ({
    faction: 'Orks',
    name: `W${String(i)}`,
    lists: 1,
    bsdataFactions: [],
  })),
  kept: [],
});

afterEach(() => {
  document.title = 'Logis';
});

describe('AdminTodo', () => {
  it('counts an admin’s work: approvals (not the ignored) and detachments to sort, also in the title', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': viaAccess(admin),
      'GET /api/users': { users: [admin, waiting, ignored] },
      'GET /api/detachments': detachments(3, 2),
    });
    renderWithRouter(<AdminTodo />);
    const badge = await screen.findByRole('button', {
      name: 'To do: 1 for users, 5 for detachments',
    });
    // Two numbers: users, then detachments.
    expect(within(badge).getByText('1')).toHaveAttribute('data-part', 'users');
    expect(within(badge).getByText('5')).toHaveAttribute('data-part', 'detachments');
    await waitFor(() => {
      expect(document.title).toBe('(6) Logis');
    });
    fireEvent.click(badge);
    expect(await screen.findByRole('link', { name: '1 waiting for approval' })).toHaveAttribute(
      'href',
      '/settings?tab=users',
    );
    expect(screen.getByRole('link', { name: '3 detachment names to link' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '2 detachments outside their faction' }),
    ).toHaveAttribute('href', '/settings?tab=detachments&faction=all&focus=outside');
  });

  it('shows nothing, and a plain title, when there is nothing to do', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': viaAccess(admin),
      'GET /api/users': { users: [admin, ignored] },
      'GET /api/detachments': detachments(0, 0),
    });
    renderWithRouter(<AdminTodo />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByRole('button', { name: /To do/ })).toBeNull();
    expect(document.title).toBe('Logis');
  });

  it('counts detachments without logins (no approvals then), and nothing for a member', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/detachments': detachments(1, 0) });
    const view = renderWithRouter(<AdminTodo />);
    const badge = await screen.findByRole('button', { name: 'To do: 1 for detachments' });
    expect(
      within(badge).queryByText((_, el) => el?.getAttribute('data-part') === 'users'),
    ).toBeNull();
    view.unmount();
    stubFetchRoutes({
      'GET /api/auth/me': loggedIn(aUser({ role: 'member' })),
      'GET /api/detachments': detachments(4, 0),
    });
    renderWithRouter(<AdminTodo />);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByRole('button', { name: /To do/ })).toBeNull();
  });
});
