import { Alert, Button, Stack, Text } from '@mantine/core';

interface ErrorStateProps {
  title?: string;
  error: Error;
  onRetry?: () => void;
}

/** The standard error display: what went wrong, and a Retry when one can help. */
export function ErrorState({ title = 'Something went wrong', error, onRetry }: ErrorStateProps) {
  return (
    <Alert color="red" title={title}>
      <Stack gap="sm" align="flex-start">
        <Text size="sm">{error.message}</Text>
        {onRetry && (
          <Button size="xs" color="red" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
