/**
 * Tests de bout en bout de Créatura. Stratégie et liste des scénarios : docs/tests/README.md.
 *
 * Projets :
 *  - player-mock : site joueur sur l'API simulée (specs/player)
 *  - admin-mock  : dashboard admin sur l'API simulée (specs/admin)
 *
 * Les deux apps tournent sur des ports à elles (5174, 5175), pour ne pas gêner un `pnpm dev`
 * lancé à côté sur 5173. En local, un serveur déjà démarré sur ces ports est réutilisé.
 */
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

const PLAYER_PORT = 5174
const ADMIN_PORT = 5175

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  // Le serveur Vite compile les pages à la première visite : un peu de marge.
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [
        ['list'],
        ['github'],
        ['html', { open: 'never' }],
        ['junit', { outputFile: 'reports/e2e-junit.xml' }],
      ]
    : [['list'], ['html', { open: 'on-failure' }]],

  use: {
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    // Le service worker de la PWA mettrait des pages en cache d'un test à l'autre.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'player-mock',
      testDir: './specs/player',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PLAYER_PORT}` },
    },
    {
      name: 'admin-mock',
      testDir: './specs/admin',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${ADMIN_PORT}` },
    },
  ],

  webServer: [
    {
      command: `pnpm --filter player exec vite --mode mock --port ${PLAYER_PORT} --strictPort`,
      url: `http://localhost:${PLAYER_PORT}`,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      command: `pnpm --filter admin exec vite --mode mock --port ${ADMIN_PORT} --strictPort`,
      url: `http://localhost:${ADMIN_PORT}`,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
})
