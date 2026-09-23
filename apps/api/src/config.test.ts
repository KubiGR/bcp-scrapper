import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults when the environment is empty', () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(3001);
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.TOURNAMENT_SOURCE).toBe('fixtures');
    expect(config.BCP_REQUESTS_PER_SECOND).toBe(2);
    expect(config.BCP_REFRESH_TOKEN).toBeUndefined();
  });

  it('treats empty strings as unset, so a blank .env line does not fail validation', () => {
    expect(loadConfig({ BCP_REFRESH_TOKEN: '' }).BCP_REFRESH_TOKEN).toBeUndefined();
  });

  it('reports every invalid variable in one error', () => {
    expect(() => loadConfig({ PORT: 'abc', TOURNAMENT_SOURCE: 'ftp' })).toThrow(
      /PORT[\s\S]*TOURNAMENT_SOURCE/,
    );
  });
});
