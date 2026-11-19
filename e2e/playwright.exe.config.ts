/**
 * Tests de l'exe Windows EMPAQUETÉ (specs-desktop/exe), sans stack ni serveur :
 *
 *   pnpm desktop                      construit l'exe (apps/desktop/release/win-unpacked)
 *   pnpm --filter e2e test:exe        le lance et le teste
 *
 * L'application non empaquetée, branchée sur la stack réelle, est testée avec la stack
 * (projet stack-desktop de playwright.stack.config.ts).
 */
import process from 'node:process'
import { defineConfig } from '@playwright/test'

const CI = !!process.env.CI

export default defineConfig({
  testDir: './specs-desktop/exe',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: 1,
  reporter: CI
    ? [['list'], ['github'], ['junit', { outputFile: 'reports/e2e-exe-junit.xml' }]]
    : [['list']],
  outputDir: 'test-results-exe',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
})
