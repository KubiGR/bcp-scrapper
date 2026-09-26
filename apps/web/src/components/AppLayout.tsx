import { AppShell, Container, Group } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { Link, Outlet } from '@tanstack/react-router';
import { FinderSearchSchema } from '../features/finder/finder-search';
import { QueueIndicator } from '../features/fetch-queue/QueueIndicator';
import classes from './AppLayout.module.css';

const FINDER_DEFAULTS = FinderSearchSchema.parse({});

const NAV_ITEMS = [
  { to: '/', label: 'Tournaments' },
  { to: '/analysis/matchups', label: 'Matchups' },
  { to: '/settings', label: 'Settings' },
] as const;

export function AppLayout() {
  return (
    <AppShell header={{ height: 60 }} padding="lg">
      {/* Inside the router, so a notification can link to a page. */}
      <Notifications position="bottom-right" />
      <AppShell.Header className={classes.header}>
        <Container size="xl" h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Link to="/" search={FINDER_DEFAULTS} className={classes.brand}>
              <span className={classes.brandMark} aria-hidden />
              BCP Analyzer
            </Link>
            <Group component="nav" gap="xl" wrap="nowrap" className={classes.nav}>
              <QueueIndicator />
              {NAV_ITEMS.map((item) => (
                <Link key={item.to} to={item.to} className={classes.navLink}>
                  {item.label}
                </Link>
              ))}
            </Group>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
