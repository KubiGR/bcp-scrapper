import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Db } from '../db/client';
import { ForbiddenError, UnauthorizedError } from '../errors';
import { resolveSession, type SessionUser } from './sessions';

export const SESSION_COOKIE = 'bcp_session';

export interface AuthOptions {
  /** Logins for everyone (AUTH_REQUIRED). Off: no login, no account routes. */
  required: boolean;
  /** Keys the stored session hashes (SESSION_SECRET). */
  secret: string;
}

/** What the auth middleware leaves in the Hono context for the routes. */
export interface AuthEnv {
  Variables: { user?: SessionUser; sessionHash?: string };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Behind the Cloudflare Tunnel the visitor's address comes in CF-Connecting-IP. */
export function clientIp(c: Context): string {
  const forwarded = c.req.header('cf-connecting-ip');
  if (forwarded !== undefined && forwarded !== '') return forwarded;
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function originAllowed(origin: string | undefined, allowedHosts: Set<string>): boolean {
  if (origin === undefined) return false;
  try {
    return allowedHosts.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * With auth required: every /api route needs a session, except logging in, health and "who am I";
 * a user who must change their password can only reach /api/auth/*; and a state-changing request
 * must come from one of our own origins (so another site can't ride the cookie).
 */
export function authMiddleware(deps: {
  db: Db;
  options: AuthOptions;
  allowedHosts: Set<string>;
  now: () => Date;
}) {
  const { db, options, allowedHosts, now } = deps;
  return createMiddleware<AuthEnv>(async (c, next) => {
    const path = c.req.path;
    if (!options.required || !path.startsWith('/api/') || path === '/api/health') {
      await next();
      return;
    }
    const method = c.req.method;
    if (!SAFE_METHODS.has(method) && !originAllowed(c.req.header('origin'), allowedHosts)) {
      throw new ForbiddenError('Request from another site refused');
    }
    const isLogin = method === 'POST' && path === '/api/auth/login';
    const isMe = method === 'GET' && path === '/api/auth/me';
    const token = getCookie(c, SESSION_COOKIE);
    const session =
      token === undefined || isLogin
        ? null
        : await resolveSession(db, options.secret, token, now());
    if (session !== null) {
      c.set('user', session.user);
      c.set('sessionHash', session.tokenHash);
    }
    if (isLogin || isMe) {
      await next();
      return;
    }
    if (session === null) throw new UnauthorizedError();
    if (session.user.mustChangePassword && !path.startsWith('/api/auth/')) {
      throw new ForbiddenError('Change your password first');
    }
    await next();
  });
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // Mantine sets inline style attributes.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Browser hardening on every response (HSTS comes from Cloudflare). */
export const securityHeaders = createMiddleware(async (c, next) => {
  await next();
  c.res.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('Referrer-Policy', 'same-origin');
  c.res.headers.set('X-Frame-Options', 'DENY');
});
