import type { DetachmentNamesResponse } from '@bcp/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { pickOption } from '../../test/pick-option';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aUser, authOff, loggedIn } from '../auth/auth-test-utils';
import { DetachmentNamesCard } from './DetachmentNamesCard';
import { detachmentNamesQuery } from './detachment-names-queries';

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
  ignored: [],
  learned: [{ name: 'Cabalgata Sangrienta', target: 'Blood Legion', factions: ['Chaos Daemons'] }],
  targets: [
    { name: 'Blood Legion', factions: ['Chaos Daemons'], bsdata: false },
    { name: 'Shadow Legion', factions: ['Chaos Daemons'], bsdata: false },
    { name: 'War Horde', factions: ['Orks'], bsdata: false },
  ],
  links: [
    { name: 'Die Macht der Moritoi', target: 'Might of the Moritoi', factions: ['Grey Knights'] },
    { name: 'Der Kriegshaufen', target: 'War Horde', factions: ['Orks'] },
  ],
  bsdataFactions: [],
  wrong: [],
  kept: [],
  ...overrides,
});

const rowOf = (name: string) => {
  const row = screen.getByText(name).closest('article');
  if (row === null) throw new Error(`no card ${name}`);
  return row;
};

describe('DetachmentNamesCard with known detachments', () => {
  const orksOnly = (overrides: Partial<DetachmentNamesResponse> = {}) =>
    names({
      unsure: [{ name: 'Horda de Guerra', lists: 4, factions: ['Orks'] }],
      foreign: [],
      learned: [],
      links: [],
      bsdataFactions: ['Orks'],
      targets: [
        { name: 'Kult of Speed', factions: ['Orks'], bsdata: true },
        { name: 'War Horde', factions: ['Orks'], bsdata: true },
        { name: 'Waaagh Band', factions: ['Orks'], bsdata: false },
      ],
      ...overrides,
    });

  it('shows the GW app’s detachments as a covered faction’s known ones', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/detachments': orksOnly() });
    renderWithProviders(<DetachmentNamesCard />);
    const known = within(await screen.findByRole('list', { name: 'Known Orks detachments' }));
    expect(known.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Kult of Speed',
      'War Horde',
    ]);
  });

  it('ignores a pair outside the faction, and shows what is kept and what is ignored', async () => {
    const withPairs = orksOnly({
      wrong: [{ faction: 'Orks', name: 'Wreckas', lists: 2, bsdataFactions: [] }],
      kept: [
        { faction: 'Orks', name: 'Dread Mob', ignored: false },
        { faction: 'Orks', name: 'Bully Boyz', ignored: true },
      ],
    });
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': withPairs,
      'POST /api/detachments/keeps': withPairs,
    });
    renderWithProviders(<DetachmentNamesCard section="outside" />);
    const section = within(await screen.findByRole('region', { name: 'Not in this faction' }));
    expect(section.queryByText('kept for Orks')).not.toBeInTheDocument();
    fireEvent.click(section.getByRole('button', { name: 'Kept and ignored (2)' }));
    expect(await section.findByText('kept for Orks')).toBeInTheDocument();
    expect(section.getByText('ignored for Orks')).toBeInTheDocument();
    fireEvent.click(section.getByRole('button', { name: 'Ignore Wreckas for Orks' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      faction: 'Orks',
      name: 'Wreckas',
      ignored: true,
    });
  });

  it('groups one detachment across factions: one row, kept or ignored for all of them', async () => {
    const pairs = names({
      wrong: [
        {
          faction: 'Space Marines (Astartes)',
          name: 'Librarius Conclave',
          lists: 381,
          bsdataFactions: [],
        },
        { faction: 'Dark Angels', name: 'Librarius Conclave', lists: 59, bsdataFactions: [] },
        { faction: 'Orks', name: 'More Dakka!', lists: 51, bsdataFactions: [] },
      ],
    });
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': pairs,
      'POST /api/detachments/keeps': pairs,
    });
    renderWithProviders(
      <DetachmentNamesCard faction="all" section="outside" onFactionChange={vi.fn()} />,
    );
    const section = within(await screen.findByRole('region', { name: 'Not in this faction' }));
    expect(section.getByText('Librarius Conclave · 440 lists')).toBeInTheDocument();
    expect(section.getByText('Space Marines (Astartes) 381, Dark Angels 59')).toBeInTheDocument();
    fireEvent.click(
      section.getByRole('button', { name: 'Keep Librarius Conclave for all its factions' }),
    );
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2);
    });
    const bodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(init?.body as string) as { faction: string });
    expect(bodies.map((b) => b.faction).sort()).toEqual([
      'Dark Angels',
      'Space Marines (Astartes)',
    ]);
  });

  it('opens the out-of-faction tab directly using the to-do menu’s cached data', async () => {
    const pairs = names({
      wrong: [
        { faction: 'Orks', name: 'Wreckas', lists: 2, bsdataFactions: [] },
        { faction: 'Chaos Daemons', name: 'Kult of Speed', lists: 1, bsdataFactions: ['Orks'] },
      ],
    });
    const fetch = stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/detachments': pairs });
    const onFactionChange = vi.fn();
    const { queryClient, rerender } = renderWithProviders(<div />);
    queryClient.setQueryData(detachmentNamesQuery.queryKey, pairs);
    rerender(
      <DetachmentNamesCard faction="all" section="outside" onFactionChange={onFactionChange} />,
    );

    expect(screen.getByRole('tab', { name: 'Out of faction' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const section = within(screen.getByRole('region', { name: 'Not in this faction' }));
    expect(section.getByText('Wreckas · 2 lists')).toBeInTheDocument();
    expect(section.getByText('Kult of Speed · 1 list')).toBeInTheDocument();
    expect(screen.queryByText('Cabalgata del Caos')).not.toBeInTheDocument();

    await pickOption('Faction', 'Orks (1)');
    expect(onFactionChange).toHaveBeenCalledWith('Orks');
    expect(fetch.mock.calls.some(([url]) => url === '/api/detachments')).toBe(false);
  });

  it('lists detachments outside the faction’s known list, to keep anyway or undo', async () => {
    const withPairs = orksOnly({
      wrong: [
        { faction: 'Orks', name: 'Wreckas', lists: 2, bsdataFactions: [] },
        { faction: 'Orks', name: 'Blood Legion', lists: 1, bsdataFactions: ['Chaos Daemons'] },
      ],
      kept: [
        { faction: 'Orks', name: 'Dread Mob', ignored: false },
        { faction: 'Orks', name: 'Bully Boyz', ignored: true },
      ],
    });
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': withPairs,
      'POST /api/detachments/keeps': withPairs,
      'DELETE /api/detachments/keeps': withPairs,
    });
    renderWithProviders(<DetachmentNamesCard section="outside" />);
    const section = within(await screen.findByRole('region', { name: 'Not in this faction' }));
    expect(section.getByText('Wreckas · 2 lists')).toBeInTheDocument();
    fireEvent.click(section.getByRole('button', { name: 'Kept and ignored (2)' }));
    expect(section.getByText('The GW app doesn’t list it')).toBeInTheDocument();
    expect(section.getByText('The GW app has it for Chaos Daemons')).toBeInTheDocument();
    fireEvent.click(section.getByRole('button', { name: 'Keep Wreckas for Orks' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ faction: 'Orks', name: 'Wreckas' });
    fireEvent.click(await section.findByRole('button', { name: 'Undo keep Dread Mob for Orks' }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            init?.method === 'DELETE' &&
            JSON.stringify(url).includes('/api/detachments/keeps/Orks/Dread%20Mob'),
        ),
      ).toBe(true);
    });
  });
});

