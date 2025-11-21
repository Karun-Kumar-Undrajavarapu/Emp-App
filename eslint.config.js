import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
      sourceType: 'module',  // If using ES modules; change to 'script' if CommonJS
    },
    rules: {
      'no-console': 'warn',  // Allow console.logs
    },
  },
];
