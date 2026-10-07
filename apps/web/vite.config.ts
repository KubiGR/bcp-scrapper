/// <reference types="vitest/config" />
import babel from '@rolldown/plugin-babel';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // Generates src/routeTree.gen.ts from src/routes; must run before the React plugin.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    // React Compiler 1.0 (stable Babel version): memoises components automatically,
    // so the code never needs manual useMemo/useCallback.
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: {
    // Not Vite's default 5173: other projects on this machine (js-icp) use it. Fails loudly
    // instead of moving to another port when this one is taken.
    port: 5273,
    strictPort: true,
    // The e2e test runs its own API on another port.
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3401' },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
