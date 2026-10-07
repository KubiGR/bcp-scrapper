import { describe, expect, it } from 'vitest';
import { allowedHostsOf, loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults when the environment is empty', () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(3401);
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.TOURNAMENT_SOURCE).toBe('fixtures');
    expect(config.BCP_REQUESTS_PER_SECOND).toBe(2);
    expect(config.BCP_REFRESH_TOKEN).toBeUndefined();
    expect(config.FETCH_QUEUE_INTERVAL_MS).toBe(5000);
  });

  it('treats empty strings as unset, so a blank .env line does not fail validation', () => {
    expect(loadConfig({ BCP_REFRESH_TOKEN: '' }).BCP_REFRESH_TOKEN).toBeUndefined();
  });

  it('reports every invalid variable in one error', () => {
    expect(() => loadConfig({ PORT: 'abc', TOURNAMENT_SOURCE: 'ftp' })).toThrow(
      /PORT[\s\S]*TOURNAMENT_SOURCE/,
    );
  });

  it('reads the fetch queue pace, falling back to the plan 3 name', () => {
    expect(loadConfig({ FETCH_QUEUE_INTERVAL_MS: '300' }).FETCH_QUEUE_INTERVAL_MS).toBe(300);
    expect(loadConfig({ LIST_QUEUE_INTERVAL_MS: '400' }).FETCH_QUEUE_INTERVAL_MS).toBe(400);
    expect(loadConfig({}).FETCH_QUEUE_INTERVAL_MS).toBe(5000);
  });

  it('defaults the big-event size rule to 4 rounds and 20 players', () => {
    const config = loadConfig({});
    expect(config.MIN_EVENT_ROUNDS).toBe(4);
    expect(config.MIN_EVENT_PLAYERS).toBe(20);
  });

  it('reads the size rule from the environment, e.g. 0/0 for tiny fixtures', () => {
    const config = loadConfig({ MIN_EVENT_ROUNDS: '0', MIN_EVENT_PLAYERS: '0' });
    expect(config.MIN_EVENT_ROUNDS).toBe(0);
    expect(config.MIN_EVENT_PLAYERS).toBe(0);
  });

  it('allows loopback names plus the public hostname and extra hosts, lower-cased without ports', () => {
    const hosts = allowedHostsOf(
      loadConfig({
        PUBLIC_HOSTNAME: 'BCP.Example.com',
        ALLOWED_HOSTS: 'nas.lan:3000, 192.168.1.20 ,',
      }),
    );
    expect([...hosts].sort()).toEqual(
      [
        '127.0.0.1',
        '192.168.1.20',
        '::1',
        '[::1]',
        'bcp.example.com',
        'localhost',
        'nas.lan',
      ].sort(),
    );
  });

  it('only allows loopback names by default', () => {
    expect([...allowedHostsOf(loadConfig({}))].sort()).toEqual(
      ['127.0.0.1', '::1', '[::1]', 'localhost'].sort(),
    );
  });

  it('turns auth on only for true or 1, and then requires a session secret', () => {
    expect(loadConfig({}).AUTH_REQUIRED).toBe(false);
    expect(loadConfig({ AUTH_REQUIRED: 'false' }).AUTH_REQUIRED).toBe(false);
    const secret = 'x'.repeat(32);
    expect(loadConfig({ AUTH_REQUIRED: 'true', SESSION_SECRET: secret }).AUTH_REQUIRED).toBe(true);
    expect(loadConfig({ AUTH_REQUIRED: '1', SESSION_SECRET: secret }).AUTH_REQUIRED).toBe(true);
    expect(() => loadConfig({ AUTH_REQUIRED: 'true' })).toThrow(
      'SESSION_SECRET is required when AUTH_REQUIRED is true',
    );
  });

  it('takes Cloudflare Access as the login, needing no session secret', () => {
    const config = loadConfig({
      AUTH_REQUIRED: 'true',
      ACCESS_TEAM_DOMAIN: 'myteam.cloudflareaccess.com',
      ACCESS_AUD: 'abc',
      ADMIN_EMAILS: 'a@x.com, B@x.com',
    });
    expect(config.ACCESS_TEAM_DOMAIN).toBe('myteam.cloudflareaccess.com');
    expect(config.ADMIN_EMAILS).toBe('a@x.com, B@x.com');
    expect(() => loadConfig({ ACCESS_TEAM_DOMAIN: 'myteam.cloudflareaccess.com' })).toThrow(
      'ACCESS_TEAM_DOMAIN and ACCESS_AUD must be set together',
    );
    expect(() => loadConfig({ ACCESS_AUD: 'abc' })).toThrow(
      'ACCESS_TEAM_DOMAIN and ACCESS_AUD must be set together',
    );
  });

  it('reads the web build directory and the first admin', () => {
    const config = loadConfig({
      WEB_DIST_DIR: '/app/web',
      ADMIN_USERNAME: 'kubi',
      ADMIN_PASSWORD: 'p',
    });
    expect(config.WEB_DIST_DIR).toBe('/app/web');
    expect(config.ADMIN_USERNAME).toBe('kubi');
  });

  it('reads BSData syncing: on unless switched off', () => {
    expect(loadConfig({}).BSDATA_ENABLED).toBe(true);
    expect(loadConfig({ BSDATA_ENABLED: 'false' }).BSDATA_ENABLED).toBe(false);
  });

  it('reads the automatic fetching settings, with defaults', () => {
    expect(loadConfig({})).toMatchObject({
      AUTO_FETCH_ENABLED: true,
      AUTO_FETCH_INTERVAL_MS: 600_000,
      AUTO_FETCH_DAYS: 60,
      AUTO_CATALOG_INTERVAL_MS: 3_600_000,
    });
    expect(
      loadConfig({
        AUTO_FETCH_ENABLED: 'false',
        AUTO_FETCH_DAYS: '30',
        AUTO_FETCH_INTERVAL_MS: '1000',
      }),
    ).toMatchObject({
      AUTO_FETCH_ENABLED: false,
      AUTO_FETCH_DAYS: 30,
      AUTO_FETCH_INTERVAL_MS: 1000,
    });
  });
});
