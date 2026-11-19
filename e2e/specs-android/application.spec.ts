/**
 * M-01 à M-05 : l'application Android (APK Capacitor) sur un émulateur.
 *
 * Ce que l'APK ajoute au site, et que les tests du site sur viewport mobile ne couvrent pas :
 * l'installation et le lancement, la WebView et son identifiant (« CreaturaAndroid »), le bouton
 * retour d'Android, la page hors ligne, la session gardée quand l'application est fermée.
 *
 * Il faut un émulateur démarré (ou un téléphone branché) visible par adb, et les APK de test
 * (android/build-apks.ts) : sans appareil, les tests sont sautés en le disant.
 */
import fs from 'node:fs'

import { test, expect } from '@playwright/test'
import type { AndroidDevice, Page } from '@playwright/test'

import { DEMO_APK, OFFLINE_APK, OFFLINE_SITE } from '../android/build-apks.ts'
import {
  clearApp,
  connectDevice,
  inForeground,
  installApp,
  launchApp,
  pressBack,
  stopApp,
} from '../android/device.ts'
import { LoginForm } from '../pages/forms.ts'
import { BoosterPage, HomePage, LandingPage } from '../pages/player.ts'

test.describe.configure({ mode: 'serial' })

let device: AndroidDevice | null = null

test.beforeAll(async () => {
  device = await connectDevice()
})

test.afterAll(async () => {
  if (device) await stopApp(device).catch(() => {})
  await device?.close()
})

function requireDevice(apk: string): AndroidDevice {
  // eslint-disable-next-line playwright/no-skipped-test -- sans émulateur, rien à tester
  test.skip(!device, 'aucun appareil Android : démarrer un émulateur (adb devices)')
  // eslint-disable-next-line playwright/no-skipped-test -- APK construits par build:android
  test.skip(!fs.existsSync(apk), `APK de test absent : pnpm --filter e2e build:android (${apk})`)
  return device!
}

async function signInWithDemo(page: Page) {
  await new LandingPage(page).signInLink.click()
  const login = new LoginForm(page)
  await login.demoAccount('Dresseur').click()
  await login.submit.click()
  await expect(page).toHaveURL(/\/accueil$/)
}

test.describe('APK de démonstration', () => {
  test.beforeAll(async () => {
    if (device && fs.existsSync(DEMO_APK)) await installApp(device, DEMO_APK)
  })

  test.beforeEach(async () => {
    if (!device) return
    await stopApp(device)
    await clearApp(device)
  })

  test('M-01 : l’application s’installe, démarre sur l’accueil et se sait dans l’APK', { tag: '@smoke' }, async () => {
    const page = await launchApp(requireDevice(DEMO_APK))

    await expect(new LandingPage(page).title).toHaveText('CREATURA')
    expect(await page.evaluate(() => navigator.userAgent)).toContain('CreaturaAndroid')
    // Dans l'application, le site ne propose pas de télécharger l'application.
    await expect(new LandingPage(page).androidDownload).toBeHidden()
  })

  test('M-02 : connexion de démonstration, booster, collection', async () => {
    const page = await launchApp(requireDevice(DEMO_APK))
    await signInWithDemo(page)

    await new HomePage(page).boosterTile.click()
    const booster = new BoosterPage(page)
    await booster.openAndReveal()
    await expect(booster.cards).toHaveCount(5)
    await booster.toCollection.click()
    await expect(page).toHaveURL(/\/collection$/)
  })

  test('M-04 : le bouton retour revient à l’écran précédent, sans quitter l’application', async () => {
    const d = requireDevice(DEMO_APK)
    const page = await launchApp(d)
    await new LandingPage(page).signInLink.click()
    await expect(page).toHaveURL(/\/connexion$/)

    await pressBack(d)

    await expect(new LandingPage(page).title).toHaveText('CREATURA')
    expect(await inForeground(d)).toBe(true)
  })

  test('M-05 : la session survit à la fermeture et à la réouverture de l’application', async () => {
    const d = requireDevice(DEMO_APK)
    let page = await launchApp(d)
    await signInWithDemo(page)

    await stopApp(d)
    page = await launchApp(d)

    await expect(page).toHaveURL(/\/accueil$/)
    await expect(new HomePage(page).greeting).toContainText('Dresseur')
  })
})

test.describe('APK branché sur un site injoignable', () => {
  test('M-03 : sans réseau, la page hors ligne propose de réessayer', async () => {
    const d = requireDevice(OFFLINE_APK)
    await installApp(d, OFFLINE_APK)
    const page = await launchApp(d)

    await expect(page.getByRole('heading', { name: 'Connexion impossible' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('Vérifiez votre connexion internet, puis réessayez.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Réessayer' })).toHaveAttribute('href', `${OFFLINE_SITE}/`)
  })
})
