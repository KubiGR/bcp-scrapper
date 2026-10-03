/** BSData's Warhammer 40,000 11th edition data on GitHub (community-maintained catalogues). */
const TREE = 'https://api.github.com/repos/BSData/wh40k-11e/git/trees/main';
const RAW = 'https://raw.githubusercontent.com/BSData/wh40k-11e';

export interface BsdataTreeFile {
  path: string;
  /** The file's git blob sha: it changes whenever the file does. */
  sha: string;
}

export interface BsdataClient {
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
  };
}
