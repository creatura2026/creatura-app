/**
 * E-01, E-02 (D-01 et D-05 sur l'exe EMPAQUETÉ) : l'exe produit par `pnpm desktop` démarre, sert le
 * site qu'il embarque, et lit l'adresse du backend dans l'ordre prévu (main.cjs) :
 * CREATURA_API_URL, puis creatura.json à côté de l'exe, puis l'adresse du build.
 *
 * Windows seulement. L'exe ne parle jamais au vrai backend : son adresse est toujours remplacée par
 * un serveur éteint (127.0.0.1). Exe : apps/desktop/release/win-unpacked/Creatura.exe, ou
 * E2E_DESKTOP_EXE.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { test, expect } from '@playwright/test'

import { LoginForm } from '../../pages/forms.ts'
import { LandingPage } from '../../pages/player.ts'
import { BUILT_EXE, DEAD_API, exeIsFresh, launchApp, type RunningApp } from '../../desktop/app.ts'

test.describe.configure({ mode: 'serial' })

// Sauts voulus : ces tests n'ont de sens que sous Windows, avec un exe construit à jour.
// eslint-disable-next-line playwright/no-skipped-test
test.skip(process.platform !== 'win32', 'l’exe Windows ne se lance que sous Windows')
// eslint-disable-next-line playwright/no-skipped-test
test.skip(
  !exeIsFresh(),
  `exe absent ou plus ancien que main.cjs : le reconstruire (pnpm desktop) — ${BUILT_EXE}`,
)

const CONFIG_FILE = path.join(path.dirname(BUILT_EXE), 'creatura.json')
const OTHER_DEAD_API = 'http://127.0.0.1:59998'

let app: RunningApp | undefined
let savedConfig: string | null = null

test.beforeAll(() => {
  // creatura.json est un réglage de l'utilisateur : il est remis en place après les tests.
  savedConfig = fs.existsSync(CONFIG_FILE) ? fs.readFileSync(CONFIG_FILE, 'utf8') : null
})

test.afterEach(async () => {
  await app?.close()
  app = undefined
})

test.afterAll(() => {
  if (savedConfig === null) fs.rmSync(CONFIG_FILE, { force: true })
  else fs.writeFileSync(CONFIG_FILE, savedConfig)
})

/** Tente une connexion : l'erreur affichée dit quel serveur l'app a voulu joindre. */
async function serverTried(app: RunningApp): Promise<void> {
  await app.window.goto(`${app.origin}/connexion`)
  await new LoginForm(app.window).signIn({ login: 'personne', password: 'mot-de-passe-e2e-1234' })
}

test('E-01 : l’exe démarre et sert le site qu’il embarque', { tag: '@smoke' }, async () => {
  fs.rmSync(CONFIG_FILE, { force: true })
  app = await launchApp({ executablePath: BUILT_EXE }, { CREATURA_API_URL: DEAD_API })

  await expect(new LandingPage(app.window).title).toHaveText('CREATURA')
  expect(app.window.url()).toBe(`${app.origin}/`)
  const userData = await app.electron.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
  expect(userData).toBe(app.userData)
})

test('E-02 : creatura.json l’emporte sur le build, CREATURA_API_URL sur creatura.json', async () => {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ apiUrl: OTHER_DEAD_API }))

  app = await launchApp({ executablePath: BUILT_EXE })
  await serverTried(app)
  await expect(app.window.getByText(`Le serveur Créatura (${OTHER_DEAD_API}) ne répond pas.`)).toBeVisible()
  await app.close()

  app = await launchApp({ executablePath: BUILT_EXE }, { CREATURA_API_URL: DEAD_API })
  await serverTried(app)
  await expect(app.window.getByText(`Le serveur Créatura (${DEAD_API}) ne répond pas.`)).toBeVisible()
})
