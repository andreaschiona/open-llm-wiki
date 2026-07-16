import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    rules: {
      // Tauri dependencies (@tauri-apps/plugin-fs) are not available in CI
      // but are bundled at runtime. Relative imports like ./components/Sidebar
      // are resolved by Vite, not ESLint.
      'n/no-missing-import': 'off',
      'n/no-unsupported-features/es-syntax': 'off',

      // React not explicitly in scope, but we use JSX via Vite
      'react/react-in-jsx-scope': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.tauri/**',
    ],
  },
]
