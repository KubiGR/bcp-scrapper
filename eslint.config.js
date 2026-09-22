// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules',
    '**/dist',
    '**/coverage',
    '**/routeTree.gen.ts',
    'apps/api/drizzle',
    'fixtures',
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', '*.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Vitest matchers (expect.any, expect.stringContaining) are typed `any`, and asserting
    // on mocked methods (expect(obj.method)) is idiomatic in tests. Empty-bodied stub methods
    // (e.g. a ResizeObserver polyfill) are also fine here: they exist to satisfy an interface.
    files: ['**/*.test.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  { files: ['**/*.{js,cjs,mjs}'], extends: [tseslint.configs.disableTypeChecked] },
  prettier,
]);
