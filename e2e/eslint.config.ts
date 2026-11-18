import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'
import pluginPlaywright from 'eslint-plugin-playwright'

export default defineConfig(
  globalIgnores([
    'playwright-report*/**',
    'test-results*/**',
    'reports/**',
    // Variantes de l'application Windows construites par les tests (desktop/app.ts)
    '.desktop-apps/**',
  ]),

  ...tseslint.configs.recommended,

  {
    ...pluginPlaywright.configs['flat/recommended'],
    files: ['specs*/**/*.ts', 'fixtures/**/*.ts', 'pages/**/*.ts'],
  },
)
