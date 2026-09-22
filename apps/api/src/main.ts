import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';
import { createLogger } from './logger';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development');
const app = createApp({ logger });

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info(`API listening on http://localhost:${info.port}`);
});
