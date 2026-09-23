import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

describe('createLogger', () => {
  it('redacts authorization headers whatever their case', () => {
    const lines: string[] = [];
    const logger = createLogger('info', false, { write: (line: string) => lines.push(line) });

    logger.info({ headers: { authorization: 'Bearer lower', Authorization: 'Bearer upper' } }, 'x');

    expect(lines.join('')).not.toMatch(/Bearer/);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      headers: { authorization: '[redacted]', Authorization: '[redacted]' },
    });
  });
});
