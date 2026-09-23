import pino from 'pino';

export type Logger = pino.Logger;

/** `destination` is for tests; by default pino writes to stdout. */
export function createLogger(
  level: string,
  pretty: boolean,
  destination?: pino.DestinationStream,
): Logger {
  const options: pino.LoggerOptions = {
    level,
    redact: {
      paths: [
        'headers.authorization',
        'headers.Authorization',
        'accessToken',
        'refreshToken',
        '*.accessToken',
        '*.refreshToken',
      ],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty' } } : {}),
  };
  return destination ? pino(options, destination) : pino(options);
}
