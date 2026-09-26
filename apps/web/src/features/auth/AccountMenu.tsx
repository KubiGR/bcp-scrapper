import { Button, Menu, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { meQuery } from './auth-queries';
import { ChangePasswordForm } from './ChangePasswordForm';
import { useLogout } from './use-logout';

/** The logged-in user in the header, with Change password and Log out (only when logins are on). */
export function AccountMenu() {
  const { data } = useQuery(meQuery);
  const logout = useLogout();
  const [changing, setChanging] = useState(false);

  const user = data?.authRequired === true ? data.user : null;
  if (user === null) return null;

  return (
    <>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <Button
            variant="subtle"
            color="gray"
            size="compact-sm"
            aria-label={`Account: ${user.username}`}
          >
            {user.username}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            onClick={() => {
              setChanging(true);
            }}
          >
            Change password
          </Menu.Item>
          <Menu.Item
            onClick={() => {
              logout.mutate();
            }}
          >
            Log out
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Modal
        opened={changing}
        onClose={() => {
          setChanging(false);
        }}
        title="Change password"
      >
        <ChangePasswordForm
          onDone={() => {
            setChanging(false);
            notifications.show({ color: 'neon', title: 'Account', message: 'Password changed' });
          }}
        />
      </Modal>
    </>
  );
}
