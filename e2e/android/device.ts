/**
 * Application Android pilotée par Playwright (`_android`) sur un émulateur ou un téléphone branché
 * (adb). L'APK de debug autorise l'inspection de sa WebView : Playwright la voit comme une page,
 * et les page objects du site s'y appliquent tels quels.
 */
import net from 'node:net'

import { _android, type AndroidDevice, type Page } from '@playwright/test'

export const PACKAGE = 'fr.esigelec.creatura'
const ACTIVITY = `${PACKAGE}/.MainActivity`

/** Le serveur adb écoute-t-il (port 5037) ? Sans lui, Playwright échouerait hors du test. */
function adbRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(5037, '127.0.0.1')
    socket.setTimeout(1_000)
    const done = (running: boolean) => {
      socket.destroy()
      resolve(running)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.once('timeout', () => done(false))
  })
}

/** Premier appareil vu par adb, ou null (pas d'adb, ou pas d'émulateur démarré). */
export async function connectDevice(): Promise<AndroidDevice | null> {
  if (!(await adbRunning())) return null
  try {
    const [device] = await _android.devices()
    return device ?? null
  } catch {
    return null
  }
}

/** Installe un APK sur un appareil propre (désinstallation d'abord : aucune donnée gardée). */
export async function installApp(device: AndroidDevice, apk: string) {
  await device.shell(`pm uninstall ${PACKAGE}`).catch(() => {})
  await device.installApk(apk)
}

/** Lance l'application et renvoie sa WebView, vue comme une page Playwright. */
export async function launchApp(device: AndroidDevice): Promise<Page> {
  await device.shell(`am start -W -n ${ACTIVITY}`)
  const webView = await device.webView({ pkg: PACKAGE }, { timeout: 60_000 })
  const page = await webView.page()
  await page.waitForLoadState('domcontentloaded')
  return page
}

/** Ferme complètement l'application (comme un balayage dans les applications récentes). */
export async function stopApp(device: AndroidDevice) {
  await device.shell(`am force-stop ${PACKAGE}`)
}

/** Efface les données de l'application (session, stockage local de l'API simulée). */
export async function clearApp(device: AndroidDevice) {
  await device.shell(`pm clear ${PACKAGE}`)
}

/** Bouton retour d'Android. */
export async function pressBack(device: AndroidDevice) {
  await device.shell('input keyevent KEYCODE_BACK')
}

/** L'application est-elle au premier plan ? */
export async function inForeground(device: AndroidDevice): Promise<boolean> {
  const activities = String(await device.shell('dumpsys activity activities'))
  return activities
    .split('\n')
    .some((line) => /mResumedActivity|topResumedActivity/.test(line) && line.includes(PACKAGE))
}
