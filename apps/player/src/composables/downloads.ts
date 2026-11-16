/**
 * Outils communs aux téléchargements des applications (Windows, Android).
 *
 * Les fichiers sont publiés à côté du site, sous `/telechargements/` (autre dossier :
 * VITE_DOWNLOADS_URL), chacun avec un manifeste JSON écrit par son build.
 */

export const DOWNLOADS_BASE = (import.meta.env.VITE_DOWNLOADS_URL ?? '/telechargements').replace(
  /\/$/,
  '',
)

export interface ManifestFile {
  file: string
  size: number
}

export interface DownloadFile {
  url: string
  /** Taille lisible : « 116 Mo ». */
  size: string
}

export const isManifestFile = (value: unknown): value is ManifestFile =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ManifestFile).file === 'string' &&
  typeof (value as ManifestFile).size === 'number'

export const toDownloadFile = ({ file, size }: ManifestFile): DownloadFile => ({
  url: `${DOWNLOADS_BASE}/${encodeURIComponent(file)}`,
  size: `${Math.max(1, Math.round(size / 1024 / 1024))} Mo`,
})

/** « 2026-11-13 » → « 13 novembre 2026 ». */
export function formatReleaseDate(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(date)
}

/**
 * Lit un manifeste. `null` s'il est absent, invalide, ou si le serveur renvoie la page HTML de
 * l'application monopage à la place du JSON.
 */
export async function fetchManifest(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as unknown
  } catch {
    return null
  }
}
