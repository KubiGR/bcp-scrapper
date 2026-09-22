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
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
