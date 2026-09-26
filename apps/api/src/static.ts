import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { Hono } from 'hono';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const IMMUTABLE = 'public, max-age=31536000, immutable';

/** The file for a URL path inside `root`, or null when the path would leave it. */
function fileWithin(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const file = resolve(root, `.${decoded}`);
  return file === root || file.startsWith(root + sep) ? file : null;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves the built web app for every non-API GET: files under `distDir`, and index.html for app
 * routes (paths without an extension) so client-side routing works on reload.
 */
export function serveWebApp(app: Hono, distDir: string): void {
  const root = resolve(distDir);
  const indexFile = resolve(root, 'index.html');

  app.get('*', async (c) => {
    const path = c.req.path;
    if (path === '/api' || path.startsWith('/api/')) return c.notFound();

    const file = fileWithin(root, path);
    if (file === null) return c.notFound();

    if (file !== root && (await isFile(file))) {
      const type = CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
      const caching = path.startsWith('/assets/') ? IMMUTABLE : 'no-cache';
      return c.body(await readFile(file), 200, { 'Content-Type': type, 'Cache-Control': caching });
    }
    if (extname(path) !== '') return c.notFound();
    return c.body(await readFile(indexFile), 200, {
      'Content-Type': CONTENT_TYPES['.html'] ?? 'text/html',
      'Cache-Control': 'no-cache',
    });
  });
}
