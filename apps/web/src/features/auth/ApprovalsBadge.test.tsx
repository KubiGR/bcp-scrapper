import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { ApprovalsBadge } from './ApprovalsBadge';
import { aUser, viaAccess } from './auth-test-utils';

const admin = aUser({ id: 1, role: 'admin' });
const waiting = aUser({ id: 2, username: 'ana@example.com', role: 'member', disabled: true });
const ignored = aUser({
  id: 3,
  username: 'x@example.com',
  role: 'member',
  disabled: true,
  ignored: true,
});

describe('ApprovalsBadge', () => {
  it('tells an admin how many wait for approval (not the ignored), linking to Settings', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': viaAccess(admin),
      'GET /api/users': { users: [admin, waiting, ignored] },
    });
    renderWithRouter(<ApprovalsBadge />);
    const link = await screen.findByRole('link', { name: '1 waiting for approval' });
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('shows nothing when nobody waits, or to a member', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': viaAccess(admin),
      'GET /api/users': { users: [admin, ignored] },
    });
    const view = renderWithRouter(<ApprovalsBadge />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('link', { name: /waiting/ })).toBeNull();
    view.unmount();
    stubFetchRoutes({ 'GET /api/auth/me': viaAccess(aUser({ role: 'member' })) });
    renderWithRouter(<ApprovalsBadge />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('link', { name: /waiting/ })).toBeNull();
  });
});
