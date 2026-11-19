/**
 * Construit l'application Android (APK).
 *
 *   node scripts/build.cjs --url <adresse du site>   APK qui ouvre le site en ligne
 *   node scripts/build.cjs --demo                     APK avec l'API simulée embarquée (aucun serveur)
 *
 * Sans --url, l'adresse vient de la variable CREATURA_SITE_URL, sinon de config.json (copie de
 * config.example.json, non commitée).
 *
 * Signature : avec les variables ANDROID_KEYSTORE_FILE, ANDROID_KEYSTORE_PASSWORD,
 * ANDROID_KEY_ALIAS et ANDROID_KEY_PASSWORD, APK « release » signé avec cette clé ; sans elles,
 * APK « debug » signé avec la clé de debug d'Android (installable, mais une mise à jour construite
 * sur une autre machine demande de désinstaller l'ancienne version).
 *
 * Le projet Android (android/) est généré par Capacitor à chaque build : il n'est pas commité.
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => {
  const inline = args.find((a) => a.startsWith(`--${name}=`))
  if (inline) return inline.slice(name.length + 3)
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const root = path.resolve(__dirname, '..')
const playerPublic = path.resolve(root, '../player/public')
const android = path.join(root, 'android')
const res = path.join(android, 'app/src/main/res')
const demo = flag('demo')

const APP_ID = 'fr.esigelec.creatura'
const APP_NAME = 'Créatura'
/** Ajouté à l'identifiant du navigateur : le site sait qu'il tourne dans l'application. */
const USER_AGENT_MARK = 'CreaturaAndroid'
const COLORS = { cream: '#FFF7E7', ink: '#25334B' }

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

const run = (command, cwd = root) => {
  console.log(`\n> ${command}`)
  const { status } = spawnSync(command, { cwd, stdio: 'inherit', shell: true })
  if (status !== 0) process.exit(status ?? 1)
}

// --- SDK Android : vérifié avant tout le reste, plutôt qu'après plusieurs minutes de Gradle ---
function androidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === 'win32' && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
      : path.join(os.homedir(), 'Android', 'Sdk'),
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  ]
  return candidates.find((dir) => dir && fs.existsSync(dir))
}
const sdk = androidSdk()
if (!sdk) {
  fail(
    'SDK Android introuvable. Installer Android Studio (il installe le SDK), ou définir ANDROID_HOME.\n' +
      'Dans la CI, le runner ubuntu-latest le fournit déjà.',
  )
}

// --- Signature : les quatre variables, ou aucune ---
const signing = [
  'ANDROID_KEYSTORE_FILE',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
]
const signed = signing.every((name) => process.env[name])
if (!signed && signing.some((name) => process.env[name])) {
  fail(`Signature incomplète : définir les quatre variables ${signing.join(', ')}.`)
}

// --- Adresse du site ---
function savedSiteUrl() {
  const file = path.join(root, 'config.json')
  if (!fs.existsSync(file)) return undefined
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).siteUrl || undefined
  } catch {
    fail(`config.json n'est pas un JSON valide (${file}).`)
  }
}

