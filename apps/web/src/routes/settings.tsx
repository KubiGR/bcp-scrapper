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
  const { tab, faction, section, focus } = Route.useSearch();
  const detachmentSection = section ?? focus;
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
        detachmentSection={detachmentSection}
        onDetachmentSectionChange={(next) => {
          void navigate({
            search: { tab: 'detachments', faction, section: next },
            replace: true,
            resetScroll: false,
          });
        }}
        onFactionChange={(next) => {
          void navigate({
            search: { tab, faction: next, section: detachmentSection },
            replace: true,
            resetScroll: false,
          });
        }}
      />
    </AdminOnly>
  );
}
