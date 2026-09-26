import { PASSWORD_MIN_LENGTH } from '@bcp/shared';
import { Alert, Button, PasswordInput, Stack } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { changePassword, ME_QUERY_KEY } from './auth-queries';

interface ChangePasswordFormProps {
  /** Called once the new password is saved. */
  onDone?: () => void;
}

export function ChangePasswordForm({ onDone }: ChangePasswordFormProps) {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [checked, setChecked] = useState(false);

  const tooShort = next.length < PASSWORD_MIN_LENGTH;
  const mismatch = next !== repeat;

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      onDone?.();
    },
  });

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    setChecked(true);
    if (current === '' || tooShort || mismatch) return;
    mutation.mutate({ current, next });
  }

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="sm">
        <PasswordInput
          label="Current password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => {
            setCurrent(event.currentTarget.value);
          }}
          error={checked && current === '' ? 'Enter your current password' : undefined}
        />
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          description={
            checked && tooShort ? undefined : `At least ${PASSWORD_MIN_LENGTH} characters`
          }
          value={next}
          onChange={(event) => {
            setNext(event.currentTarget.value);
          }}
          error={checked && tooShort ? `At least ${PASSWORD_MIN_LENGTH} characters` : undefined}
        />
        <PasswordInput
          label="Repeat new password"
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => {
            setRepeat(event.currentTarget.value);
          }}
          error={checked && !tooShort && mismatch ? 'The passwords don’t match' : undefined}
        />
        {mutation.error && (
          <Alert color="red" role="alert">
            {mutation.error.message}
          </Alert>
        )}
        <Button type="submit" loading={mutation.isPending} style={{ alignSelf: 'flex-start' }}>
          Change password
        </Button>
      </Stack>
    </form>
  );
}
