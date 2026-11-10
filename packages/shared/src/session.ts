/** Stockage local des jetons de session, une clé par application. */
import type { AuthTokens, User } from './api/types'

export interface Session {
  accessToken: string
  refreshToken: string
  user: User
}

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
        const { accessToken, refreshToken, user } = tokens
        localStorage.setItem(key, JSON.stringify({ accessToken, refreshToken, user }))
      }
    } catch {
      // Stockage indisponible : la session ne survivra pas au rechargement.
    }
  }

  return { read, write, getAccessToken: () => read()?.accessToken ?? null }
}
