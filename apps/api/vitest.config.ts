import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'api', environment: 'node', testTimeout: 20_000, hookTimeout: 60_000 },
});
