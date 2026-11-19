/** Stockage local des jetons de session, une clé par application. */
import type { AuthTokens, User } from './api/types'

export interface Session {
  accessToken: string
  refreshToken: string
  user: User
  /** Inactivité au bout de laquelle la session expire, en secondes (réglée par le serveur). */
  idleSeconds?: number
}

/** Valeur par défaut si le serveur ne l'a pas donnée (session ouverte avant la mise à jour). */
export const DEFAULT_IDLE_SECONDS = 20 * 60

export function createSessionStorage(key: string) {
  function read(): Session | null {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as Session) : null
    } catch {
      return null
    }
  }

  function write(tokens: AuthTokens | null): void {
    try {
      if (!tokens) localStorage.removeItem(key)
      else {
        const { accessToken, refreshToken, user, sessionIdleSeconds } = tokens
        const session: Session = {
          accessToken,
          refreshToken,
          user,
          idleSeconds: sessionIdleSeconds,
        }
        localStorage.setItem(key, JSON.stringify(session))
      }
    } catch {
      // Stockage indisponible : la session ne survivra pas au rechargement.
    }
  }

  return {
    read,
    write,
    getAccessToken: () => read()?.accessToken ?? null,
    /** Clé de stockage de cette session : la dernière activité est rangée à côté. */
    key,
  }
}
