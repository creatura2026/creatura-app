/**
 * Construit les deux APK des tests Android (specs-android), avec apps/mobile/scripts/build.cjs :
 *
 *  - demo.apk    : l'API simulée embarquée, l'application fonctionne sans réseau ;
 *  - offline.apk : branché sur un site qui ne répond pas (10.0.2.2 = l'ordinateur hôte vu depuis
 *                  l'émulateur, port où rien n'écoute) : la page « Connexion impossible » s'affiche.
 *
 * Toujours en debug (sans les variables de signature) : un APK de debug autorise l'inspection de
 * sa WebView, que Playwright utilise pour piloter l'application.
 *
 * Les sorties du build de apps/mobile (release/, capacitor.config.json…) sont sauvegardées avant
 * et remises en place après : un APK construit à la main par l'utilisateur n'est pas perdu.
 *
 *   node android/build-apks.ts        (pnpm --filter e2e build:android)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const MOBILE = fileURLToPath(new URL('../../apps/mobile/', import.meta.url))
export const APKS_DIR = fileURLToPath(new URL('../.android-apps/', import.meta.url))
export const DEMO_APK = path.join(APKS_DIR, 'demo.apk')
export const OFFLINE_APK = path.join(APKS_DIR, 'offline.apk')
/** Site injoignable, vu depuis l'émulateur. */
export const OFFLINE_SITE = 'http://10.0.2.2:59999'

const KEPT = ['release', 'capacitor.config.json', 'web']

function build(args: string[], into: string) {
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (name.startsWith('ANDROID_KEY')) delete env[name]
  execFileSync('node', [path.join(MOBILE, 'scripts', 'build.cjs'), ...args], {
    cwd: MOBILE,
    env,
    stdio: 'inherit',
  })
  const apk = fs.readdirSync(path.join(MOBILE, 'release')).find((f) => f.endsWith('.apk'))
  if (!apk) throw new Error('APK introuvable après le build')
  fs.copyFileSync(path.join(MOBILE, 'release', apk), into)
}

export function buildApks() {
  fs.mkdirSync(APKS_DIR, { recursive: true })
  const backup = fs.mkdtempSync(path.join(APKS_DIR, 'sauvegarde-'))
  for (const name of KEPT) {
    const from = path.join(MOBILE, name)
    if (fs.existsSync(from)) fs.renameSync(from, path.join(backup, name))
  }
  try {
    build(['--demo'], DEMO_APK)
    build(['--url', OFFLINE_SITE], OFFLINE_APK)
  } finally {
    for (const name of KEPT) {
      fs.rmSync(path.join(MOBILE, name), { recursive: true, force: true })
      const saved = path.join(backup, name)
      if (fs.existsSync(saved)) fs.renameSync(saved, path.join(MOBILE, name))
    }
    fs.rmSync(backup, { recursive: true, force: true })
  }
  console.log(`\nAPK de test : ${DEMO_APK}, ${OFFLINE_APK}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) buildApks()
