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
    const row = within(await screen.findByRole('listitem', { name: /Jul 2026 · MFM/ }));
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

  it('shows what an update touched, and suggests names when renaming', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/updates': twoUpdates(),
      'PATCH /api/updates/b': twoUpdates(),
    });
    renderWithProviders(<UpdatesSection />);
    expect(await screen.findByText('Orks, Tyranids')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Jul 2026 · MFM' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(name).toHaveValue('Orks shake-up');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(name).toHaveValue('Update 2 · Jul 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(patchOf(fetchMock)?.body).toEqual({ name: 'Update 2 · Jul 2026' });
    });
  });

  it('moves an update’s start', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/updates': twoUpdates(),
      'PATCH /api/updates/b': twoUpdates(),
    });
    renderWithProviders(<UpdatesSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Change date: Jul 2026 · MFM' }));
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
    await screen.findByRole('button', { name: 'Merge into previous: Jul 2026 · MFM' });
    expect(
      screen.queryByRole('button', {
        name: 'Merge into previous: Jun 2026 · Faction Packs',
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Merge into previous: Jul 2026 · MFM' }));
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

  it('offers no merge when the update before is hidden', async () => {
    const [jul, jun] = twoUpdates().updates;
    if (jul === undefined || jun === undefined) throw new Error('fixture');
    stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/updates': { updates: [jul, { ...jun, hidden: true }] },
    });
    renderWithProviders(<UpdatesSection />);
    await screen.findByRole('button', { name: 'Rename Jul 2026 · MFM' });
    expect(
      screen.queryByRole('button', { name: 'Merge into previous: Jul 2026 · MFM' }),
    ).not.toBeInTheDocument();
  });

  it('says when there are no updates yet', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/updates': { updates: [] } });
    renderWithProviders(<UpdatesSection />);
    expect(await screen.findByText('No updates yet.')).toBeInTheDocument();
  });

  it('adds an update by hand', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/updates': twoUpdates(),
      'POST /api/updates': twoUpdates(),
    });
    renderWithProviders(<UpdatesSection />);
    const add = await screen.findByRole('button', { name: 'Add update' });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'New update' }), {
      target: { value: ' Balance Dataslate ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Starts (YYYY-MM-DD)' }), {
      target: { value: '2026-11-20' },
    });
    fireEvent.click(add);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(JSON.parse(call?.[1]?.body as string)).toEqual({
        name: 'Balance Dataslate',
        start: '2026-11-20',
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'New update' })).toHaveValue('');
    });
  });

  it('marks an update added by hand, and only that one can be deleted', async () => {
    const [jul, jun] = twoUpdates().updates;
    if (jul === undefined || jun === undefined) throw new Error('fixture');
    const added = { ...jul, id: 'added-1', name: 'Dataslate', autoName: 'Dataslate', added: true };
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/updates': { updates: [added, jun] },
      'DELETE /api/updates/added-1': { updates: [jun] },
    });
    renderWithProviders(<UpdatesSection />);
    expect(await screen.findByText('Added by hand')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete Jun 2026 · Faction Packs' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Dataslate' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText('Added by hand')).not.toBeInTheDocument();
    });
  });
});
