import { Button, Menu, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { meQuery } from './auth-queries';
import classes from './AccountMenu.module.css';
import { ChangePasswordForm } from './ChangePasswordForm';
import { useLogout } from './use-logout';

/** The logged-in user in the header, with Change password and Log out (only with the app's own logins). */
export function AccountMenu() {
  const { data } = useQuery(meQuery);
  const logout = useLogout();
  const [changing, setChanging] = useState(false);

  // Through Cloudflare Access there is nothing to show or change here: it knows who you are.
  const user = data?.authRequired === true && data.access !== true ? data.user : null;
  if (user === null) return null;

  return (
    <>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <Button
            variant="subtle"
            color="gray"
            size="compact-sm"
            className={classes.account}
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
