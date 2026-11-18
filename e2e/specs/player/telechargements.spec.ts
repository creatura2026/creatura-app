/**
 * P-19 : la page d'accueil propose l'application de l'appareil du visiteur.
 *
 * Les manifestes (`/telechargements/latest.json` pour Windows, `android.json` pour Android) sont
 * servis par le test : ils ne dépendent pas d'un exe ou d'un APK construit sur la machine.
 */
import { devices, type Page } from '@playwright/test'

import { test, expect } from '../../fixtures/player.ts'

const MB = 1024 * 1024

async function serveManifests(page: Page, files: { windows?: object; android?: object }) {
  await page.route('**/telechargements/latest.json', (route) =>
    files.windows ? route.fulfill({ json: files.windows }) : route.fulfill({ status: 404 }),
  )
  await page.route('**/telechargements/android.json', (route) =>
    files.android ? route.fulfill({ json: files.android }) : route.fulfill({ status: 404 }),
  )
}

test.describe('sur un ordinateur', () => {
  test('l’exe publié est proposé, avec sa version et sa taille', async ({ page, landingPage }) => {
    await serveManifests(page, {
      windows: {
        version: '1.2.3',
        date: '2026-11-16',
        setup: { file: 'Creatura-Setup-1.2.3.exe', size: 120 * MB },
      },
    })
    await landingPage.goto()

    await expect(landingPage.windowsDownload).toHaveAttribute(
      'href',
      '/telechargements/Creatura-Setup-1.2.3.exe',
    )
    await expect(page.getByText('Version 1.2.3, 120 Mo').first()).toBeVisible()
    await expect(landingPage.androidDownload).toBeHidden()
  })

  test('sans exe publié, aucun lien de téléchargement', async ({ page, landingPage }) => {
    await serveManifests(page, {})
    await landingPage.goto()

    await expect(landingPage.title).toHaveText('CREATURA')
    await expect(landingPage.windowsDownload).toBeHidden()
  })
})

test.describe('sur un téléphone Android', () => {
  test.use({ userAgent: devices['Pixel 7'].userAgent, viewport: devices['Pixel 7'].viewport })

  test('l’APK publié est proposé, pas l’exe', async ({ page, landingPage }) => {
    await serveManifests(page, {
      windows: { version: '1.2.3', setup: { file: 'Creatura-Setup-1.2.3.exe', size: 120 * MB } },
      android: { version: '0.1.0', apk: { file: 'Creatura-0.1.0.apk', size: 12 * MB } },
    })
    await landingPage.goto()

    await expect(landingPage.androidDownload).toHaveAttribute(
      'href',
      '/telechargements/Creatura-0.1.0.apk',
    )
    await expect(landingPage.windowsDownload).toBeHidden()
  })
})
