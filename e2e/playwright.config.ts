/**
 * Tests de bout en bout de Créatura. Stratégie et liste des scénarios : docs/tests/README.md.
 *
 * Projets (API simulée) :
 *  - player-mock, admin-mock         : site joueur (specs/player) et dashboard (specs/admin), Chromium
 *  - *-firefox, *-webkit             : les mêmes tests dans Firefox et WebKit (Safari)
 *  - player-mobile, player-mobile-ios : tests étiquetés @mobile, sur Pixel 7 et iPhone 14
 *
 * `pnpm test:mock` lance les projets Chromium (chaque PR) ; `pnpm test:mock:all` lance tout.
 *
 * Les deux apps tournent sur des ports à elles (5174, 5175), pour ne pas gêner un `pnpm dev`
 * lancé à côté sur 5173. En local, un serveur déjà démarré sur ces ports est réutilisé : l'arrêter
 * après avoir changé de mode (E2E_SERVER).
 */
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI
/**
 * Serveur des apps : build de production servi par `vite preview` (rapide, proche du site publié),
 * ou serveur de développement (aucun build, pratique pour écrire un test). Preview par défaut en CI ;
 * en local, `E2E_SERVER=preview pnpm test:mock` pour l'essayer.
 */
const PREVIEW = (process.env.E2E_SERVER ?? (CI ? 'preview' : 'dev')) === 'preview'

const PLAYER_PORT = 5174
const ADMIN_PORT = 5175
const PLAYER_URL = `http://localhost:${PLAYER_PORT}`
const ADMIN_URL = `http://localhost:${ADMIN_PORT}`

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
    // Les animations (booster, cartes) respectent prefers-reduced-motion : tests plus rapides.
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    ...(['chromium', 'firefox', 'webkit'] as const).flatMap((browser) => {
      const device = { chromium: 'Desktop Chrome', firefox: 'Desktop Firefox', webkit: 'Desktop Safari' }[browser]
      const suffix = browser === 'chromium' ? '' : `-${browser}`
      // L'analyse axe fait planter l'onglet de Firefox (« Page crashed ») sur les écrans chargés de
      // cartes (booster, salle d'échange) : un plantage du navigateur, pas un défaut de la page. Le
      // résultat d'axe ne dépend pas du moteur : l'accessibilité est vérifiée sous Chromium et
      // WebKit, Firefox garde tous les parcours.
      const testIgnore = browser === 'firefox' ? /accessibilite\.spec\.ts/ : undefined
      return [
        {
          name: `player-mock${suffix}`,
          testDir: './specs/player',
          testIgnore,
          use: { ...devices[device], baseURL: PLAYER_URL },
        },
        {
          name: `admin-mock${suffix}`,
          testDir: './specs/admin',
          testIgnore,
          use: { ...devices[device], baseURL: ADMIN_URL },
        },
      ]
    }),
    {
      name: 'player-mobile',
      testDir: './specs/player',
      grep: /@mobile/,
      use: { ...devices['Pixel 7'], baseURL: PLAYER_URL },
    },
    {
      name: 'player-mobile-ios',
      testDir: './specs/player',
      grep: /@mobile/,
      use: { ...devices['iPhone 14'], baseURL: PLAYER_URL },
    },
  ],

  webServer: [
    { app: 'player', port: PLAYER_PORT },
    { app: 'admin', port: ADMIN_PORT },
  ].map(({ app, port }) => ({
    command: PREVIEW
      ? `pnpm --filter ${app} exec vite build --mode mock --outDir dist-e2e --emptyOutDir && ` +
        `pnpm --filter ${app} exec vite preview --mode mock --outDir dist-e2e --port ${port} --strictPort`
      : `pnpm --filter ${app} exec vite --mode mock --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !CI,
    timeout: 180_000,
  })),
})
