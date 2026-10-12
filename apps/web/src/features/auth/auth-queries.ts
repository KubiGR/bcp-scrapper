import {
  CreateUserResponseSchema,
  LoginResponseSchema,
  MeResponseSchema,
  ResetPasswordResponseSchema,
  UsersResponseSchema,
  type ChangePasswordRequest,
  type CreateUserRequest,
  type LoginRequest,
  type MeResponse,
  type UpdateUserRequest,
} from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/client';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

/** Whether logins are on, and who is logged in. */
export const meQuery = queryOptions({
  queryKey: ME_QUERY_KEY,
  queryFn: () => apiGet('/api/auth/me', MeResponseSchema),
  staleTime: 5 * 60_000,
});

/**
 * Who may use the pairings planner: everyone when logins are off, admins, and members an admin
 * opened it to. Nobody while it's not known yet.
 */
export const canUsePairings = (me: MeResponse | undefined): boolean =>
  me !== undefined && (!me.authRequired || me.user?.role === 'admin' || me.user?.canPair === true);

export const usersQuery = queryOptions({
  queryKey: ['users'],
  queryFn: () => apiGet('/api/users', UsersResponseSchema),
});

const OkSchema = z.object({ ok: z.literal(true) });
const UpdatedUserSchema = z.object({ user: z.unknown() });

export const login = (request: LoginRequest) =>
  apiPost('/api/auth/login', request, LoginResponseSchema);
export const logout = () => apiPost('/api/auth/logout', {}, OkSchema);
export const changePassword = (request: ChangePasswordRequest) =>
  apiPost('/api/auth/password', request, OkSchema);

export const createUser = (request: CreateUserRequest) =>
  apiPost('/api/users', request, CreateUserResponseSchema);
export const resetPassword = (id: number) =>
  apiPost(`/api/users/${id}/reset-password`, {}, ResetPasswordResponseSchema);
export const updateUser = (id: number, request: UpdateUserRequest) =>
  apiPatch(`/api/users/${id}`, request, UpdatedUserSchema);
export const removeUser = (id: number) => apiDelete(`/api/users/${id}`, OkSchema);

/**
 * Where to go after logging in: only a path on this site, so a crafted link can't send the user
 * elsewhere.
 */
export function safeNext(next: string | undefined): string {
  if (
    next === undefined ||
    !next.startsWith('/') ||
    next.startsWith('//') ||
    next.startsWith('/\\')
  ) {
    return '/';
  }
  return next.startsWith('/login') ? '/' : next;
}
