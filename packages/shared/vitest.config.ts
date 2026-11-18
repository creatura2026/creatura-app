import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const NODE_MAJOR = Number(process.versions.node.split('.')[0])

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    // Node 25+ a son propre localStorage global, qui masque celui de jsdom.
    execArgv: NODE_MAJOR >= 25 ? ['--no-experimental-webstorage'] : [],
    root: fileURLToPath(new URL('./', import.meta.url)),
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.d.ts', 'src/fixtures/**'],
      reporter: ['text-summary', 'json-summary', 'lcov'],
      // Plancher juste sous le niveau mesuré : la couverture ne peut que monter (voir
      // docs/tests/README.md, § 16). Les écrans (.vue) sont couverts par les tests E2E.
      thresholds: { statements: 27, branches: 25, functions: 24, lines: 28 },
    },
  },
})
