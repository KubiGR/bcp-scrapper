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

let onUnauthorized: (() => void) | null = null;

/**
 * Called when an API call answers 401 (the session ended), so the app can go back to the login
 * page. The login routes' own 401s are answers, not ended sessions.
 */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function request<S extends z.ZodType>(
  path: string,
  init: RequestInit,
  schema: S,
): Promise<z.output<S>> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the API server. Is it running?', error);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized?.();
    const parsed = ApiErrorBodySchema.safeParse(body);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(response.status, code, message, details);
    }
    throw new ApiError(response.status, 'INTERNAL', `Request failed with HTTP ${response.status}`);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      'INTERNAL',
      `The API sent an unexpected response for ${path}`,
      parsed.error.issues,
    );
  }
  return parsed.data;
}

/** GETs JSON from our API and validates it, so components only ever see well-typed data. */
export function apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  return request(path, { headers: { accept: 'application/json' } }, schema);
}

/** POSTs a JSON body; the API requires the JSON content type on every state change. */
export function apiPost<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
): Promise<z.output<S>> {
  return request(
    path,
    {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    schema,
  );
}

/** DELETEs a resource; no body, so it needs no content type and stays a simple CORS request. */
export function apiDelete<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  return request(path, { method: 'DELETE', headers: { accept: 'application/json' } }, schema);
}

/** PATCHes a JSON body. */
export function apiPatch<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
): Promise<z.output<S>> {
  return request(
    path,
    {
      method: 'PATCH',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    schema,
  );
}

/** PUTs a JSON body. */
export function apiPut<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
): Promise<z.output<S>> {
  return request(
    path,
    {
      method: 'PUT',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    schema,
  );
}
