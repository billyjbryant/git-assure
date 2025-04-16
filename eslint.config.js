const { configs: eslintConfigs } = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tseslintParser = require('@typescript-eslint/parser');
const jestPlugin = require('eslint-plugin-jest');
const prettierConfig = require('eslint-config-prettier');
const globals = require('globals');
const path = require('path');

module.exports = [
  eslintConfigs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tseslintParser,
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: null // Disable project-wide for base config
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        fetch: true,
        Buffer: true,
        setTimeout: true
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: true
    },
    plugins: {
      '@typescript-eslint': tseslint,
      jest: jestPlugin
    },
    rules: {
      'no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  // TypeScript source files
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: path.resolve(__dirname, './tsconfig.json')
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      ...tseslint.configs['recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'off' // Disable any warnings
    }
  },
  // Root index.ts file
  {
    files: ['index.ts'],
    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        project: null // Disable project validation for index.ts
      }
    }
  },
  // Test files
  {
    files: ['test/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: path.resolve(__dirname, './tsconfig.test.json')
      },
      globals: {
        ...globals.jest,
        jest: true,
        describe: true,
        test: true,
        it: true,
        expect: true,
        beforeAll: true,
        beforeEach: true,
        afterAll: true,
        afterEach: true
      }
    },
    plugins: {
      jest: jestPlugin,
      '@typescript-eslint': tseslint
    },
    rules: {
      ...jestPlugin.configs['recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'off' // Allow any in tests
    }
  },
  // JavaScript files
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      parser: tseslintParser,
      parserOptions: {
        project: null // Don't require tsconfig for JS files
      }
    }
  },
  // Prettier config
  prettierConfig,
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**']
  }
];
