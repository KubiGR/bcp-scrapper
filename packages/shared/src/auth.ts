import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 200;

export const UserRoleSchema = z.enum(['admin', 'member']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  role: UserRoleSchema,
  mustChangePassword: z.boolean(),
  disabled: z.boolean(),
});
export type User = z.infer<typeof UserSchema>;

/** GET /api/auth/me: whether logins are on, and who is logged in (null when nobody). */
export const MeResponseSchema = z.object({
  authRequired: z.boolean(),
  user: UserSchema.nullable(),
  /** True when Cloudflare Access does the signing in: no passwords or accounts to manage here. */
  access: z.boolean().optional(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const LoginRequestSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({ user: UserSchema });
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const ChangePasswordRequestSchema = z.object({
  current: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  next: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const UsernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{2,40}$/, '2–40 letters, digits, dots, dashes or underscores');

export const CreateUserRequestSchema = z.object({
  username: UsernameSchema,
  role: UserRoleSchema.default('member'),
});
export type CreateUserRequest = z.input<typeof CreateUserRequestSchema>;

/** The temporary password is shown once; the user must replace it at first login. */
export const CreateUserResponseSchema = z.object({
  user: UserSchema,
  temporaryPassword: z.string(),
});
export type CreateUserResponse = z.infer<typeof CreateUserResponseSchema>;

export const ResetPasswordResponseSchema = z.object({ temporaryPassword: z.string() });
export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;

export const UpdateUserRequestSchema = z
  .object({ role: UserRoleSchema.optional(), disabled: z.boolean().optional() })
  .refine((value) => value.role !== undefined || value.disabled !== undefined, {
    message: 'Nothing to change',
  });
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const UsersResponseSchema = z.object({ users: z.array(UserSchema) });
export type UsersResponse = z.infer<typeof UsersResponseSchema>;
