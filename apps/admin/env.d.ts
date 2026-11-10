/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `desktop` pour le paquet Desktop (historique « hash »), absent pour le Web. */
  readonly VITE_TARGET?: 'web' | 'desktop'
}
