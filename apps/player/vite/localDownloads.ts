/**
 * En local (`vite` et `vite preview`), sert le dossier des exe de l'application Windows
 * (`apps/desktop/release/`, produit par `pnpm desktop`) sous `/telechargements/` : la page
 * d'accueil propose alors le téléchargement sans rien publier sur S3. En ligne, ce même chemin
 * est servi par CloudFront depuis le bucket du front.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'

const PREFIX = '/telechargements/'
const TYPES: Record<string, string> = {
  '.exe': 'application/vnd.microsoft.portable-executable',
  '.json': 'application/json; charset=utf-8',
}

export function localDownloads(releaseDir: string): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith(PREFIX)) return next()
    let name: string
    try {
      name = decodeURIComponent(url.slice(PREFIX.length).split('?')[0] ?? '')
    } catch {
      return next()
    }
    // Seulement les fichiers à la racine du dossier : ni sous-dossier, ni chemin remontant.
    const type = TYPES[path.extname(name).toLowerCase()]
    const file = path.join(releaseDir, name)
    if (!type || name !== path.basename(name) || !existsSync(file)) {
      res.statusCode = 404
      res.end()
      return
    }
    res.setHeader('Content-Type', type)
    res.setHeader('Content-Length', statSync(file).size)
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(file).pipe(res)
  }

  return {
    name: 'creatura-local-downloads',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}
