/**
 * Root ESLint flat config (#32). Single source of truth for the whole
 * monorepo — web-specific rules layered as a second block with a glob.
 *
 * Philosophy: Prettier owns formatting; `tsc --noEmit` owns type errors.
 * ESLint's job here is the narrow set of correctness rules TS can't
 * express — unused imports, obvious mistakes, react-hooks rules.
 *
 * NOTE on parserOptions.project: intentionally NOT set. Type-aware linting
 * (no-floating-promises etc.) requires wiring a tsconfig per package, and
 * would flare hundreds of warnings on first run. Baseline first, ratchet
 * type-aware rules on later.
 */
const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const reactHooks = require('eslint-plugin-react-hooks');
const reactRefresh = require('eslint-plugin-react-refresh');

module.exports = [
  // Global ignores — must be its own entry (flat-config quirk).
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.config.js',
      '**/*.config.cjs',
      '**/*.config.mjs',
      '**/*.config.ts',
      '**/jest.env.js',
      '**/vite.config.ts',
      '**/vitest.config.ts',
      '**/postcss.config.js',
      '**/tailwind.config.js',
    ],
  },

  // Base rules for all TS/TSX.
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: {
        // Node globals — covers services + Jest.
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        global: 'readonly',
        // Jest globals used across .spec.ts files.
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Test mocks + integration glue legitimately use `any` — enforcing this
      // repo-wide flags dozens of correct sites. `unknown` is the code-review
      // preference; not an automated gate.
      '@typescript-eslint/no-explicit-any': 'off',
      // `_prefix` = intentionally unused (Nest guards with fixed signatures,
      // destructured-but-ignored props, etc.).
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Nest DI + TypeORM decorators produce empty interfaces/functions.
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      // `no-undef` on TS files is redundant with tsc and misfires on globals.
      'no-undef': 'off',
    },
  },

  // Web overlay — React 18 + Vite. `react` core plugin intentionally omitted;
  // the new JSX transform makes most of its rules obsolete for a fresh SPA.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        crypto: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLFormElement: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        FormEvent: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
];
