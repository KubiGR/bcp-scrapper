import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aUser, authOff, viaAccess } from '../auth/auth-test-utils';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  it('keeps users and detachments on tabs of their own', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': viaAccess(aUser({ role: 'admin' })),
      'GET /api/users': { users: [aUser({ role: 'admin' })] },
    });
    const onTabChange = vi.fn();
    renderWithProviders(<SettingsPage tab="users" onTabChange={onTabChange} />);
    expect(await screen.findByRole('region', { name: 'Waiting for approval' })).toBeInTheDocument();
    expect(screen.queryByText('Detachment names')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Detachments' }));
    expect(onTabChange).toHaveBeenCalledWith('detachments');
  });

  it('says there are no accounts on the Users tab when logins are off', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff });
    renderWithProviders(<SettingsPage tab="users" onTabChange={vi.fn()} />);
    expect(
      await screen.findByText('Logins are off here, so there are no accounts to manage.'),
    ).toBeInTheDocument();
  });
});
