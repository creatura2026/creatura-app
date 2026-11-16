/**
 * Téléchargement de l'application Windows (apps/desktop).
 *
 * Les exe sont publiés à côté du site, sous `/telechargements/` (autre dossier :
 * VITE_DOWNLOADS_URL), avec un `latest.json` écrit par le build de l'exe : version, date, noms et
 * tailles des fichiers. La section n'est proposée que si ce fichier est en ligne et valide : sans
 * lui, une application monopage renverrait sa page HTML à la place.
 */
import { onMounted, ref } from 'vue'

const BASE = (import.meta.env.VITE_DOWNLOADS_URL ?? '/telechargements').replace(/\/$/, '')

export const DESKTOP_MANIFEST_URL = `${BASE}/latest.json`

interface ManifestFile {
  file: string
  size: number
}
interface Manifest {
  version: string
  date?: string
  setup: ManifestFile
  portable?: ManifestFile
}

export interface DesktopFile {
  url: string
  /** Taille lisible : « 116 Mo ». */
  size: string
}
export interface DesktopRelease {
  version: string
  /** Date de publication lisible : « 13 novembre 2026 ». */
  date: string | null
  setup: DesktopFile
  portable: DesktopFile | null
}

/** L'application tourne déjà dans l'exe : inutile de proposer de la télécharger. */
const insideDesktopApp = () =>
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')

const isFile = (value: unknown): value is ManifestFile =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ManifestFile).file === 'string' &&
  typeof (value as ManifestFile).size === 'number'

const isManifest = (value: unknown): value is Manifest =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Manifest).version === 'string' &&
  isFile((value as Manifest).setup)

const toFile = ({ file, size }: ManifestFile): DesktopFile => ({
  url: `${BASE}/${encodeURIComponent(file)}`,
  size: `${Math.round(size / 1024 / 1024)} Mo`,
})

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(date)
}

export function useDesktopDownload() {
  const release = ref<DesktopRelease | null>(null)

  onMounted(async () => {
    if (insideDesktopApp()) return
    try {
      const response = await fetch(DESKTOP_MANIFEST_URL, { cache: 'no-store' })
      if (!response.ok) return
      const manifest: unknown = await response.json()
      if (!isManifest(manifest)) return
      release.value = {
        version: manifest.version,
        date: formatDate(manifest.date),
        setup: toFile(manifest.setup),
        portable: isFile(manifest.portable) ? toFile(manifest.portable) : null,
      }
    } catch {
      // Hors ligne, fichier absent ou page HTML à la place du JSON : la section reste masquée.
    }
  })

  return { release }
}
