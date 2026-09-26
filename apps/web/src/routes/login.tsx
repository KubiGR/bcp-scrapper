import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginPage } from '../features/auth/LoginPage';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ next: z.string().optional().catch(undefined) }),
  component: LoginRoute,
});

function LoginRoute() {
  const { next } = Route.useSearch();
  return <LoginPage next={next} />;
}
