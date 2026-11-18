import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

const NODE_MAJOR = Number(process.versions.node.split('.')[0])

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      // Node 25+ a son propre localStorage global, qui masque celui de jsdom.
      execArgv: NODE_MAJOR >= 25 ? ['--no-experimental-webstorage'] : [],
      root: fileURLToPath(new URL('./', import.meta.url)),
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: ['src/**/__tests__/**', 'src/**/*.d.ts', 'src/main.ts'],
        reporter: ['text-summary', 'json-summary', 'lcov'],
        // Plancher juste sous le niveau mesuré : la couverture ne peut que monter (voir
        // docs/tests/README.md, § 16). Les écrans (.vue) sont couverts par les tests E2E.
        thresholds: { statements: 53, branches: 50, functions: 45, lines: 53 },
      },
    },
  }),
)
