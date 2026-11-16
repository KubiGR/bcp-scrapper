import { createFileRoute } from '@tanstack/react-router';
import { AdminOnly } from '../features/auth/AdminOnly';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SettingsSearchSchema } from '../features/settings/settings-search';
import { usePageTitle } from '../lib/page-title';

export const Route = createFileRoute('/settings')({
  validateSearch: SettingsSearchSchema,
  component: SettingsRoute,
});

function SettingsRoute() {
  const { tab, faction, focus } = Route.useSearch();
  const navigate = Route.useNavigate();
  usePageTitle('Settings');
  return (
    <AdminOnly>
      <SettingsPage
        tab={tab}
        onTabChange={(next) => {
          void navigate({ search: { tab: next }, replace: true, resetScroll: false });
        }}
        faction={faction}
        focus={focus}
        onFactionChange={(next) => {
          // A faction picked by hand: no more jumping to a section.
          void navigate({
            search: { tab, faction: next },
            replace: true,
            resetScroll: false,
          });
        }}
      />
    </AdminOnly>
  );
}
