import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aUser, loggedIn } from '../auth/auth-test-utils';
import { BlockEventButton } from './BlockEventButton';

describe('BlockEventButton', () => {
  it('lets an admin block an event', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': loggedIn(aUser({ role: 'admin' })),
      'POST /api/events/EVT1/block': { blockedAt: '2026-11-14T10:00:00.000Z', cancelled: 0 },
    });
    renderWithProviders(<BlockEventButton event={{ bcpId: 'EVT1', blockedAt: null }} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Block' }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === '/api/events/EVT1/block' && init?.method === 'POST',
        ),
      ).toBe(true);
    });
  });

  it('unblocks a blocked event', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': loggedIn(aUser({ role: 'admin' })),
      'DELETE /api/events/EVT1/block': { blockedAt: null },
    });
    renderWithProviders(
      <BlockEventButton event={{ bcpId: 'EVT1', blockedAt: '2026-11-14T10:00:00.000Z' }} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Unblock' }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === '/api/events/EVT1/block' && init?.method === 'DELETE',
        ),
      ).toBe(true);
    });
  });

  it('is not shown to a member', async () => {
    const fetchMock = stubFetchRoutes({ 'GET /api/auth/me': loggedIn(aUser({ role: 'member' })) });
    renderWithProviders(<BlockEventButton event={{ bcpId: 'EVT1', blockedAt: null }} />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: 'Block' })).toBeNull();
  });
});
