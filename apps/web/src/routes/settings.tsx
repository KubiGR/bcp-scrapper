import { createFileRoute } from '@tanstack/react-router';
import { AdminOnly } from '../features/auth/AdminOnly';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SettingsSearchSchema } from '../features/settings/settings-search';

export const Route = createFileRoute('/settings')({
  validateSearch: SettingsSearchSchema,
  component: SettingsRoute,
});

function SettingsRoute() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AdminOnly>
      <SettingsPage
        tab={tab}
        onTabChange={(next) => {
          void navigate({ search: { tab: next }, replace: true, resetScroll: false });
        }}
      />
    </AdminOnly>
  );
}
