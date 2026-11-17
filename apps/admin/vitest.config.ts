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
    },
  }),
)
