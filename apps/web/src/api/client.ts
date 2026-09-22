import { ApiErrorBodySchema, type ApiErrorCode } from '@bcp/shared';
import type { z } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | 'NETWORK';
  readonly details: unknown;

  constructor(status: number, code: ApiErrorCode | 'NETWORK', message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** GETs JSON from our API and validates it, so components only ever see well-typed data. */
export async function apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  let response: Response;
  try {
    response = await fetch(path, { headers: { accept: 'application/json' } });
  } catch (error) {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the API server. Is it running?', error);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorBodySchema.safeParse(body);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(response.status, code, message, details);
    }
    throw new ApiError(response.status, 'INTERNAL', `Request failed with HTTP ${response.status}`);
  }
  return schema.parse(body);
}
