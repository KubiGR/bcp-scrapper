import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { logout } from './auth-queries';

/** Logs out, forgets every cached answer, and goes to the login page. */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: logout,
    onSettled: async () => {
      queryClient.clear();
      await navigate({ to: '/login', search: {} });
    },
  });
}
