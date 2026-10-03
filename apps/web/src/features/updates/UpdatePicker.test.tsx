import type { GameUpdate } from '@bcp/shared';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { UpdatePicker } from './UpdatePicker';

const update = (id: string, start: string, name: string): GameUpdate => ({
  id,
  name,
  autoName: name,
  start,
  autoStart: start,
  merged: false,
  hidden: false,
  events: 3,
  summary: id === 'b' ? 'Orks, Tyranids' : '',
  suggestions: [name],
});
const updates = {
  updates: [
    update('c', '2026-09-30', 'Sep 2026 · MFM'),
    update('b', '2026-07-22', 'Jul 2026 · Faction Packs'),
    update('a', '2026-06-09', 'Jun 2026 · MFM'),
  ],
};

const open = async () => {
  fireEvent.click(await screen.findByRole('combobox', { name: 'Update' }));
};

describe('UpdatePicker', () => {
  it('sets the dates to a picked update’s days', async () => {
    stubFetchRoutes({ 'GET /api/updates': updates });
    const onChange = vi.fn();
    renderWithProviders(<UpdatePicker from="2026-01-01" to="2026-02-01" onChange={onChange} />);
    expect(await screen.findByPlaceholderText('Custom dates')).toBeInTheDocument();
    await open();
    fireEvent.click(screen.getByRole('option', { name: /^Jul 2026 · Faction Packs/ }));
    expect(onChange).toHaveBeenCalledWith({ from: '2026-07-22', to: '2026-09-29' });
  });

  it('shows the updates a range covers, and spans the gap when more are picked', async () => {
    stubFetchRoutes({ 'GET /api/updates': updates });
    const onChange = vi.fn();
    renderWithProviders(<UpdatePicker from="2026-06-09" to="2026-07-21" onChange={onChange} />);
    await open();
    expect(screen.getByRole('option', { name: 'Jun 2026 · MFM' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.click(screen.getByRole('option', { name: 'Current: Sep 2026 · MFM' }));
    // Up to the current update: no end date, so a saved link keeps up with new events.
    expect(onChange).toHaveBeenCalledWith({ from: '2026-06-09', to: undefined });
  });

  it('says which factions each update touched', async () => {
    stubFetchRoutes({ 'GET /api/updates': updates });
    renderWithProviders(<UpdatePicker from="2026-01-01" to="2026-02-01" onChange={vi.fn()} />);
    await open();
    expect(screen.getByRole('option', { name: /Jul 2026 · Faction Packs/ })).toHaveTextContent(
      'Orks, Tyranids',
    );
  });

  it('calls the update in force today Current, and a later one Upcoming', async () => {
    stubFetchRoutes({
      'GET /api/updates': {
        updates: [update('z', '2099-01-01', 'Far future'), ...updates.updates],
      },
    });
    renderWithProviders(<UpdatePicker from="2026-01-01" to="2026-02-01" onChange={vi.fn()} />);
    await open();
    expect(screen.getByRole('option', { name: /^Current: Sep 2026 · MFM/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^Upcoming: Far future/ })).toBeInTheDocument();
  });

  it('shows no picker without updates', async () => {
    stubFetchRoutes({ 'GET /api/updates': { updates: [] } });
    renderWithProviders(
      <>
        <UpdatePicker from="2026-06-09" to="2026-07-21" onChange={vi.fn()} />
        <span>done</span>
      </>,
    );
    await screen.findByText('done');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('combobox', { name: 'Update' })).not.toBeInTheDocument();
  });
});