let siteUrl = null
if (!demo) {
  const raw = option('url') ?? process.env.CREATURA_SITE_URL ?? savedSiteUrl()
  if (!raw) {
    fail(
      'Adresse du site manquante. Au choix :\n' +
        '  - copier config.example.json en config.json (domaine du site déjà rempli) ;\n' +
        '  - ou la donner au build : pnpm mobile --url https://creatura.creasmaloud.dev\n' +
        'Version sans serveur : pnpm mobile:demo',
    )
  }
  let url
  try {
    url = new URL(raw)
  } catch {
    fail(`Adresse du site invalide : ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail(`L'adresse du site doit commencer par http:// ou https:// (reçu : ${raw})`)
  }
  siteUrl = url.origin
}
console.log(demo ? 'Version démo (API simulée)' : `Site : ${siteUrl}`)

const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const [major, minor, patch] = version.split('.').map((n) => Number.parseInt(n, 10))
if ([major, minor, patch].some((n) => !Number.isInteger(n))) {
  fail(`Version invalide dans package.json : ${version} (attendu : 1.2.3)`)
}
// Android compare les versionCode entiers : 0.1.2 → 102, 1.0.0 → 10000.
const versionCode = major * 10000 + minor * 100 + patch

// --- Pages embarquées ---
const web = path.join(root, 'web')
if (demo) {
  // Toute l'application, avec l'API simulée : elle fonctionne sans réseau.
  run('pnpm --filter player exec vite build --mode mock --outDir ../mobile/web --emptyOutDir')
} else {
  // L'application ouvre le site en ligne : seule la page affichée sans connexion est embarquée.
  fs.rmSync(web, { recursive: true, force: true })
  fs.mkdirSync(web, { recursive: true })
  fs.writeFileSync(path.join(web, 'index.html'), offlinePage(siteUrl))
  fs.writeFileSync(path.join(web, 'erreur.html'), offlinePage(siteUrl))
}

// --- Configuration Capacitor ---
const config = {
  appId: APP_ID,
  appName: APP_NAME,
  webDir: 'web',
  appendUserAgent: USER_AGENT_MARK,
  backgroundColor: COLORS.cream,
  server: demo
    ? { androidScheme: 'https' }
    : {
        // Même domaine que le site : session, API et salle d'échange (WebSocket) sans CORS.
        url: siteUrl,
        cleartext: siteUrl.startsWith('http:'),
        errorPath: 'erreur.html',
      },
}
fs.writeFileSync(path.join(root, 'capacitor.config.json'), `${JSON.stringify(config, null, 2)}\n`)

// --- Projet Android, régénéré à chaque build ---
fs.rmSync(android, { recursive: true, force: true })
run('pnpm exec cap add android')
customizeAndroidProject()
run('pnpm exec cap sync android')

// --- APK ---
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
if (process.platform !== 'win32') fs.chmodSync(path.join(android, 'gradlew'), 0o755)
if (signed) {
  const keystore = path.resolve(process.env.ANDROID_KEYSTORE_FILE)
  if (!fs.existsSync(keystore)) fail(`Keystore introuvable : ${keystore}`)
  // Propriétés de signature d'Android Gradle (android.injected.signing.*), passées par
  // l'environnement plutôt que sur la ligne de commande, où les mots de passe seraient visibles.
  const inject = {
    'store.file': keystore,
    'store.password': process.env.ANDROID_KEYSTORE_PASSWORD,
    'key.alias': process.env.ANDROID_KEY_ALIAS,
    'key.password': process.env.ANDROID_KEY_PASSWORD,
  }
  for (const [name, value] of Object.entries(inject)) {
    process.env[`ORG_GRADLE_PROJECT_android.injected.signing.${name}`] = value
  }
}
console.log(
  signed ? 'Signature : clé de publication' : 'Signature : clé de debug (aucune clé fournie)',
)
run(`${gradlew} ${signed ? 'assembleRelease' : 'assembleDebug'} --no-daemon`, android)

const built = path.join(
  android,
  'app/build/outputs/apk',
  signed ? 'release/app-release.apk' : 'debug/app-debug.apk',
)
if (!fs.existsSync(built)) fail(`APK attendu introuvable : ${built}`)

const release = path.join(root, 'release')
// Dossier vidé : il ne contient que la version construite, prête à publier telle quelle.
fs.rmSync(release, { recursive: true, force: true })
fs.mkdirSync(release, { recursive: true })
const apkName = `Creatura-${version}.apk`
fs.copyFileSync(built, path.join(release, apkName))
writeManifest(release, apkName)
console.log(`\nFichiers produits dans ${release}`)

/**
 * Nom, version, icône et écran de lancement aux couleurs de Créatura, à la place de ceux de
 * Capacitor.
 */
function customizeAndroidProject() {
  const gradleFile = path.join(android, 'app/build.gradle')
  const gradle = fs
    .readFileSync(gradleFile, 'utf8')
    .replace(/versionCode \d+/, `versionCode ${versionCode}`)
    .replace(/versionName "[^"]*"/, `versionName "${version}"`)
  fs.writeFileSync(gradleFile, gradle)

  // Icône : PNG classique (Android 7) et icône adaptative (Android 8 et plus) dessinée à partir
  // de l'icône « maskable » de la PWA, prévue pour être rognée.
  const icon = path.join(playerPublic, 'pwa-512x512.png')
  const maskable = path.join(playerPublic, 'maskable-icon-512x512.png')
  for (const dir of fs
    .readdirSync(res)
    .filter((d) => d.startsWith('mipmap-') && !d.includes('anydpi'))) {
    fs.copyFileSync(icon, path.join(res, dir, 'ic_launcher.png'))
    fs.copyFileSync(icon, path.join(res, dir, 'ic_launcher_round.png'))
    fs.copyFileSync(maskable, path.join(res, dir, 'ic_launcher_foreground.png'))
  }
  fs.writeFileSync(
    path.join(res, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${COLORS.cream}</color>\n</resources>\n`,
  )

  // Écran de lancement : fond crème et logo au centre, à la place des images de Capacitor.
  for (const dir of fs.readdirSync(res).filter((d) => d.startsWith('drawable'))) {
    fs.rmSync(path.join(res, dir, 'splash.png'), { force: true })
  }
  fs.mkdirSync(path.join(res, 'drawable-nodpi'), { recursive: true })
  fs.copyFileSync(icon, path.join(res, 'drawable-nodpi/creatura_logo.png'))
  fs.writeFileSync(
    path.join(res, 'values/creatura_colors.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="creatura_cream">${COLORS.cream}</color>\n    <color name="creatura_ink">${COLORS.ink}</color>\n</resources>\n`,
  )
  fs.writeFileSync(
    path.join(res, 'drawable/splash.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/creatura_cream" />
    <item android:width="160dp" android:height="160dp" android:gravity="center">
        <bitmap android:src="@drawable/creatura_logo" android:filter="false" />
    </item>
</layer-list>
`,
  )
  const stylesFile = path.join(res, 'values/styles.xml')
  const styles = fs.readFileSync(stylesFile, 'utf8')
  const launch = '<item name="android:background">@drawable/splash</item>'
  if (!styles.includes(launch)) fail(`Thème de lancement inattendu dans ${stylesFile}`)
  fs.writeFileSync(
    stylesFile,
    styles.replace(
      launch,
      `${launch}\n        <item name="windowSplashScreenBackground">@color/creatura_cream</item>`,
    ),
  )
}

/** Version minimale d'Android lisible (« 7.0 »), d'après le minSdkVersion du projet. */
function minAndroidVersion() {
  const variables = fs.readFileSync(path.join(android, 'variables.gradle'), 'utf8')
  const sdkLevel = Number(/minSdkVersion\s*=\s*(\d+)/.exec(variables)?.[1])
  const names = {
    23: '6.0',
    24: '7.0',
    25: '7.1',
    26: '8.0',
    27: '8.1',
    28: '9',
    29: '10',
    30: '11',
    31: '12',
    32: '12L',
    33: '13',
    34: '14',
    35: '15',
    36: '16',
  }
  return names[sdkLevel]
}

/**
 * android.json : la version publiée et son APK. Le site le lit pour afficher la version et la
 * taille, et pour pointer vers le bon fichier (le nom contient la version).
 */
function writeManifest(dir, file) {
  const manifest = {
    version,
    date: new Date().toISOString().slice(0, 10),
    demo,
    minAndroid: minAndroidVersion(),
    apk: { file, size: fs.statSync(path.join(dir, file)).size },
  }
  fs.writeFileSync(path.join(dir, 'android.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`\nVersion ${version} : android.json écrit`)
}

/** Page affichée quand le site ne répond pas (pas de réseau, serveur arrêté). */
function offlinePage(url) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${APP_NAME}</title>
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: grid; place-items: center; padding: 24px; box-sizing: border-box;
    background: ${COLORS.cream}; color: ${COLORS.ink};
    font: 16px/1.5 system-ui, sans-serif; text-align: center;
  }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { margin: 0 0 24px; }
  a {
    display: inline-block; padding: 10px 20px; border: 2px solid ${COLORS.ink};
    background: #f6cb67; color: ${COLORS.ink}; font-weight: 600; text-decoration: none;
    box-shadow: 4px 4px 0 ${COLORS.ink};
  }
</style>
</head>
<body>
<main>
  <h1>Connexion impossible</h1>
  <p>Vérifiez votre connexion internet, puis réessayez.</p>
  <a href="${url}/">Réessayer</a>
</main>
</body>
</html>
`
}
