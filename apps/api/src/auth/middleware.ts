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
          gatePage('Not signed in', ['Open this site through its address to sign in.']),
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
        return c.html(waitingPage(email, options.access.onApproved !== undefined), 403);
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

/** How often the waiting page looks again, so it opens the app soon after approval. */
const WAITING_REFRESH_SECONDS = 60;

/** Cloudflare Access's sign-out, which lets them sign in again with another account. */
const ACCESS_LOGOUT_PATH = '/cdn-cgi/access/logout';

/** For someone signed in but not yet approved: what happens next, and a way out. */
function waitingPage(email: string, emailsOnApproval: boolean): string {
  return gatePage(
    'Waiting for approval',
    [
      `You asked to join Logis as ${email}. An admin has to approve you first, and they’ve been told.`,
      'There’s nothing else you need to do. Leave this page open: Logis opens here by itself once you’re approved.',
      ...(emailsOnApproval ? ['We’ll also email you when you’re in.'] : []),
    ],
    {
      refreshSeconds: WAITING_REFRESH_SECONDS,
      link: { href: ACCESS_LOGOUT_PATH, text: 'Wrong account? Sign in with a different one' },
    },
  );
}

/** A page on its own, with no script: all someone not let in gets to see. */
function gatePage(
  title: string,
  paragraphs: string[],
  extra: { refreshSeconds?: number; link?: { href: string; text: string } } = {},
): string {
  const body = paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join('\n');
  const seconds = extra.refreshSeconds;
  const refresh =
    seconds === undefined ? '' : `<meta http-equiv="refresh" content="${String(seconds)}">\n`;
  // The time to the next look, in CSS alone: a bar filling over the refresh's seconds.
  const timer =
    seconds === undefined
      ? ''
      : `<div class="timer" role="status">
<p class="checking"><span class="spinner" aria-hidden="true"></span>Checking for approval every minute</p>
<div class="bar" aria-hidden="true"><div style="animation-duration:${String(seconds)}s"></div></div>
</div>\n`;
  const link =
    extra.link === undefined
      ? ''
      : `<p class="switch"><a href="${escapeHtml(extra.link.href)}">${escapeHtml(extra.link.text)}</a></p>\n`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
${refresh}<title>Logis · ${escapeHtml(title)}</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f19;color:#e6e9ef;font-family:system-ui,sans-serif}
main{max-width:480px;padding:24px;text-align:center}
h1{font-size:24px;letter-spacing:.12em;margin:0 0 20px}
h2{font-size:24px;font-weight:600;margin:0 0 16px}
p{font-size:17px;line-height:1.5;color:#8b93a7;margin:0 0 12px}
a{color:#26e2ff}
.switch{font-size:16px;margin-top:24px}
.timer{margin-top:28px}
.checking{display:flex;align-items:center;justify-content:center;gap:10px;font-size:15px;margin-bottom:10px}
.spinner{width:14px;height:14px;border:2px solid #2a3656;border-top-color:#26e2ff;border-radius:50%;animation:spin 1s linear infinite}
.bar{height:4px;background:#1b2440;overflow:hidden}
.bar div{height:100%;width:100%;background:#26e2ff;transform-origin:left;animation:fill linear forwards}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.spinner{animation:none}}
</style>
</head>
<body>
<main>
<h1>LOGIS</h1>
<h2>${escapeHtml(title)}</h2>
${body}
${timer}${link}</main>
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
