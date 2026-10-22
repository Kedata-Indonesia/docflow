// ESLint 9 flat config. Migrated from `.eslintrc.cjs` (issue #182) with the same
// rule set on purpose: this PR changes the config *format* and the package versions,
// not the house rules. Anything the migration surfaces is either fixed in the code or
// listed below with a reason — no rule is switched off to make the run pass.
import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default [
  {
    // `*.cjs` stays out: the repo has none left after this migration and both the
    // legacy config and the build output are ignored.
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/*.cjs',
      '**/coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    // Surface `eslint-disable` directives that no longer suppress anything so
    // "zombie" suppressions cannot silently rot; the `lint` script passes the same
    // flag for CI parity.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // Type-safety guardrail: explicit `any` is a hard error, not a warning, so
      // `pnpm lint` cannot exit 0 while the repo drifts towards `any` sprawl.
      '@typescript-eslint/no-explicit-any': 'error',
      // `catch (_)` is the repo's way of saying "the error is deliberately ignored"
      // (see CONTRIBUTING.md § Rules); typescript-eslint 8 checks caught errors by
      // default, so the same `_` convention has to be extended to them.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'vue/multi-word-component-names': 'off',
      // TypeScript resolves identifiers itself; leaving this on reports every DOM and
      // compiler-macro global twice.
      'no-undef': 'off',
    },
  },

  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 2022,
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
  },

  {
    // Library boundary guardrail (Phase 0) — regression trap for future PRs.
    // See docs/reference/LIBRARY_CONTRACT.md §5.1.
    files: ['packages/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/*', '**/apps/**', '@kedata-indonesia/docflow-server', '@kedata-indonesia/docflow-demo'],
              message:
                'packages/* must not import from apps/*. Use an injection port instead — see docs/reference/LIBRARY_CONTRACT.md.',
            },
            {
              group: ['mongoose', 'express', 'better-auth', 'better-auth/*'],
              message:
                'Backend-only dependency is forbidden in packages/*. Move it to apps/* — see docs/reference/LIBRARY_CONTRACT.md.',
            },
          ],
        },
      ],
    },
  },

  // Must stay last: turns off every rule that would fight the formatter.
  prettier,
]
