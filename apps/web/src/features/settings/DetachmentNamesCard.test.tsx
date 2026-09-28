import type { DetachmentNamesResponse } from '@bcp/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aUser, authOff, loggedIn } from '../auth/auth-test-utils';
import { DetachmentNamesCard } from './DetachmentNamesCard';

const names = (overrides: Partial<DetachmentNamesResponse> = {}): DetachmentNamesResponse => ({
  unsure: [
    { name: 'Cabalgata del Caos', lists: 6, factions: ['Chaos Daemons'] },
    { name: 'Horda de Guerra', lists: 4, factions: ['Orks'] },
    { name: 'Legion de Sangre', lists: 2, factions: ['Chaos Daemons'] },
  ],
  foreign: [
    { name: 'Legión Sangrienta', lists: 3, factions: ['Chaos Daemons'], marked: false },
    { name: 'Arrazadorez', lists: 1, factions: ['Orks'], marked: true },
  ],
  targets: [
    { name: 'Blood Legion', factions: ['Chaos Daemons'] },
    { name: 'Shadow Legion', factions: ['Chaos Daemons'] },
    { name: 'War Horde', factions: ['Orks'] },
  ],
  links: [
    { name: 'Die Macht der Moritoi', target: 'Might of the Moritoi', factions: ['Grey Knights'] },
    { name: 'Der Kriegshaufen', target: 'War Horde', factions: ['Orks'] },
  ],
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
    fireEvent.click(await screen.findByRole('combobox', { name: 'Faction' }));
    fireEvent.click(await screen.findByRole('option', { name: 'All factions' }));
    const row = within(
      rowOf(await screen.findByText('Cabalgata del Caos').then(() => 'Cabalgata del Caos')),
    );
    expect(row.getByText('6')).toBeInTheDocument();
    expect(row.getByText('Chaos Daemons')).toBeInTheDocument();
  });

  it('starts on the faction with the most unsure names, next to its known detachments', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/detachments': names() });
    renderWithProviders(<DetachmentNamesCard />);
    expect(await screen.findByRole('combobox', { name: 'Faction' })).toHaveValue(
      'Chaos Daemons (2)',
    );
    expect(screen.getByText('Legion de Sangre')).toBeInTheDocument();
    expect(screen.queryByText('Horda de Guerra')).not.toBeInTheDocument();
    const known = within(screen.getByRole('list', { name: 'Known Chaos Daemons detachments' }));
    expect(known.getByText('Blood Legion')).toBeInTheDocument();
    expect(known.getByText('Shadow Legion')).toBeInTheDocument();
    expect(known.queryByText('War Horde')).not.toBeInTheDocument();
  });

  it('switches faction, offering only that faction’s detachments and links', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/detachments': names() });
    renderWithProviders(<DetachmentNamesCard />);
    fireEvent.click(await screen.findByRole('combobox', { name: 'Faction' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Orks (1)' }));
    const row = within(
      rowOf(await screen.findByText('Horda de Guerra').then(() => 'Horda de Guerra')),
    );
    expect(screen.queryByText('Cabalgata del Caos')).not.toBeInTheDocument();
    expect(screen.getByText('Der Kriegshaufen')).toBeInTheDocument();
    expect(screen.queryByText('Die Macht der Moritoi')).not.toBeInTheDocument();
    fireEvent.click(row.getByRole('combobox', { name: 'Link Horda de Guerra to' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['War Horde']);
  });

  it('shows everything under All factions', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/detachments': names() });
    renderWithProviders(<DetachmentNamesCard />);
    fireEvent.click(await screen.findByRole('combobox', { name: 'Faction' }));
    fireEvent.click(await screen.findByRole('option', { name: 'All factions' }));
    expect(await screen.findByText('Horda de Guerra')).toBeInTheDocument();
    expect(screen.getByText('Cabalgata del Caos')).toBeInTheDocument();
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
      foreign: false,
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
      foreign: false,
    });
  });

  it('marks a name as not English', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': names(),
      'POST /api/detachments/links': names(),
    });
    renderWithProviders(<DetachmentNamesCard />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cabalgata del Caos is not in English' }),
    );
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      name: 'Cabalgata del Caos',
      target: null,
      foreign: true,
    });
  });

  it('lists the faction’s names that aren’t English apart, and can say one is English', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': names(),
      'POST /api/detachments/links': names(),
    });
    renderWithProviders(<DetachmentNamesCard />);
    const section = within(await screen.findByRole('region', { name: 'Not in English' }));
    expect(section.queryByText('Arrazadorez')).not.toBeInTheDocument();
    const row = within(rowOf('Legión Sangrienta'));
    expect(row.queryByRole('button', { name: /Undo/ })).not.toBeInTheDocument();
    fireEvent.click(row.getByRole('button', { name: 'Legión Sangrienta is English' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      name: 'Legión Sangrienta',
      target: null,
      foreign: false,
    });
  });

  it('undoes a name marked as not English', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': names(),
      'DELETE /api/detachments/links/': names(),
    });
    renderWithProviders(<DetachmentNamesCard />);
    fireEvent.click(await screen.findByRole('combobox', { name: 'Faction' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Orks (1)' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Undo Not English for Arrazadorez' }),
    );
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
    });
  });

  it('undoes a link', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': names(),
      'DELETE /api/detachments/links/': names({ links: [] }),
    });
    renderWithProviders(<DetachmentNamesCard />);
    // A faction with links but no unsure names left is still in the picker.
    fireEvent.click(await screen.findByRole('combobox', { name: 'Faction' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Grey Knights (0)' }));
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
