import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { useRefreshWhenPairingsSettle } from './useRefreshWhenPairingsSettle';

function Probe({ eventId, queued }: { eventId: string; queued: number }) {
  useRefreshWhenPairingsSettle(eventId, queued);
  return null;
}

describe('useRefreshWhenPairingsSettle', () => {
  it('invalidates the event’s queries when queued drops from >0 to 0', () => {
    const { queryClient, rerender } = renderWithProviders(<Probe eventId="EVT1" queued={2} />);
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    rerender(<Probe eventId="EVT1" queued={0} />);

    expect(spy).toHaveBeenCalledWith({ queryKey: ['event', 'EVT1'] });
  });

  it('does not invalidate while queued stays >0, or on the initial render', () => {
    const { queryClient, rerender } = renderWithProviders(<Probe eventId="EVT1" queued={2} />);
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    rerender(<Probe eventId="EVT1" queued={1} />);

    expect(spy).not.toHaveBeenCalled();
  });

  it('does not invalidate when queued starts and stays at 0', () => {
    const { queryClient, rerender } = renderWithProviders(<Probe eventId="EVT1" queued={0} />);
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    rerender(<Probe eventId="EVT1" queued={0} />);

    expect(spy).not.toHaveBeenCalled();
  });
});
