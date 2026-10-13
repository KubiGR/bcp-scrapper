import { Anchor, Badge, Popover, Stack, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { detachmentNamesQuery } from '../settings/detachment-names-queries';
import { isAdminView, meQuery, usersQuery } from './auth-queries';

const SITE_TITLE = 'Logis';
const EVERY_FEW_MINUTES = 3 * 60_000;

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/**
 * An admin's work left, in the header and the tab's title ("(6) Logis"): people waiting for
 * approval (the ignored left out; only through Cloudflare Access), detachment names to link and
 * detachments outside their faction. Each links to Settings, where it's done.
 */
export function AdminTodo() {
  const me = useQuery(meQuery);
  const admin = isAdminView(me.data);
  const approving = admin && me.data?.access === true;
  const users = useQuery({ ...usersQuery, enabled: approving, refetchInterval: EVERY_FEW_MINUTES });
  const names = useQuery({
    ...detachmentNamesQuery,
    enabled: admin,
    refetchInterval: EVERY_FEW_MINUTES,
  });

  const waiting = approving
    ? (users.data?.users ?? []).filter((u) => u.disabled && !u.ignored).length
    : 0;
  const unlinked = names.data?.unsure.length ?? 0;
  const outside = names.data?.wrong.length ?? 0;
  const total = admin ? waiting + unlinked + outside : 0;

  // The tab shows the count too, so it's seen from another tab.
  useEffect(() => {
    document.title = total > 0 ? `(${String(total)}) ${SITE_TITLE}` : SITE_TITLE;
  }, [total]);

  if (total === 0) return null;
  const items = [
    { count: waiting, label: plural(waiting, 'waiting for approval', 'waiting for approval') },
    {
      count: unlinked,
      label: plural(unlinked, 'detachment name to link', 'detachment names to link'),
    },
    {
      count: outside,
      label: plural(outside, 'detachment outside its faction', 'detachments outside their faction'),
    },
  ].filter((item) => item.count > 0);

  return (
    <Popover position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <UnstyledButton aria-label={plural(total, 'thing to do', 'things to do')}>
          <Badge
            color="yellow"
            variant="filled"
            size="sm"
            // Dark text: white on yellow can't be read.
            c="dark.9"
            style={{ cursor: 'pointer' }}
          >
            {total} to do
          </Badge>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          {items.map((item) => (
            <Anchor key={item.label} component={Link} to="/settings" size="sm">
              {item.label}
            </Anchor>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
