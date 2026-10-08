import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { authOff } from '../features/auth/auth-test-utils';
import { renderWithRouter, stubFetchRoutes } from '../test/render';
import { AppLayout } from './AppLayout';

describe('AppLayout', () => {
  it('shows the logo next to the site name', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/fetch-queue': null });
    renderWithRouter(<AppLayout />);
    const home = await screen.findByRole('link', { name: 'BCP Analyzer' });
    expect(home.querySelector('svg[data-logo]')).not.toBeNull();
  });

  it('lets the matchups table and the pairings chain use the whole width, other pages a centred column', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/fetch-queue': null });
    const { unmount } = renderWithRouter(<AppLayout />, '/analysis/matchups');
    const content = () => screen.getByRole('main').querySelector('.mantine-Container-root');
    await screen.findByRole('link', { name: 'BCP Analyzer' });
    expect(content()).toHaveAttribute('data-fluid');
    unmount();

    const pairings = renderWithRouter(<AppLayout />, '/pairings');
    await screen.findByRole('link', { name: 'BCP Analyzer' });
    expect(content()).toHaveAttribute('data-fluid');
    pairings.unmount();

    renderWithRouter(<AppLayout />, '/analysis/meta');
    await screen.findByRole('link', { name: 'BCP Analyzer' });
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
});
