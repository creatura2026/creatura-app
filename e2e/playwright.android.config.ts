/**
 * Tests de l'application Android (specs-android) sur un émulateur, avec Playwright Android.
 *
 *   1. démarrer un émulateur (Android Studio, ou `emulator -avd <nom>`) : `adb devices` le liste ;
 *   2. pnpm --filter e2e build:android       construit les APK de test (debug) ;
 *   3. pnpm --filter e2e test:android
 *
 * En CI : job e2e-mobile (émulateur sur runner Linux). Voir docs/tests/README.md (§ 11).
 */
import process from 'node:process'
import { defineConfig } from '@playwright/test'

const CI = !!process.env.CI

export default defineConfig({
  testDir: './specs-android',
  // Un émulateur est lent : lancement de l'application, WebView, animations.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: 1,
  reporter: CI
    ? [
        ['list'],
        ['github'],
        ['html', { open: 'never', outputFolder: 'playwright-report-android' }],
        ['junit', { outputFile: 'reports/e2e-android-junit.xml' }],
      ]
    : [['list'], ['html', { open: 'on-failure', outputFolder: 'playwright-report-android' }]],
  outputDir: 'test-results-android',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
})
