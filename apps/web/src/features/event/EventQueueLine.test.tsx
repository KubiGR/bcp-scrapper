import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { EventQueueLine } from './EventQueueLine';

const counts = {
  players: 8,
  teams: 4,
  listsAvailable: 7,
  listsFetched: 3,
  listsMissing: 4,
  listsQueued: 3,
  listsFailed: 1,
};

describe('EventQueueLine', () => {
  it('shows progress and lets the user cancel or retry', async () => {
    const fetchMock = stubFetchRoutes({
      'DELETE /api/events/EVT1/lists/queue': { removed: 3 },
      'POST /api/list-queue/retry-failed': { requeued: 1 },
    });
    renderWithProviders(<EventQueueLine event={anEventDetail({ counts, listQueueSeconds: 15 })} />);
    expect(
      screen.getByText(/3 queued · 3 fetched · 1 failed · about 15 s left/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel queued' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
        expect.arrayContaining(['/api/events/EVT1/lists/queue', '/api/list-queue/retry-failed']),
      );
    });
  });

  it('is hidden when nothing is queued or failed', () => {
    const { container } = renderWithProviders(<EventQueueLine event={anEventDetail()} />);
    expect(container.querySelector('[aria-live]')).toBeNull();
  });
});
