import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Config } from '../config';

/** Cloudflare Access in front of the app: who the visitor is comes from its signed token. */
export interface AccessOptions {
  /** The team's Access domain, e.g. myteam.cloudflareaccess.com (also the token's issuer). */
  teamDomain: string;
  /** The application's audience tag: tokens for other Access applications are refused. */
  aud: string;
  /** Lower-case emails of the admins; everyone else Access lets in is a member. */
  adminEmails: string[];
  /** The team's public signing keys. */
  keys: JWTVerifyGetKey;
}

/** The header Cloudflare adds to every request it lets through. */
export const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';

/** "https://Team.cloudflareaccess.com/" → "team.cloudflareaccess.com". */
export const normalizeTeamDomain = (value: string) =>
  value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();

/** The team's keys, fetched when needed and cached (a rotated key is fetched again). */
export const remoteAccessKeys = (teamDomain: string): JWTVerifyGetKey =>
  createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));

/** Access mode from the environment; undefined when ACCESS_TEAM_DOMAIN and ACCESS_AUD are unset. */
export function accessOptionsOf(config: Config): AccessOptions | undefined {
  if (config.ACCESS_TEAM_DOMAIN === undefined || config.ACCESS_AUD === undefined) return undefined;
  const teamDomain = normalizeTeamDomain(config.ACCESS_TEAM_DOMAIN);
  return {
    teamDomain,
    aud: config.ACCESS_AUD,
    adminEmails: (config.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email !== ''),
    keys: remoteAccessKeys(teamDomain),
  };
}

/** The visitor's lower-case email from a valid Access token; null for anything else. */
export async function verifyAccessToken(
  token: string,
  access: AccessOptions,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, access.keys, {
      issuer: `https://${access.teamDomain}`,
      audience: access.aud,
      algorithms: ['RS256'],
    });
    const email = payload.email;
    return typeof email === 'string' && email.trim() !== '' ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}
