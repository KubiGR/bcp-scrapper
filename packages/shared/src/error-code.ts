import { z } from 'zod';

export const ApiErrorCodeSchema = z.enum([
  'BCP_UNAVAILABLE',
  'BCP_RATE_LIMITED',
  'BCP_SCHEMA_MISMATCH',
  'BCP_AUTH',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'INTERNAL',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'RATE_LIMITED',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
