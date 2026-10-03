import type { UpdateCommit } from '@bcp/shared';

/** BSData's Warhammer 40,000 11th edition data on GitHub (community-maintained catalogues). */
const TREE = 'https://api.github.com/repos/BSData/wh40k-11e/git/trees/main';
const RAW = 'https://raw.githubusercontent.com/BSData/wh40k-11e';
const COMMITS = 'https://api.github.com/repos/BSData/wh40k-11e/commits?per_page=100';
/** At most this many pages of 100 commits (the edition's whole history fits easily). */
const MAX_COMMIT_PAGES = 30;

export interface BsdataTreeFile {
  path: string;
  /** The file's git blob sha: it changes whenever the file does. */
  sha: string;
}

export interface BsdataClient {
  /**
   * Commits of main not stored yet, read page by page (GitHub's order) until a page holds only
   * stored ones: a commit merged later can be listed below stored ones, so no single stop commit.
   */
  commits(isStored: (sha: string) => boolean): Promise<UpdateCommit[]>;
  /** The commit sha of main and its root *.json files. */
  tree(): Promise<{ commit: string; files: BsdataTreeFile[] }>;
  /** A file's parsed JSON at that commit. */
  file(commit: string, path: string): Promise<unknown>;
}

/** Root *.json files of BSData's 11th edition repository, read over HTTPS without a token. */
export function httpBsdataClient(
  options: { timeoutMs?: number; maxBytes?: number } = {},
): BsdataClient {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBytes = options.maxBytes ?? 20 * 1024 * 1024;
  const get = async (url: string) => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json', 'user-agent': 'bcp-analyzer' },
    });
    if (!response.ok) throw new Error(`GitHub answered ${String(response.status)}`);
    const text = await response.text();
    if (text.length > maxBytes) throw new Error('File too large');
    return JSON.parse(text) as unknown;
  };
  return {
    async tree() {
      const body = (await get(TREE)) as {
        sha?: unknown;
        tree?: { path?: unknown; sha?: unknown; type?: unknown }[];
      };
      if (typeof body.sha !== 'string' || !Array.isArray(body.tree)) {
        throw new Error('Unexpected answer from GitHub');
      }
      return {
        commit: body.sha,
        files: body.tree.flatMap((item) =>
          item.type === 'blob' &&
          typeof item.path === 'string' &&
          typeof item.sha === 'string' &&
          item.path.endsWith('.json') &&
          !item.path.includes('/')
            ? [{ path: item.path, sha: item.sha }]
            : [],
        ),
      };
    },
    file: (commit, path) => get(`${RAW}/${commit}/${encodeURIComponent(path)}`),
    async commits(isStored) {
      const found: UpdateCommit[] = [];
      for (let page = 1; page <= MAX_COMMIT_PAGES; page += 1) {
        const body = await get(`${COMMITS}&page=${String(page)}`);
        if (!Array.isArray(body) || body.length === 0) break;
        const commits = (
          body as { sha?: unknown; commit?: { message?: unknown; author?: { date?: unknown } } }[]
        ).flatMap((item) => {
          const date = item.commit?.author?.date;
          const message = item.commit?.message;
          if (typeof item.sha !== 'string' || typeof date !== 'string') return [];
          return [
            {
              sha: item.sha,
              day: date.slice(0, 10),
              message: typeof message === 'string' ? (message.split('\n')[0] ?? '') : '',
            },
          ];
        });
        if (commits.every((commit) => isStored(commit.sha))) break;
        found.push(...commits.filter((commit) => !isStored(commit.sha)));
      }
      return found;
    },
  };
}
