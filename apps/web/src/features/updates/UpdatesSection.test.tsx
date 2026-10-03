import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { authOff } from '../auth/auth-test-utils';
import { aGameUpdate, twoUpdates } from './test-updates';
import { UpdatesSection } from './UpdatesSection';

const patchOf = (fetchMock: ReturnType<typeof stubFetchRoutes>) => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
  return call === undefined
    ? undefined
    : { url: JSON.stringify(call[0]), body: JSON.parse(call[1]?.body as string) as unknown };
};

describe('UpdatesSection', () => {
  it('lists the updates with their start and events', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/updates': twoUpdates() });
    renderWithProviders(<UpdatesSection />);
    const row = within(await screen.findByRole('row', { name: /Jul 2026 · MFM/ }));
    expect(row.getByText('2 events')).toBeInTheDocument();
  });

  it('renames an update', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/updates': twoUpdates(),
      'PATCH /api/updates/b': twoUpdates(),
    });
    renderWithProviders(<UpdatesSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Jul 2026 · MFM' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'July points' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(patchOf(fetchMock)?.body).toEqual({ name: 'July points' });
    });
  });

  it('moves an update’s start', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/updates': twoUpdates(),
      'PATCH /api/updates/b': twoUpdates(),
    });
    renderWithProviders(<UpdatesSection />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Change the start of Jul 2026 · MFM' }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Start (YYYY-MM-DD)' }), {
      target: { value: '2026-07-25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(patchOf(fetchMock)?.body).toEqual({ start: '2026-07-25' });
    });
  });

  it('merges an update into the one before, and hides one', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/updates': twoUpdates(),
      'PATCH /api/updates/b': twoUpdates(),
    });
    renderWithProviders(<UpdatesSection />);
    // The oldest has none before it to merge into.
    await screen.findByRole('button', { name: 'Merge Jul 2026 · MFM into the update before' });
    expect(
      screen.queryByRole('button', {
        name: 'Merge Jun 2026 · Faction Packs into the update before',
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Merge Jul 2026 · MFM into the update before' }),
    );
    await waitFor(() => {
      expect(patchOf(fetchMock)?.body).toEqual({ merged: true });
    });
  });

  it('shows a merged update with a way back, and says when there are none', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/updates': { updates: [aGameUpdate({ merged: true, events: 0 })] },
    });
    renderWithProviders(<UpdatesSection />);
    expect(
      await screen.findByRole('button', { name: 'Undo merge of Jul 2026 · MFM' }),
    ).toBeInTheDocument();
  });

  it('says when no updates were read yet', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/updates': { updates: [] } });
    renderWithProviders(<UpdatesSection />);
    expect(await screen.findByText('No updates read from BSData yet.')).toBeInTheDocument();
  });
});
