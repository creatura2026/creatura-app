/**
 * Construit l'application de bureau.
 *
 *   node scripts/build.cjs --api <adresse du backend>   exe branché sur le backend
 *   node scripts/build.cjs --demo                        exe avec l'API simulée (aucun serveur)
 *   ajouter --start                                      lance l'app au lieu de produire l'exe
 *
 * Sans --api, l'adresse vient de la variable CREATURA_API_URL, sinon de config.json (copie de
 * config.example.json, non commitée). Elle est inscrite dans l'exe (app-config.json, généré) ;
 * un fichier creatura.json posé à côté de l'exe permet de la changer ensuite.
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
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
const demo = flag('demo')
const start = flag('start')

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

/** Adresse enregistrée dans config.json, s'il existe. */
function savedApiUrl() {
  const file = path.join(root, 'config.json')
  if (!fs.existsSync(file)) return undefined
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).apiUrl || undefined
  } catch {
    fail(`config.json n'est pas un JSON valide (${file}).`)
  }
}

let apiUrl = null
if (!demo) {
  const rawApi = option('api') ?? process.env.CREATURA_API_URL ?? savedApiUrl()
  if (!rawApi) {
    fail(
      'Adresse du backend manquante. Au choix :\n' +
        '  - copier config.example.json en config.json et y mettre le domaine CloudFront ;\n' +
        '  - ou la donner au build : pnpm desktop --api https://dxxxxxxxxxxxxx.cloudfront.net\n' +
        'Version sans serveur : pnpm desktop:demo',
    )
  }
  let url
  try {
    url = new URL(rawApi)
  } catch {
    fail(`Adresse du backend invalide : ${rawApi}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail(`L'adresse du backend doit commencer par http:// ou https:// (reçu : ${rawApi})`)
  }
  // Seule l'origine compte : l'app appelle toujours /api/v1/… sur ce serveur.
  apiUrl = url.origin
}

const run = (command) => {
  console.log(`\n> ${command}`)
  const { status } = spawnSync(command, { cwd: root, stdio: 'inherit', shell: true })
  if (status !== 0) process.exit(status ?? 1)
}

fs.writeFileSync(
  path.join(root, 'app-config.json'),
  `${JSON.stringify({ apiUrl, demo }, null, 2)}\n`,
)
console.log(demo ? 'Version démo (API simulée)' : `Backend : ${apiUrl}`)

run(
  `pnpm --filter player exec vite build ${demo ? '--mode mock ' : ''}--outDir ../desktop/web --emptyOutDir`,
)

if (start) {
  // Le terminal de VS Code définit ELECTRON_RUN_AS_NODE, qui empêche Electron d'ouvrir une fenêtre.
  delete process.env.ELECTRON_RUN_AS_NODE
  run('pnpm exec electron .')
} else {
  const release = path.join(root, 'release')
  // Dossier vidé : il ne contient que la version construite, prête à publier telle quelle.
  fs.rmSync(release, { recursive: true, force: true })
  run('pnpm exec electron-builder --win')
  writeManifest(release)
  console.log(`\nFichiers produits dans ${release}`)
}

/**
 * latest.json : la version publiée et ses fichiers. Le site le lit pour afficher la version et
 * la taille, et pour pointer vers le bon exe (les noms de fichiers contiennent la version).
 */
function writeManifest(release) {
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const describe = (file) => {
    const full = path.join(release, file)
    if (!fs.existsSync(full)) fail(`Fichier attendu introuvable : ${full}`)
    return { file, size: fs.statSync(full).size }
  }
  const manifest = {
    version,
    date: new Date().toISOString().slice(0, 10),
    demo,
    setup: describe(`Creatura-Setup-${version}.exe`),
    portable: describe(`Creatura-${version}-portable.exe`),
  }
  fs.writeFileSync(path.join(release, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`\nVersion ${version} : latest.json écrit`)
}
