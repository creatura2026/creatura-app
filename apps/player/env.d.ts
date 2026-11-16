/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `true` : API simulée dans le navigateur, sans serveur (`pnpm dev:mock`). */
  readonly VITE_API_MOCK?: string
  /** Adresse de l'API si elle n'est pas sur le même domaine (par défaut `/api/v1`). */
  readonly VITE_API_BASE_URL?: string
  /** Dossier où sont publiés les exe de l'application Windows (par défaut `/telechargements`). */
  readonly VITE_DOWNLOADS_URL?: string
}