describe('DetachmentNamesCard', () => {
  it('lists the names BCP doesn’t use, with how many lists and which factions', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/detachments': names() });
    renderWithProviders(<DetachmentNamesCard />);
    fireEvent.click(await screen.findByRole('combobox', { name: 'Faction' }));
    fireEvent.click(await screen.findByRole('option', { name: 'All factions' }));
    const row = within(
      rowOf(await screen.findByText('Cabalgata del Caos').then(() => 'Cabalgata del Caos')),
    );
    expect(row.getByText('6 lists')).toBeInTheDocument();
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

  it('advances to the next army after the final out-of-faction to-do', async () => {
    const first = { faction: 'Chaos Daemons', name: 'Wreckas', lists: 2, bsdataFactions: [] };
    const second = { ...first, name: 'Blood Legion' };
    const next = { ...first, faction: 'Orks', name: 'Kult of Speed' };
    const data = names({ wrong: [first, second, next] });
    let finishFirst: (response: Response) => void = () => undefined;
    let finishSecond: (response: Response) => void = () => undefined;
    const fetch = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': data,
      'POST /api/detachments/keeps': (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          const { name } = JSON.parse(init?.body as string) as { name: string };
          if (name === first.name) finishFirst = resolve;
          else finishSecond = resolve;
        }),
    });
    renderWithProviders(<DetachmentNamesCard section="outside" />);
    const faction = await screen.findByRole('combobox', { name: 'Faction' });
    expect(faction).toHaveValue('Chaos Daemons (2)');
    fireEvent.click(screen.getByRole('button', { name: 'Ignore Wreckas for Chaos Daemons' }));
    await waitFor(() => {
      expect(faction).toHaveValue('Chaos Daemons (1)');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ignore Blood Legion for Chaos Daemons' }));
    expect(await screen.findByText('Kult of Speed · 2 lists')).toBeInTheDocument();
    expect(faction).toHaveValue('Orks (1)');
    finishFirst(Response.json({ ...data, wrong: [second, next] }));
    await waitFor(() => {
      expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2);
    });
    finishSecond(Response.json({ ...data, wrong: [next] }));
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('offers to see the lists behind each name', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/detachments': names() });
    renderWithProviders(<DetachmentNamesCard />);
    await screen.findByText('Cabalgata del Caos');
    const row = within(rowOf('Cabalgata del Caos'));
    expect(
      row.getByRole('button', { name: 'See lists using Cabalgata del Caos' }),
    ).toBeInTheDocument();
  });

  it('sorts the names by the order picked', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/detachments': names() });
    renderWithProviders(<DetachmentNamesCard />);
    await screen.findByText('Cabalgata del Caos');
    const list = screen.getAllByRole('list', { name: 'Names' })[0];
    if (list === undefined) throw new Error('no names');
    const order = () =>
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('p')?.textContent);
    expect(order()).toEqual(['Cabalgata del Caos', 'Legion de Sangre']);
    await pickOption('Sort names by', 'Name A–Z');
    expect(order()).toEqual(['Cabalgata del Caos', 'Legion de Sangre']);
    await pickOption('Sort names by', 'Most lists');
    expect(order()[0]).toBeDefined();
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

  it('removes rows immediately and saves clicks in order across different kinds of edits', async () => {
    let finishFirst: (response: Response) => void = () => undefined;
    let finishSecond: (response: Response) => void = () => undefined;
    const first = 'Cabalgata del Caos';
    const outside = { faction: 'Chaos Daemons', name: 'Wreckas', lists: 2, bsdataFactions: [] };
    const data = names({
      unsure: names().unsure.filter((entry) => entry.name === first),
      wrong: [outside],
    });
    const writes: string[] = [];
    stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': data,
      'POST /api/detachments/links': () =>
        new Promise<Response>((resolve) => {
          writes.push('link');
          finishFirst = resolve;
        }),
      'POST /api/detachments/keeps': () =>
        new Promise<Response>((resolve) => {
          writes.push('keep');
          finishSecond = resolve;
        }),
    });
    renderWithProviders(<DetachmentNamesCard />);
    const faction = await screen.findByRole('combobox', { name: 'Faction' });
    fireEvent.click(screen.getByRole('button', { name: `${first} is not in English` }));
    await waitFor(() => {
      expect(screen.queryByText(first)).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Out of faction' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep Wreckas for Chaos Daemons' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 edits to save'));
    expect(screen.queryByText(first)).not.toBeInTheDocument();
    expect(screen.queryByText('Wreckas · 2 lists')).not.toBeInTheDocument();
    expect(faction).toHaveValue('Chaos Daemons (0)');
    expect(writes).toEqual(['link']);

    const afterFirst = { ...data, unsure: [] };
    finishFirst(Response.json(afterFirst));
    await waitFor(() => {
      expect(writes).toEqual(['link', 'keep']);
    });
    expect(screen.queryByText('Wreckas · 2 lists')).not.toBeInTheDocument();
    finishSecond(Response.json({ ...afterFirst, wrong: [] }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('restores an edit that failed and reports it while the queue continues', async () => {
    const first = 'Cabalgata del Caos';
    const second = 'Legion de Sangre';
    let finishFirst: (response: Response) => void = () => undefined;
    let finishSecond: (response: Response) => void = () => undefined;
    const saves: string[] = [];
    stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': names(),
      'POST /api/detachments/links': (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          const { name } = JSON.parse(init?.body as string) as { name: string };
          saves.push(name);
          if (name === first) finishFirst = resolve;
          else finishSecond = resolve;
        }),
    });
    renderWithProviders(<DetachmentNamesCard />);
    await screen.findByRole('combobox', { name: 'Faction' });
    fireEvent.click(screen.getByRole('button', { name: `${first} is its own detachment` }));
    fireEvent.click(screen.getByRole('button', { name: `${second} is its own detachment` }));
    await waitFor(() => {
      expect(saves).toEqual([first]);
    });
    finishFirst(Response.json({}, { status: 500 }));
    await waitFor(() => {
      expect(saves).toEqual([first, second]);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(first);
    const afterSecond = names({ unsure: names().unsure.filter((entry) => entry.name !== second) });
    finishSecond(Response.json(afterSecond));
    await pickOption('Faction', 'Chaos Daemons (1)');
    expect(screen.getByRole('button', { name: `${first} is its own detachment` })).toBeEnabled();
    expect(screen.queryByText(second)).not.toBeInTheDocument();
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

  it('ignores a junk name, and lists the ignored apart to undo', async () => {
    const junk = 'See my notes below';
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': names({
        ignored: [{ name: junk, lists: 1, factions: ['Chaos Daemons'] }],
      }),
      'POST /api/detachments/links': names(),
      'DELETE /api/detachments/links/': names(),
    });
    renderWithProviders(<DetachmentNamesCard />);
    const ignored = within(await screen.findByRole('region', { name: 'Ignored' }));
    fireEvent.click(ignored.getByRole('button', { name: `Undo Ignore for ${junk}` }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ignore Cabalgata del Caos' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      name: 'Cabalgata del Caos',
      target: null,
      foreign: false,
      ignored: true,
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

  it('lists what was learned from BCP, and undoes a wrong one with Not the same', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/detachments': names(),
      'POST /api/detachments/links': names({ learned: [] }),
    });
    renderWithProviders(<DetachmentNamesCard />);
    const learned = within(await screen.findByRole('region', { name: 'Learned from BCP' }));
    expect(learned.getByText('Cabalgata Sangrienta')).toBeInTheDocument();
    expect(learned.getByText('Blood Legion')).toBeInTheDocument();
    fireEvent.click(
      learned.getByRole('button', { name: 'Cabalgata Sangrienta is not Blood Legion' }),
    );
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      name: 'Cabalgata Sangrienta',
      target: null,
      foreign: false,
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
    expect(await screen.findByText('No detachment names to link.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Only admins can link detachment names.')).toBeInTheDocument();
    });
  });
});
