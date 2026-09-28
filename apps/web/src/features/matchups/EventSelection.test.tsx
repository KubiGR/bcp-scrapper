import type { MatchupEvent } from '@bcp/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { EventSelection } from './EventSelection';

const anEvent = (overrides: Partial<MatchupEvent> = {}): MatchupEvent => ({
  id: 'EVT1',
  name: 'Sample Team Open',
  startDate: '2026-01-05T00:00:00.000Z',
  playerCount: 96,
  teamCount: 12,
  roundCount: 5,
  pairings: 'synced',
  included: true,
  ...overrides,
});

describe('EventSelection', () => {
  it('lists events with date, size, pairings state and a checkbox reflecting included', async () => {
    stubFetchRoutes({});
    renderWithRouter(
      <EventSelection events={[anEvent()]} exclude={[]} include={[]} onChange={vi.fn()} />,
    );

    expect(await screen.findByRole('link', { name: 'Sample Team Open' })).toBeInTheDocument();
    expect(screen.getByText('96 players · 12 teams')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox', { name: 'Include Sample Team Open' });
    expect(checkbox).toBeChecked();
  });

  it('sorts the events on a column header', async () => {
    stubFetchRoutes({});
    renderWithRouter(
      <EventSelection
        events={[
          anEvent({ id: 'A', name: 'Zeta Open', playerCount: 40 }),
          anEvent({ id: 'B', name: 'Alpha Cup', playerCount: 120 }),
        ]}
        exclude={[]}
        include={[]}
        onChange={vi.fn()}
      />,
    );
    await screen.findByRole('link', { name: 'Zeta Open' });
    const names = () => screen.getAllByRole('link').map((link) => link.textContent);
    fireEvent.click(screen.getByRole('button', { name: 'Event' }));
    expect(names()).toEqual(['Alpha Cup', 'Zeta Open']);
    fireEvent.click(screen.getByRole('button', { name: 'Size' }));
    expect(names()).toEqual(['Alpha Cup', 'Zeta Open']);
    fireEvent.click(screen.getByRole('button', { name: /Size/ }));
    expect(names()).toEqual(['Zeta Open', 'Alpha Cup']);
  });

  it('shows the pairings state badge text for fetching, partial and no-pairings events', async () => {
    stubFetchRoutes({});
    renderWithRouter(
      <EventSelection
        events={[
          anEvent({ id: 'EVT2', name: 'Fetching Event', pairings: 'fetching', included: false }),
          anEvent({ id: 'EVT3', name: 'Partial Event', pairings: 'partial', included: false }),
          anEvent({ id: 'EVT4', name: 'Missing Event', pairings: 'missing', included: false }),
        ]}
        exclude={[]}
        include={[]}
        onChange={vi.fn()}
      />,
    );

    expect(await screen.findByText('Fetching')).toBeInTheDocument();
    expect(screen.getByText('Partial')).toBeInTheDocument();
    expect(screen.getByText('No pairings')).toBeInTheDocument();
  });

  it('toggling a synced event’s checkbox calls onChange with it added to exclude', async () => {
    stubFetchRoutes({});
    const onChange = vi.fn();
    renderWithRouter(
      <EventSelection events={[anEvent()]} exclude={[]} include={[]} onChange={onChange} />,
    );

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Include Sample Team Open' }));

    expect(onChange).toHaveBeenCalledWith({ exclude: ['EVT1'], include: [] });
  });

  it('toggling a partial event’s checkbox calls onChange with it added to include', async () => {
    stubFetchRoutes({});
    const onChange = vi.fn();
    renderWithRouter(
      <EventSelection
        events={[anEvent({ pairings: 'partial', included: false })]}
        exclude={[]}
        include={[]}
        onChange={onChange}
      />,
    );

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Include Sample Team Open' }));

    expect(onChange).toHaveBeenCalledWith({ exclude: [], include: ['EVT1'] });
  });

  it('shows "Sync pairings for N events" counting missing and partial events, and posts their ids', async () => {
    const fetchMock = stubFetchRoutes({
      'POST /api/pairings-queue': { events: 2, queuedRounds: 5, estimatedSeconds: 30 },
    });
    renderWithRouter(
      <EventSelection
        events={[
          anEvent({ id: 'EVT1', pairings: 'synced', included: true }),
          anEvent({ id: 'EVT2', pairings: 'partial', included: false }),
          anEvent({ id: 'EVT3', pairings: 'missing', included: false }),
        ]}
        exclude={[]}
        include={[]}
        onChange={vi.fn()}
      />,
    );

    const button = await screen.findByRole('button', { name: 'Sync pairings for 2 events' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pairings-queue',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/pairings-queue');
    if (!call) throw new Error('Expected a POST /api/pairings-queue call');
    const body: unknown = JSON.parse(call[1]?.body as string);
    expect(body).toEqual({ eventIds: ['EVT2', 'EVT3'] });
  });

  it('shows singular wording for exactly one event to sync', async () => {
    stubFetchRoutes({});
    renderWithRouter(
      <EventSelection
        events={[anEvent({ pairings: 'missing', included: false })]}
        exclude={[]}
        include={[]}
        onChange={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole('button', { name: 'Sync pairings for 1 event' }),
    ).toBeInTheDocument();
  });

  it('sends the missing/partial ids in chunks of at most 200, summing the results', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `EVT${i}`);
    const fetchMock = stubFetchRoutes({
      'POST /api/pairings-queue': (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string) as { eventIds: string[] };
        return Response.json({
          events: body.eventIds.length,
          queuedRounds: body.eventIds.length * 2,
          estimatedSeconds: 10,
        });
      },
    });
    renderWithRouter(
      <EventSelection
        events={ids.map((id) => anEvent({ id, pairings: 'missing', included: false }))}
        exclude={[]}
        include={[]}
        onChange={vi.fn()}
      />,
    );

    const button = await screen.findByRole('button', { name: 'Sync pairings for 250 events' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/pairings-queue').length).toBe(2);
    });
    const sizes = fetchMock.mock.calls
      .filter(([url]) => url === '/api/pairings-queue')
      .map(([, init]) => {
        const body = JSON.parse((init?.body ?? '{}') as string) as { eventIds: string[] };
        return body.eventIds.length;
      });
    expect(sizes.sort((a, b) => b - a)).toEqual([200, 50]);
  });

  it('hides the Sync button when there are no missing or partial events', async () => {
    stubFetchRoutes({});
    renderWithRouter(
      <EventSelection
        events={[anEvent({ pairings: 'synced' })]}
        exclude={[]}
        include={[]}
        onChange={vi.fn()}
      />,
    );

    expect(await screen.findByRole('link', { name: 'Sample Team Open' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sync pairings/ })).not.toBeInTheDocument();
  });

  it('shows an empty-range message when there are no events', async () => {
    stubFetchRoutes({});
    renderWithRouter(<EventSelection events={[]} exclude={[]} include={[]} onChange={vi.fn()} />);

    expect(await screen.findByText('No team events in this range.')).toBeInTheDocument();
  });

  it('Select all ticks every listed event, keeping choices for events outside the list', async () => {
    stubFetchRoutes({});
    const onChange = vi.fn();
    renderWithRouter(
      <EventSelection
        events={[
          anEvent({ id: 'A', name: 'Synced Off', included: false }),
          anEvent({ id: 'B', name: 'Synced On', included: true }),
          anEvent({ id: 'C', name: 'Missing Off', pairings: 'missing', included: false }),
        ]}
        exclude={['A', 'OTHER']}
        include={['ELSEWHERE']}
        onChange={onChange}
      />,
    );
    const all = await screen.findByRole('checkbox', { name: 'Select all events' });
    expect(all).not.toBeChecked();
    expect(all).toHaveAttribute('data-indeterminate', 'true');
    fireEvent.click(all);
    expect(onChange).toHaveBeenCalledWith({ exclude: ['OTHER'], include: ['ELSEWHERE', 'C'] });
  });

  it('when everything is ticked, the header box clears them all', async () => {
    stubFetchRoutes({});
    const onChange = vi.fn();
    renderWithRouter(
      <EventSelection
        events={[
          anEvent({ id: 'A', name: 'Synced On', included: true }),
          anEvent({ id: 'C', name: 'Missing On', pairings: 'missing', included: true }),
        ]}
        exclude={[]}
        include={['C']}
        onChange={onChange}
      />,
    );
    const all = await screen.findByRole('checkbox', { name: 'Select all events' });
    expect(all).toBeChecked();
    fireEvent.click(all);
    expect(onChange).toHaveBeenCalledWith({ exclude: ['A'], include: [] });
  });
});
