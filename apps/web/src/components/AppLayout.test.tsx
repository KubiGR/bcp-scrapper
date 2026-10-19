import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { aUser, authOff, loggedIn } from '../features/auth/auth-test-utils';
import { renderWithRouter, stubFetchRoutes } from '../test/render';
import { AppLayout } from './AppLayout';

describe('AppLayout', () => {
  it('shows the logo next to the site name', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/fetch-queue': null });
    renderWithRouter(<AppLayout />);
    const home = await screen.findByRole('link', { name: 'Logis' });
    expect(home.querySelector('svg[data-logo]')).not.toBeNull();
  });

  it('lets the matchups table and the pairings chain use the whole width, other pages a centred column', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/fetch-queue': null });
    const { unmount } = renderWithRouter(<AppLayout />, '/analysis/matchups');
    const content = () => screen.getByRole('main').querySelector('.mantine-Container-root');
    await screen.findByRole('link', { name: 'Logis' });
    expect(content()).toHaveAttribute('data-fluid');
    unmount();

    const pairings = renderWithRouter(<AppLayout />, '/pairings');
    await screen.findByRole('link', { name: 'Logis' });
    expect(content()).toHaveAttribute('data-fluid');
    pairings.unmount();

    renderWithRouter(<AppLayout />, '/analysis/meta');
    await screen.findByRole('link', { name: 'Logis' });
    expect(content()).not.toHaveAttribute('data-fluid');
  });

  it('opens the page menu from the menu button on phones, and closes it on a pick', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/fetch-queue': null });
    renderWithRouter(<AppLayout />);
    const toggle = await screen.findByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const menu = within(screen.getByRole('navigation', { name: 'Pages' }));
    fireEvent.click(menu.getByRole('link', { name: 'Meta' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('credits Games Workshop for the faction names and imagery, in a footer', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/fetch-queue': null });
    renderWithRouter(<AppLayout />);
    expect(await screen.findByRole('contentinfo')).toHaveTextContent(
      'Unofficial fan-made tool. Not affiliated with, endorsed or sponsored by Games Workshop. Faction names and imagery © Games Workshop.',
    );
  });

  it('signs the site: "by Andreas Dranidis" next to the name', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/fetch-queue': null });
    renderWithRouter(<AppLayout />);
    await screen.findByRole('link', { name: 'Logis' });
    expect(screen.getByText('by Andreas Dranidis')).toBeInTheDocument();
  });

  it('shows Pairings to admins and to members given it, not to other members', async () => {
    const pairingsLinks = async (user: ReturnType<typeof aUser>) => {
      stubFetchRoutes({ 'GET /api/auth/me': loggedIn(user), 'GET /api/fetch-queue': null });
      const view = renderWithRouter(<AppLayout />);
      await screen.findByRole('link', { name: 'Logis' });
      // Let /me arrive before counting.
      await screen.findAllByRole('link', { name: 'Tournaments' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const count = screen.queryAllByRole('link', { name: 'Pairings' }).length;
      view.unmount();
      return count;
    };
    expect(await pairingsLinks(aUser({ role: 'admin' }))).toBeGreaterThan(0);
    expect(await pairingsLinks(aUser({ role: 'member', canPair: true }))).toBeGreaterThan(0);
    expect(await pairingsLinks(aUser({ role: 'member', canPair: false }))).toBe(0);
  });

  it('shows Settings to admins only (and to everyone when logins are off)', async () => {
    const settingsLinks = async (me: Parameters<typeof stubFetchRoutes>[0][string]) => {
      stubFetchRoutes({ 'GET /api/auth/me': me, 'GET /api/fetch-queue': null });
      const view = renderWithRouter(<AppLayout />);
      await screen.findAllByRole('link', { name: 'Tournaments' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const count = screen.queryAllByRole('link', { name: 'Settings' }).length;
      view.unmount();
      return count;
    };
    expect(await settingsLinks(loggedIn(aUser({ role: 'admin' })))).toBeGreaterThan(0);
    expect(await settingsLinks(authOff)).toBeGreaterThan(0);
    expect(await settingsLinks(loggedIn(aUser({ role: 'member', canPair: true })))).toBe(0);
    // The fetch queue too: its page and the status in the header.
    stubFetchRoutes({
      'GET /api/auth/me': loggedIn(aUser({ role: 'member' })),
      'GET /api/fetch-queue': null,
    });
    renderWithRouter(<AppLayout />);
    await screen.findAllByRole('link', { name: 'Tournaments' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryAllByRole('link', { name: 'Queue' })).toHaveLength(0);
  });
});
