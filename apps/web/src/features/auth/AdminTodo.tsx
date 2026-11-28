import { Anchor, Popover, Stack, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
  DETACHMENT_NAMES_REFRESH_MS,
  detachmentNamesQuery,
} from '../settings/detachment-names-queries';
import { ALL_FACTIONS } from '../settings/settings-search';
import classes from './AdminTodo.module.css';
import { isAdminView, meQuery, usersQuery } from './auth-queries';
import { useTitleCount } from '../../lib/page-title';

const EVERY_FEW_MINUTES = 3 * 60_000;

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

const ICON = {
  width: 11,
  height: 11,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** People to approve. */
function PersonIcon() {
  return (
    <svg {...ICON}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

/** Detachment names to sort. */
function ListIcon() {
  return (
    <svg {...ICON}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

/**
 * An admin's work left, in the header and the tab's title ("(6) Logis"): people waiting for
 * approval (the ignored left out; only through Cloudflare Access), detachment names to link and
 * detachments outside their faction. Each links to Settings, where it's done.
 */
export function AdminTodo() {
  const me = useQuery(meQuery);
  const [open, setOpen] = useState(false);
  const admin = isAdminView(me.data);
  const approving = admin && me.data?.access === true;
  const users = useQuery({ ...usersQuery, enabled: approving, refetchInterval: EVERY_FEW_MINUTES });
  const names = useQuery({
    ...detachmentNamesQuery,
    enabled: admin,
    refetchInterval: DETACHMENT_NAMES_REFRESH_MS,
  });

  const waiting = approving
    ? (users.data?.users ?? []).filter((u) => u.disabled && !u.ignored).length
    : 0;
  const unlinked = names.data?.unsure.length ?? 0;
  const outside = names.data?.wrong.length ?? 0;
  const detachments = unlinked + outside;
  const total = admin ? waiting + detachments : 0;

  useTitleCount(total);

  if (total === 0) return null;
  const items = [
    {
      count: waiting,
      tab: 'users' as const,
      label: plural(waiting, 'waiting for approval', 'waiting for approval'),
    },
    {
      count: unlinked,
      tab: 'detachments' as const,
      label: plural(unlinked, 'detachment name to link', 'detachment names to link'),
    },
    {
      count: outside,
      tab: 'detachments' as const,
      search: { faction: ALL_FACTIONS, section: 'outside' as const },
      label: plural(outside, 'detachment outside its faction', 'detachments outside their faction'),
    },
  ].filter((item) => item.count > 0);

  return (
    <Popover position="bottom-end" withArrow shadow="md" opened={open} onChange={setOpen}>
      <Popover.Target>
        <UnstyledButton
          aria-label={`To do: ${[
            waiting > 0 ? `${String(waiting)} for users` : null,
            detachments > 0 ? `${String(detachments)} for detachments` : null,
          ]
            .filter(Boolean)
            .join(', ')}`}
          onClick={() => {
            setOpen((o) => !o);
          }}
        >
          <span className={classes.todo}>
            {waiting > 0 && (
              <span className={classes.part}>
                <PersonIcon />
                <span data-part="users">{waiting}</span>
              </span>
            )}
            {detachments > 0 && (
              <span className={classes.part}>
                <ListIcon />
                <span data-part="detachments">{detachments}</span>
              </span>
            )}
          </span>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          {items.map((item) => (
            <Anchor
              key={item.label}
              size="sm"
              // Off to the page: the list closes.
              onClick={() => {
                setOpen(false);
              }}
              renderRoot={(props) => (
                <Link to="/settings" search={{ tab: item.tab, ...item.search }} {...props} />
              )}
            >
              {item.label}
            </Anchor>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
