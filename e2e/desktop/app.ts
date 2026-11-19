/**
 * Application Windows (apps/desktop) pilotée par Playwright (`_electron`).
 *
 * Les tests ne touchent ni à apps/desktop/web ni à app-config.json : chaque variante (démo, stack…)
 * est un petit dossier d'application dans e2e/.desktop-apps/, avec le VRAI main.cjs, son propre
 * app-config.json et le site joueur construit pour elle. Chaque lancement a son dossier de données
 * (CREATURA_USER_DATA) et son port (CREATURA_PORT) : rien n'est partagé avec l'app de l'utilisateur.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { _electron, type ElectronApplication, type Page } from '@playwright/test'

const DESKTOP_DIR = fileURLToPath(new URL('../../apps/desktop/', import.meta.url))
const APPS_DIR = fileURLToPath(new URL('../.desktop-apps/', import.meta.url))

/** Le binaire Electron installé pour apps/desktop. */
const ELECTRON = createRequire(path.join(DESKTOP_DIR, 'package.json'))('electron') as unknown as string

/** Adresse où rien n'écoute : un backend injoignable. */
export const DEAD_API = 'http://127.0.0.1:59999'

export interface AppVariant {
  dir: string
}

/**
 * Prépare une variante de l'application : site joueur construit (avec l'API simulée si `demo`),
 * main.cjs et app-config.json comme les produit scripts/build.cjs.
 */
export function prepareApp(name: string, config: { demo: boolean; apiUrl: string | null }): AppVariant {
  const dir = path.join(APPS_DIR, name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  execFileSync(
    'pnpm',
    [
      '--filter',
      'player',
      'exec',
      'vite',
      'build',
      ...(config.demo ? ['--mode', 'mock'] : []),
      '--outDir',
      path.join(dir, 'web'),
      '--emptyOutDir',
    ],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  )
  fs.copyFileSync(path.join(DESKTOP_DIR, 'main.cjs'), path.join(dir, 'main.cjs'))
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'creatura-desktop-e2e', version: '0.0.0', main: 'main.cjs' }),
  )
  fs.writeFileSync(path.join(dir, 'app-config.json'), JSON.stringify(config))
  return { dir }
}

export interface RunningApp {
  electron: ElectronApplication
  window: Page
  /** Origine du serveur local de l'application : http://127.0.0.1:<port> */
  origin: string
  userData: string
  close: () => Promise<void>
}

let nextPort = 47400

/** Lance l'application (variante non empaquetée, ou exe avec `executablePath`). */
export async function launchApp(
  target: AppVariant | { executablePath: string },
  env: Record<string, string> = {},
): Promise<RunningApp> {
  const port = nextPort++
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'creatura-e2e-'))
  const baseEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) baseEnv[key] = value
  // Le terminal de VS Code définit ELECTRON_RUN_AS_NODE, qui empêche Electron d'ouvrir une fenêtre.
  delete baseEnv.ELECTRON_RUN_AS_NODE
  // Sous Linux en CI, le bac à sable de Chromium demande des droits que le runner n'a pas.
  const linuxArgs = process.platform === 'linux' ? ['--no-sandbox'] : []

  const electron = await _electron.launch({
    ...('executablePath' in target
      ? { executablePath: target.executablePath, args: linuxArgs }
      : { executablePath: ELECTRON, args: [target.dir, ...linuxArgs] }),
    env: { ...baseEnv, CREATURA_PORT: String(port), CREATURA_USER_DATA: userData, ...env },
  })
  const window = await electron.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  return {
    electron,
    window,
    origin: `http://127.0.0.1:${port}`,
    userData,
    close: async () => {
      await electron.close().catch(() => {})
      fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    },
  }
}

/**
 * Remplace shell.openExternal dans le processus principal : les adresses qu'Electron voudrait
 * ouvrir dans le navigateur du système sont notées au lieu d'être ouvertes.
 */
export async function recordExternalLinks(app: RunningApp): Promise<() => Promise<string[]>> {
  await app.electron.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as unknown as { __opened: string[] }).__opened = opened
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  })
  return () =>
    app.electron.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened)
}

/** L'exe construit par `pnpm desktop` (ou E2E_DESKTOP_EXE). */
export const BUILT_EXE =
  process.env.E2E_DESKTOP_EXE ?? path.join(DESKTOP_DIR, 'release', 'win-unpacked', 'Creatura.exe')

/** L'exe a-t-il été construit après la dernière modification de main.cjs ? */
export function exeIsFresh(exe = BUILT_EXE): boolean {
  if (!fs.existsSync(exe)) return false
  return fs.statSync(exe).mtimeMs >= fs.statSync(path.join(DESKTOP_DIR, 'main.cjs')).mtimeMs
}
