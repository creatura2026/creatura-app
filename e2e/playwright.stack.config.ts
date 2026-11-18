/**
 * Tests de bout en bout sur la STACK RÉELLE : base PostgreSQL et API en Docker (compose.yaml),
 * site joueur et dashboard construits sans API simulée. Stratégie : docs/tests/README.md (§ 9).
 *
 *   pnpm --filter e2e test:stack
 *
 * Docker doit tourner. La stack est démarrée puis arrêtée par stack/global-setup.ts
 * (E2E_STACK=external si elle tourne déjà, E2E_KEEP_STACK=1 pour la garder après les tests).
 *
 * Projets :
 *  - stack-player, stack-realtime, stack-admin : en parallèle, chaque test crée ses joueurs ;
 *  - stack-serial : APRÈS les autres et un test à la fois, car ces tests touchent toute la stack :
 *    réglages communs (cartes par booster), passage de minuit simulé, redémarrage de l'API.
 */
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

import { API_ORIGIN } from './stack/api.ts'
import { ADMIN_PORT, ADMIN_URL, PLAYER_PORT, PLAYER_URL } from './stack/urls.ts'

const CI = !!process.env.CI

const chrome = devices['Desktop Chrome']

export default defineConfig({
  testDir: './specs-stack',
  globalSetup: './stack/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : 4,
  reporter: CI
    ? [
        ['list'],
        ['github'],
        ['html', { open: 'never', outputFolder: 'playwright-report-stack' }],
        ['junit', { outputFile: 'reports/e2e-stack-junit.xml' }],
      ]
    : [['list'], ['html', { open: 'on-failure', outputFolder: 'playwright-report-stack' }]],
  outputDir: 'test-results-stack',

  use: {
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    serviceWorkers: 'block',
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'stack-player', testDir: './specs-stack/player', use: { ...chrome, baseURL: PLAYER_URL } },
    { name: 'stack-realtime', testDir: './specs-stack/realtime', use: { ...chrome, baseURL: PLAYER_URL } },
    { name: 'stack-admin', testDir: './specs-stack/admin', use: { ...chrome, baseURL: ADMIN_URL } },
    {
      name: 'stack-serial',
      testDir: './specs-stack/serial',
      dependencies: ['stack-player', 'stack-realtime', 'stack-admin'],
      fullyParallel: false,
      use: { ...chrome, baseURL: PLAYER_URL },
    },
  ],

  // Apps construites SANS l'API simulée, servies par vite preview, qui relaie /api (et le
  // WebSocket de la salle d'échange) vers l'API de la stack.
  webServer: [
    { app: 'player', port: PLAYER_PORT },
    { app: 'admin', port: ADMIN_PORT },
  ].map(({ app, port }) => ({
    command:
      `pnpm --filter ${app} exec vite build --outDir dist-e2e-stack --emptyOutDir && ` +
      `pnpm --filter ${app} exec vite preview --outDir dist-e2e-stack --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    env: { API_PROXY_TARGET: API_ORIGIN },
    reuseExistingServer: !CI,
    timeout: 180_000,
  })),
})
