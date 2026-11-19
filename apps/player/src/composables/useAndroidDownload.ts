/**
 * Téléchargement de l'application Android (APK).
 *
 * L'APK est publié sous `/telechargements/` avec un `android.json` écrit par son build :
 *
 *   { "version": "0.1.0", "date": "2026-11-16", "minAndroid": "8.0",
 *     "apk": { "file": "Creatura-0.1.0.apk", "size": 12345678 } }
 *
 * `date` et `minAndroid` sont facultatifs. Sans ce fichier (ou s'il est invalide), la section
 * reste affichée mais annonce l'application comme bientôt disponible.
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

export const ANDROID_MANIFEST_URL = `${DOWNLOADS_BASE}/android.json`

interface Manifest {
  version: string
  date?: string
  minAndroid?: string
  apk: ManifestFile
}

export interface AndroidRelease {
  version: string
  /** Date de publication lisible : « 16 novembre 2026 ». */
  date: string | null
  /** Version minimale d'Android, « 8.0 », si le manifeste la donne. */
  minAndroid: string | null
  apk: DownloadFile
}

const userAgent = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent)

/**
 * Le visiteur est sur un téléphone ou une tablette (Android, iPhone, iPad) plutôt que sur un
 * ordinateur. Les iPad récents se présentent comme un Mac : on les reconnaît à l'écran tactile.
 */
export const onMobileDevice = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent()) ||
  (/Macintosh/.test(userAgent()) &&
    typeof navigator !== 'undefined' &&
    navigator.maxTouchPoints > 1)

/**
 * L'application tourne déjà dans l'APK : inutile de proposer de la télécharger. L'APK ajoute
 * « CreaturaAndroid » à l'identifiant du navigateur (apps/mobile) ; « ; wv) » reconnaît toute
 * WebView Android.
 */
const insideAndroidApp = () => /CreaturaAndroid|; wv\)/.test(userAgent())

const isManifest = (value: unknown): value is Manifest =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Manifest).version === 'string' &&
  isManifestFile((value as Manifest).apk)

export function useAndroidDownload() {
  const release = ref<AndroidRelease | null>(null)
  /** Faux dans l'application Android elle-même : la section n'a pas lieu d'être. */
  const offered = !insideAndroidApp()

  onMounted(async () => {
    if (!offered) return
    const manifest = await fetchManifest(ANDROID_MANIFEST_URL)
    if (!isManifest(manifest)) return
    release.value = {
      version: manifest.version,
      date: formatReleaseDate(manifest.date),
      minAndroid: typeof manifest.minAndroid === 'string' ? manifest.minAndroid : null,
      apk: toDownloadFile(manifest.apk),
    }
  })

  return { release, offered }
}
