/**
 * Application de bureau Créatura : la PWA joueur dans une fenêtre Electron.
 *
 * Un petit serveur local (127.0.0.1) sert le build de la PWA (`web/`) et relaie `/api` vers le
 * backend, WebSocket de la salle d'échange compris. Le front appelle donc la même origine que
 * derrière le proxy Vite ou l'Ingress : il n'a besoin d'aucune adaptation.
 *
 * Adresse du backend, de la plus prioritaire à la moins prioritaire :
 *  1. variable d'environnement CREATURA_API_URL ;
 *  2. fichier creatura.json à côté de l'exe : { "apiUrl": "http://…" }. Il évite de reconstruire
 *     l'exe quand l'adresse du load balancer change (recréation de l'infra) ;
 *  3. adresse inscrite au build (app-config.json, voir scripts/build.cjs) ;
 *  4. http://localhost:8000.
 * CREATURA_PORT : port du serveur local (défaut 47321). Il doit rester le même d'un lancement à
 * l'autre : la session et les données locales sont rattachées à cette origine.
 */
const { app, BrowserWindow, Menu, dialog, session, shell } = require('electron')
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const path = require('node:path')
const tls = require('node:tls')

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}
const BUILT = readJson(path.join(__dirname, 'app-config.json'))
// L'exe portable s'extrait dans un dossier temporaire : son vrai dossier est dans cette variable.
const EXE_DIR = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe'))
const LOCAL = app.isPackaged ? readJson(path.join(EXE_DIR, 'creatura.json')) : {}

// La démo garde ses données à part : ses comptes simulés ne se mélangent pas aux vrais.
if (BUILT.demo) app.setPath('userData', path.join(app.getPath('appData'), 'Creatura Demo'))

const PORT = Number(process.env.CREATURA_PORT || 47321)
const API_SETTING =
  process.env.CREATURA_API_URL || LOCAL.apiUrl || BUILT.apiUrl || 'http://localhost:8000'
let API
try {
  API = new URL(API_SETTING)
} catch {
  API = null
}
const API_SECURE = API?.protocol === 'https:'
const API_PORT = Number(API?.port || (API_SECURE ? 443 : 80))
const WEB = path.join(__dirname, 'web')
const ORIGIN = `http://127.0.0.1:${PORT}`

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
}

/** Fichiers du build ; toute adresse sans extension renvoie index.html (routes de l'app). */
function serveStatic(req, res) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, ORIGIN).pathname)
  } catch {
    res.writeHead(400).end()
    return
  }
  // Pas de service worker : l'application installée fournit déjà les fichiers, et un cache
  // pourrait afficher une ancienne version après une mise à jour.
  if (pathname === '/registerSW.js') {
    res.writeHead(200, { 'Content-Type': MIME['.js'] }).end('')
    return
  }
  let file = path.join(WEB, path.normalize(pathname))
  if (!file.startsWith(WEB)) {
    res.writeHead(403).end()
    return
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(pathname)) {
      res.writeHead(404).end()
      return
    }
    file = path.join(WEB, 'index.html')
  }
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
  const isAsset = file.includes(`${path.sep}assets${path.sep}`)
  res.writeHead(200, {
    'Content-Type': type,
    // Les fichiers de assets/ portent un hash : ils ne changent jamais.
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  fs.createReadStream(file).pipe(res)
}

/** Requêtes HTTP de l'API, relayées telles quelles vers le backend. */
function proxyApi(req, res) {
  const upstream = (API_SECURE ? https : http).request(
    {
      host: API.hostname,
      port: API_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: API.host },
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(res)
    },
  )
  upstream.on('error', () => {
    if (res.headersSent) return res.destroy()
    res.writeHead(502, { 'Content-Type': 'application/problem+json' })
    res.end(
      JSON.stringify({
        type: 'about:blank',
        title: 'Serveur injoignable',
        status: 502,
        code: 'INTERNAL_ERROR',
        detail: `Le serveur Créatura (${API.origin}) ne répond pas. Vérifiez qu'il est démarré.`,
      }),
    )
  })
  req.pipe(upstream)
}

/** WebSocket de l'API : la poignée de main est renvoyée au backend, puis les octets circulent. */
function proxyWebSocket(req, socket, head) {
  if (!req.url.startsWith('/api/')) return socket.destroy()
  const onConnect = () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`]
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i]
      lines.push(`${name}: ${name.toLowerCase() === 'host' ? API.host : req.rawHeaders[i + 1]}`)
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (head?.length) upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  }
  const upstream = API_SECURE
    ? tls.connect({ host: API.hostname, port: API_PORT, servername: API.hostname }, onConnect)
    : net.connect(API_PORT, API.hostname, onConnect)
  const close = () => {
    socket.destroy()
    upstream.destroy()
  }
  upstream.on('error', close)
  socket.on('error', close)
}

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) proxyApi(req, res)
    else serveStatic(req, res)
  })
  server.on('upgrade', proxyWebSocket)
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(PORT, '127.0.0.1', () => resolve(server))
  })
}

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 560,
    title: 'Créatura',
    backgroundColor: '#fff7e7',
    icon: path.join(WEB, 'pwa-512x512.png'),
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  win.once('ready-to-show', () => win.show())

  // Les liens vers d'autres sites s'ouvrent dans le navigateur, pas dans l'application.
  const isExternal = (url) => !url.startsWith(`${ORIGIN}/`)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isExternal(url)) return
    event.preventDefault()
    shell.openExternal(url)
  })

  win.loadURL(`${ORIGIN}/`)
}

// Une seule fenêtre : une deuxième instance ne pourrait pas ouvrir le même port.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    if (!API) {
      dialog.showErrorBox(
        'Créatura ne peut pas démarrer',
        `Adresse du serveur invalide : « ${API_SETTING} ».\n` +
          `Corrigez apiUrl dans ${path.join(EXE_DIR, 'creatura.json')}.`,
      )
      app.quit()
      return
    }
    // Retire un éventuel service worker laissé par une version précédente.
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })
    try {
      await startServer()
    } catch (error) {
      dialog.showErrorBox(
        'Créatura ne peut pas démarrer',
        error?.code === 'EADDRINUSE'
          ? `Le port ${PORT} est déjà utilisé par un autre programme.`
          : String(error),
      )
      app.quit()
      return
    }
    createWindow()
  })

  app.on('window-all-closed', () => app.quit())
}
