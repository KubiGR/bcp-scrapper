import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveWebApp } from './static';

let root: string;
let dist: string;
let app: Hono;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bcp-static-'));
  dist = join(root, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>app</title>');
  await writeFile(join(dist, 'assets', 'app-abc.js'), 'console.log(1)');
  await writeFile(join(root, 'secret.txt'), 'outside');
  app = new Hono();
  app.get('/api/health', (c) => c.json({ status: 'ok' }));
  serveWebApp(app, dist);
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe('serveWebApp', () => {
  it('serves index.html for the root and for app routes, never cached', async () => {
    for (const path of ['/', '/events/X', '/analysis/matchups']) {
      const response = await app.request(path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('content-type'), path).toMatch(/^text\/html/);
      expect(response.headers.get('cache-control'), path).toBe('no-cache');
      expect(await response.text()).toContain('<title>app</title>');
    }
  });

  it('serves hashed assets with their type and long-lived caching', async () => {
    const response = await app.request('/assets/app-abc.js');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/javascript/);
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await response.text()).toBe('console.log(1)');
  });

  it('answers 404 for a missing file with an extension', async () => {
    expect((await app.request('/missing.png')).status).toBe(404);
  });

  it('never serves files outside the build directory', async () => {
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt']) {
      const response = await app.request(path);
      expect(response.status, path).toBe(404);
    }
  });

  it('leaves the API alone', async () => {
    const health = await app.request('/api/health');
    expect(await health.json()).toEqual({ status: 'ok' });
    expect((await app.request('/api/nope')).status).toBe(404);
  });
});
