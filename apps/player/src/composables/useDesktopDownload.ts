/**
 * Téléchargement de l'application Windows (apps/desktop).
 *
 * Les exe sont publiés sous `/telechargements/` avec un `latest.json` écrit par le build de
 * l'exe : version, date, noms et tailles des fichiers. La section n'est proposée que si ce
 * fichier est en ligne et valide.
 */
import { onMounted, ref } from 'vue'

import {
  DOWNLOADS_BASE,
  fetchManifest,
  formatReleaseDate,
  isManifestFile,
  toDownloadFile,
  type DownloadFile,
  type ManifestFile,
} from './downloads'

export const DESKTOP_MANIFEST_URL = `${DOWNLOADS_BASE}/latest.json`

interface Manifest {
  version: string
  date?: string
  setup: ManifestFile
  portable?: ManifestFile
}

export type DesktopFile = DownloadFile
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

const isManifest = (value: unknown): value is Manifest =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Manifest).version === 'string' &&
  isManifestFile((value as Manifest).setup)

export function useDesktopDownload() {
  const release = ref<DesktopRelease | null>(null)

  onMounted(async () => {
    if (insideDesktopApp()) return
    const manifest = await fetchManifest(DESKTOP_MANIFEST_URL)
    if (!isManifest(manifest)) return
    release.value = {
      version: manifest.version,
      date: formatReleaseDate(manifest.date),
      setup: toDownloadFile(manifest.setup),
      portable: isManifestFile(manifest.portable) ? toDownloadFile(manifest.portable) : null,
    }
  })

  return { release }
}
