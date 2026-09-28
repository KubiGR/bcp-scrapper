import { AppShell, Burger, Container, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Notifications } from '@mantine/notifications';
import { Link, Outlet } from '@tanstack/react-router';
import { FinderSearchSchema } from '../features/finder/finder-search';
import { AccountMenu } from '../features/auth/AccountMenu';
import { QueueIndicator } from '../features/fetch-queue/QueueIndicator';
import classes from './AppLayout.module.css';

const FINDER_DEFAULTS = FinderSearchSchema.parse({});

const NAV_ITEMS = [
  { to: '/', label: 'Tournaments' },
  { to: '/analysis/matchups', label: 'Matchups' },
  { to: '/analysis/meta', label: 'Meta' },
  { to: '/analysis/top-lists', label: 'Top lists' },
  { to: '/settings', label: 'Settings' },
] as const;

/** Pages in the header on wide screens; on narrower ones, behind a menu button. */
const NAV_BREAKPOINT = 'md';

export function AppLayout() {
  const [menuOpen, menu] = useDisclosure(false);
  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 240,
        breakpoint: NAV_BREAKPOINT,
        collapsed: { mobile: !menuOpen, desktop: true },
      }}
      padding={{ base: 'sm', sm: 'lg' }}
    >
      {/* Inside the router, so a notification can link to a page. */}
      <Notifications position="bottom-right" />
      <AppShell.Header className={classes.header}>
        <Container size="xl" h="100%" px={{ base: 'sm', sm: 'md' }}>
          <Group h="100%" justify="space-between" wrap="nowrap" gap="sm">
            <Group gap="xs" wrap="nowrap">
              <Burger
                opened={menuOpen}
                onClick={menu.toggle}
                hiddenFrom={NAV_BREAKPOINT}
                size="sm"
                className={classes.burger}
                aria-label="Open menu"
                aria-expanded={menuOpen}
              />
              <Link to="/" search={FINDER_DEFAULTS} className={classes.brand} onClick={menu.close}>
                <span className={classes.brandMark} aria-hidden />
                BCP Analyzer
              </Link>
            </Group>
            <Group gap="xl" wrap="nowrap" className={classes.actions}>
              <QueueIndicator />
              <Group
                component="nav"
                aria-label="Main"
                gap="xl"
                wrap="nowrap"
                visibleFrom={NAV_BREAKPOINT}
              >
                {NAV_ITEMS.map((item) => (
                  <Link key={item.to} to={item.to} className={classes.navLink}>
                    {item.label}
                  </Link>
                ))}
              </Group>
              <AccountMenu />
            </Group>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Navbar component="nav" aria-label="Pages" className={classes.menu} p="xs">
        {NAV_ITEMS.map((item) => (
          <Link key={item.to} to={item.to} className={classes.menuLink} onClick={menu.close}>
            {item.label}
          </Link>
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        <Container size="xl" px={{ base: 0, sm: 'md' }}>
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
