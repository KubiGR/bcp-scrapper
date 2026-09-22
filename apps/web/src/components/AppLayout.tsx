import { AppShell, Container, Group } from '@mantine/core';
import { Link, Outlet } from '@tanstack/react-router';
import classes from './AppLayout.module.css';

const NAV_ITEMS = [
  { to: '/', label: 'Tournaments' },
  { to: '/settings', label: 'Settings' },
] as const;

export function AppLayout() {
  return (
    <AppShell header={{ height: 60 }} padding="lg">
      <AppShell.Header className={classes.header}>
        <Container size="xl" h="100%">
          <Group h="100%" justify="space-between">
            <Link to="/" className={classes.brand}>
              BCP<span className={classes.brandAccent}>//</span>Analyzer
            </Link>
            <Group component="nav" gap="xl">
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
