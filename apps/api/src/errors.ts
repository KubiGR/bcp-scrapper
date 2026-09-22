import type { ApiErrorBody, ApiErrorCode } from '@bcp/shared';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** An error we expect, with the status and code API clients should see. */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: ContentfulStatusCode;
  readonly details: unknown;

  constructor(
    code: ApiErrorCode,
    status: ContentfulStatusCode,
    message: string,
    options: { details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = options.details;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super('NOT_FOUND', 404, message);
  }
}

export class ValidationError extends AppError {
  constructor(issues: { path: string; message: string }[]) {
    super('VALIDATION_ERROR', 400, 'Request validation failed', { details: { issues } });
  }
}

export class BcpUnavailableError extends AppError {
  constructor(message: string, cause?: unknown) {
    super('BCP_UNAVAILABLE', 502, message, { cause });
  }
}

export class BcpRateLimitedError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('BCP_RATE_LIMITED', 503, 'BCP is rate limiting us; try again shortly', {
      details: { retryAfterSeconds },
    });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class BcpSchemaError extends AppError {
  constructor(endpoint: string, issues: { path: string; message: string }[]) {
    super('BCP_SCHEMA_MISMATCH', 502, `BCP response from ${endpoint} had an unexpected shape`, {
      details: { endpoint, issues },
    });
  }
}

export class BcpAuthError extends AppError {
  constructor(message: string) {
    super('BCP_AUTH', 502, message);
  }
}

export function toErrorBody(error: AppError): ApiErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}
