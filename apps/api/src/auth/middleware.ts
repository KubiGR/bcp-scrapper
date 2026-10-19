import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Db } from '../db/client';
import { ForbiddenError, UnauthorizedError } from '../errors';
import { findOrCreateAccessUser, touchLastSeen } from '../repo/users';
import { ACCESS_JWT_HEADER, verifyAccessToken, type AccessOptions } from './access';
import { resolveSession, type SessionUser } from './sessions';

export const SESSION_COOKIE = 'bcp_session';

export interface AuthOptions {
  /** Logins for everyone (AUTH_REQUIRED). Off: no login, no account routes. */
  required: boolean;
  /** Keys the stored session hashes (SESSION_SECRET). */
  secret: string;
  /** Sign-in through Cloudflare Access: no passwords, sessions or login routes of our own. */
  access?: AccessOptions;
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
    const api = path.startsWith('/api/');
    if (!options.required || path === '/api/health') {
      await next();
      return;
    }
    const method = c.req.method;
    if (api && !SAFE_METHODS.has(method) && !originAllowed(c.req.header('origin'), allowedHosts)) {
      throw new ForbiddenError('Request from another site refused');
    }
    if (options.access !== undefined) {
      // Every request, the web app's pages and files too: someone not yet approved sees only a
      // page saying so, never the app.
      const jwt = c.req.header(ACCESS_JWT_HEADER);
      const email = jwt === undefined ? null : await verifyAccessToken(jwt, options.access);
      if (email === null) {
        if (api) throw new UnauthorizedError();
        return c.html(
          gatePage('Not signed in', 'Open this site through its address to sign in.'),
          401,
        );
      }
      const role = options.access.adminEmails.includes(email) ? 'admin' : 'member';
      const user = await findOrCreateAccessUser(db, email, role, (created) => {
        // Someone new to approve (admins are let in straight away).
        if (created.disabled) options.access?.onNewUser?.(created.username);
      });
      // Those still waiting too: the admin sees whether they're still trying.
      await touchLastSeen(db, user.id, now());
      if (user.disabled) {
        if (api) throw new ForbiddenError('Waiting for approval');
        return c.html(
          gatePage(
            'Waiting for approval',
            `You're signed in as ${email}. The site's admin will let you in soon.`,
          ),
          403,
        );
      }
      // The environment decides who is an admin, whatever was stored.
      c.set('user', { ...user, role, mustChangePassword: false });
      await next();
      return;
    }
    if (!api) {
      await next();
      return;
    }
    const isLogin = method === 'POST' && path === '/api/auth/login';
    const isMe = method === 'GET' && path === '/api/auth/me';
    const token = getCookie(c, SESSION_COOKIE);
    const session =
      token === undefined || isLogin
        ? null
        : await resolveSession(db, options.secret, token, now());
    if (session !== null) {
      await touchLastSeen(db, session.user.id, now());
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

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => `&#${String(ch.charCodeAt(0))};`);

/** A page on its own, with no script: all someone not let in gets to see. */
function gatePage(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Logis · ${escapeHtml(title)}</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f19;color:#e6e9ef;font-family:system-ui,sans-serif">
<main style="max-width:360px;padding:24px;text-align:center">
<h1 style="font-size:20px;letter-spacing:.12em;margin:0 0 12px">LOGIS</h1>
<p style="font-size:16px;margin:0 0 8px">${escapeHtml(title)}</p>
<p style="font-size:14px;color:#8b93a7;margin:0">${escapeHtml(message)}</p>
</main>
</body>
</html>`;
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
  // Private, for friends: kept out of search engines.
  c.res.headers.set('X-Robots-Tag', 'noindex, nofollow');
});
