module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:vue/vue3-recommended',
    'prettier',
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 2022,
    sourceType: 'module',
    extraFileExtensions: ['.vue'],
  },
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'vue/multi-word-component-names': 'off',
  },
  overrides: [
    {
      // Library boundary guardrail (Phase 0) — regression trap for future PRs.
      // Enforced as 'error' since the Phase 7 AISidebar leak was removed and a
      // full lint run reports zero violations.
      // See docs/LIBRARY_CONTRACT.md §5.1.
      files: ['packages/**/*.{ts,vue}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '**/apps/*',
                  '**/apps/**',
                  '@kedata-indonesia/docflow-server',
                  '@kedata-indonesia/docflow-demo',
                ],
                message:
                  'packages/* must not import from apps/*. Use an injection port instead — see docs/LIBRARY_CONTRACT.md.',
              },
              {
                group: ['mongoose', 'express', 'better-auth', 'better-auth/*'],
                message:
                  'Backend-only dependency is forbidden in packages/*. Move it to apps/* — see docs/LIBRARY_CONTRACT.md.',
              },
            ],
          },
        ],
      },
    },
  ],
  ignorePatterns: ['dist/', 'build/', 'node_modules/', '*.cjs'],
};
