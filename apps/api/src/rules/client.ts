/** 39k.pro: a web app whose script carries the GW app's rules data. */
export const RULES_SITE = 'https://39k.pro/';
/** The app's script, served from 39k.pro itself: `<script … src="/assets/index-<hash>.js">`. */
const SCRIPT = /<script\b[^>]*\bsrc="(\/assets\/index-[\w-]+\.js)"/;

export interface RulesClient {
  /** The home page's HTML. */
  homePage(): Promise<string>;
  /** The script's text (about 28 MB). */
  bundle(url: string): Promise<string>;
}

/** The script's full address, from the home page; it changes whenever the site does. */
export function bundleUrlOf(html: string): string {
  const path = SCRIPT.exec(html)?.[1];
  if (path === undefined)
    throw new Error('No script found on 39k.pro’s home page (the site changed)');
  return new URL(path, RULES_SITE).href;
}

/** Reads 39k.pro over HTTPS; refuses any other address. */
export function httpRulesClient(
  options: { timeoutMs?: number; maxBytes?: number } = {},
): RulesClient {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
  const get = async (url: string) => {
    if (!url.startsWith(RULES_SITE)) throw new Error(`Not a 39k.pro address: ${url}`);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'bcp-analyzer' },
      // A redirect could lead anywhere: only 39k.pro's own answers are read.
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`39k.pro answered ${String(response.status)}`);
    const tooLarge = () => new Error('39k.pro’s answer is too large');
    if (Number(response.headers.get('content-length') ?? 0) > maxBytes) throw tooLarge();
    // Counted while reading, so an endless answer stops at the limit instead of filling memory.
    const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
    if (reader === undefined) return '';
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  };
  return { homePage: () => get(RULES_SITE), bundle: (url) => get(url) };
}
