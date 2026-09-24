import { z } from 'zod';
import { ApiErrorCodeSchema } from './error-code';

export const SyncKindSchema = z.enum(['catalog', 'event', 'pairings', 'lists']);
export type SyncKind = z.infer<typeof SyncKindSchema>;

export const SyncStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed']);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

const eventId = z.string().min(1);

export const SyncRequestSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('catalog'), from: z.iso.date(), to: z.iso.date() }),
    z.object({ kind: z.literal('event'), eventId }),
    z.object({ kind: z.literal('pairings'), eventId }),
  ])
  .refine((request) => request.kind !== 'catalog' || request.from <= request.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const SyncRunSchema = z.object({
  id: z.number().int().positive(),
  kind: SyncKindSchema,
  eventId: z.string().nullable(),
  status: SyncStatusSchema,
  total: z.number().int().nullable(),
  done: z.number().int(),
  failed: z.number().int(),
  error: z.string().nullable(),
  /** Why a failed run failed; `BCP_AUTH` means the BCP login was refused. */
  errorCode: ApiErrorCodeSchema.nullable(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  /** The requested date range of a catalogue run; null for event-scoped runs. */
  range: z.object({ from: z.iso.date(), to: z.iso.date() }).nullable(),
});
export type SyncRun = z.infer<typeof SyncRunSchema>;
