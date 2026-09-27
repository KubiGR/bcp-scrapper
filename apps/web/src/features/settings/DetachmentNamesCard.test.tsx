import type { DetachmentNamesResponse } from '@bcp/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aUser, authOff, loggedIn } from '../auth/auth-test-utils';
import { DetachmentNamesCard } from './DetachmentNamesCard';

const names = (overrides: Partial<DetachmentNamesResponse> = {}): DetachmentNamesResponse => ({
  unsure: [{ name: 'Cabalgata del Caos', lists: 6, factions: ['Chaos Daemons'] }],
  targets: [
    { name: 'Blood Legion', factions: ['Chaos Daemons'] },
    { name: 'War Horde', factions: ['Orks'] },
  ],
  links: [{ name: 'Die Macht der Moritoi', target: 'Might of the Moritoi' }],
  ...overrides,
});

const rowOf = (name: string) => {
  const row = screen.getByText(name).closest('tr');
  if (row === null) throw new Error(`no row ${name}`);
  return row;
};

describe('DetachmentNamesCard', () => {
  it('lists the names BCP doesn’t use, with how many lists and which factions', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/detachments': names() });
    renderWithProviders(<DetachmentNamesCard />);
    const row = within(
      rowOf(await screen.findByText('Cabalgata del Caos').then(() => 'Cabalgata del Caos')),
    );
    expect(row.getByText('6')).toBeInTheDocument();
    expect(row.getByText('Chaos Daemons')).toBeInTheDocument();
    expect(screen.getByText('Die Macht der Moritoi')).toBeInTheDocument();
    expect(screen.getByText('Might of the Moritoi')).toBeInTheDocument();
  });

  it('links a name to a detachment, offering that faction’s detachments first', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': names(),
      'POST /api/detachments/links': names({ unsure: [] }),
    });
    renderWithProviders(<DetachmentNamesCard />);
    const row = within(
      rowOf(await screen.findByText('Cabalgata del Caos').then(() => 'Cabalgata del Caos')),
    );
    fireEvent.click(row.getByRole('combobox', { name: 'Link Cabalgata del Caos to' }));
    const options = await screen.findAllByRole('option');
    expect(options[0]?.textContent).toBe('Blood Legion');
    fireEvent.click(screen.getByRole('option', { name: 'Blood Legion' }));
    fireEvent.click(row.getByRole('button', { name: 'Link' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      name: 'Cabalgata del Caos',
      target: 'Blood Legion',
    });
  });

  it('marks a name as its own detachment', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': names(),
      'POST /api/detachments/links': names({ unsure: [] }),
    });
    renderWithProviders(<DetachmentNamesCard />);
    await screen.findByText('Cabalgata del Caos');
    fireEvent.click(
      screen.getByRole('button', { name: 'Cabalgata del Caos is its own detachment' }),
    );
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      name: 'Cabalgata del Caos',
      target: null,
    });
  });

  it('undoes a link', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': names(),
      'DELETE /api/detachments/links/': names({ links: [] }),
    });
    renderWithProviders(<DetachmentNamesCard />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Undo link for Die Macht der Moritoi' }),
    );
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
    });
  });

  it('says when there is nothing to link, and is read-only for members', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': loggedIn(aUser({ role: 'member' })),
      'GET /api/detachments': names({ unsure: [] }),
    });
    renderWithProviders(<DetachmentNamesCard />);
    expect(await screen.findByText('Every detachment name is known.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Only admins can link detachment names.')).toBeInTheDocument();
    });
  });
});
