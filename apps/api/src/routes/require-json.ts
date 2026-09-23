import { createMiddleware } from 'hono/factory';
import { ValidationError } from '../errors';

const MESSAGE = 'Content-Type must be application/json';

/**
 * State-changing routes only accept JSON. A web page the user visits can't send that
 * cross-origin without a preflight, so this blocks drive-by POSTs to the local API.
 */
export const requireJson = createMiddleware(async (c, next) => {
  const contentType = c.req.header('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) {
    throw new ValidationError([{ path: 'content-type', message: MESSAGE }], MESSAGE);
  }
  await next();
});
