import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use createElement/textContent.' },
        { property: 'outerHTML', message: 'Use createElement/textContent.' },
        { property: 'insertAdjacentHTML', message: 'Use createElement/textContent.' },
      ],
      // Early-return idiom `return setX()` is used deliberately in handlers.
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-meaningless-void-operator': 'off',
      'no-eval': 'error',
      'no-implied-eval': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'no-restricted-properties': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'demo/**/*.mjs', 'eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
    },
  },
);
