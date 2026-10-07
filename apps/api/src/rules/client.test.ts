import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_BUNDLE_URL, SAMPLE_HOME } from '../test/rules-sample';
import { bundleUrlOf, httpRulesClient } from './client';

describe('bundleUrlOf', () => {
  it('finds the script on 39k.pro’s home page', () => {
    expect(bundleUrlOf(SAMPLE_HOME)).toBe(SAMPLE_BUNDLE_URL);
  });

  it('only takes a script on 39k.pro itself', () => {
    expect(() =>
      bundleUrlOf('<script src="https://elsewhere.example/assets/index-1.js"></script>'),
    ).toThrow(/No script found/);
    expect(() => bundleUrlOf('<p>maintenance</p>')).toThrow(/No script found/);
  });
});

describe('httpRulesClient', () => {
  it('never fetches from anywhere but 39k.pro', async () => {
    await expect(httpRulesClient().bundle('https://elsewhere.example/x.js')).rejects.toThrow(
      /Not a 39k.pro address/,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never follows a redirect away from 39k.pro', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('<html></html>')));
    vi.stubGlobal('fetch', fetchMock);
    await httpRulesClient().homePage();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://39k.pro/',
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('stops reading an answer that grows past the limit', async () => {
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(endless))),
    );
    await expect(httpRulesClient({ maxBytes: 10_000 }).homePage()).rejects.toThrow(/too large/);
  });
});
