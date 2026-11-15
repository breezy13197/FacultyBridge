// Intentional first pass: high-confidence bug checks, not formatting rules.
// Browser scripts are classic scripts; test/build code runs as Node modules.
const bugRules = {
  'no-debugger': 'error',
  'no-constant-binary-expression': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-fallthrough': 'error',
  'no-self-assign': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'valid-typeof': 'error',
};

export default [
  {
    ignores: [
      'dist/**',
      'vendor/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'tests/test files/**',
      'tests/test-files/**',
      'tests/local-baselines/**',
    ],
  },
  {
    files: ['apps/**/*.js', 'packages/**/*.js'],
    languageOptions: { sourceType: 'script' },
    rules: bugRules,
  },
  {
    files: [
      'scripts/**/*.{js,mjs}',
      'tests/**/*.{js,mjs}',
      'e2e/**/*.{js,mjs}',
      'playwright.config.js',
      '.claude/hooks/**/*.{js,mjs}',
    ],
    languageOptions: { sourceType: 'module' },
    rules: bugRules,
  },
  {
    // Node utility scripts have a well-defined execution environment.
    // Grow no-undef coverage after auditing browser-injected globals.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: { 'no-undef': 'error' },
  },
];
