import { z } from 'zod';
import { EventSummarySchema } from './domain';

export const ApiErrorCodeSchema = z.enum([
  'BCP_UNAVAILABLE',
  'BCP_RATE_LIMITED',
  'BCP_SCHEMA_MISMATCH',
  'BCP_AUTH',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'INTERNAL',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

/** `date`: newest first. `players`: biggest first. */
export const EventSortSchema = z.enum(['date', 'players']);
export type EventSort = z.infer<typeof EventSortSchema>;

/** Query string for GET /api/events. Values arrive as strings, hence the coercion. */
export const EventListQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    country: z.string().trim().min(1).optional(),
    minPlayers: z.coerce.number().int().nonnegative().default(0),
    maxPlayers: z.coerce.number().int().nonnegative().optional(),
    type: z.enum(['all', 'singles', 'teams']).default('all'),
    q: z.string().trim().min(1).optional(),
    sort: EventSortSchema.default('date'),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((query) => query.maxPlayers === undefined || query.maxPlayers >= query.minPlayers, {
    message: '`maxPlayers` must be at least `minPlayers`',
    path: ['maxPlayers'],
  });
export type EventListQuery = z.infer<typeof EventListQuerySchema>;

export const EventListItemSchema = EventSummarySchema.extend({
  lastSyncedAt: z.iso.datetime().nullable(),
});
export type EventListItem = z.infer<typeof EventListItemSchema>;

export const EventListResponseSchema = z.object({
  items: z.array(EventListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type EventListResponse = z.infer<typeof EventListResponseSchema>;

export const BcpStatusSchema = z.object({
  source: z.enum(['bcp', 'fixtures']),
  authenticated: z.boolean(),
  accessTokenExpiresAt: z.iso.datetime().nullable(),
  lastRefreshAt: z.iso.datetime().nullable(),
});
export type BcpStatus = z.infer<typeof BcpStatusSchema>;
