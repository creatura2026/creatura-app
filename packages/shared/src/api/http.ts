/**
 * Implémentation HTTP des API joueur et admin : le vrai serveur (FastAPI, dossier `backend/`).
 * Mêmes interfaces que les API simulées (`contract.ts`) : les écrans ne voient pas la
 * différence.
 *
 * - Adresse : `/api/v1` sur le même domaine que le front (proxy Vite en local, Ingress sur EKS),
 *   ou `VITE_API_BASE_URL` pour un serveur sur un autre domaine.
 * - Jeton d'accès expiré (401) : renouvellement automatique avec le refresh token, une fois.
 * - Erreurs : le Problem Details du serveur devient une `ApiError` (même code que le mock).
 */
import type { AdminApi, AuthApi, PlayerApi } from './contract'
import { ApiError, type AuthTokens, type ErrorCode, type Problem } from './types'
import type { Session } from '../session'

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export interface SessionStore {
  read(): Session | null
  write(tokens: AuthTokens | null): void
}

type QueryValue = string | number | boolean | null | undefined
type Query = object

interface RequestOptions {
  query?: Query
  body?: unknown
  /** Faux pour les routes publiques (inscription, connexion, renouvellement). */
  auth?: boolean
}

const FALLBACK_CODES: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
}

function toQueryString(query: Query | undefined): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {}) as [string, QueryValue][]) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** Réponse en erreur → `ApiError`, même si le corps n'est pas un Problem Details. */
async function toApiError(response: Response): Promise<ApiError> {
  let body: Partial<Problem> | null = null
  try {
    body = (await response.json()) as Partial<Problem>
  } catch {
    // Corps vide ou non JSON (proxy, passerelle…).
  }
  if (body?.code) return new ApiError(body as Problem)
  return new ApiError({
    type: 'about:blank',
    title: response.statusText || 'Erreur',
    status: response.status,
    code:
      FALLBACK_CODES[response.status] ??
      (response.status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR'),
    detail:
      response.status >= 500
        ? 'Le serveur rencontre un problème. Réessayez dans un instant.'
        : `Requête refusée (${response.status}).`,
  })
}

export function createHttpClient(session: SessionStore, baseUrl: string = API_BASE_URL) {
  let refreshing: Promise<boolean> | null = null

  async function send(method: string, path: string, options: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    const token = options.auth === false ? null : session.read()?.accessToken
    if (token) headers.Authorization = `Bearer ${token}`
    try {
      return await fetch(`${baseUrl}${path}${toQueryString(options.query)}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })
    } catch {
      // Pas une ApiError : TanStack Query réessaie les erreurs réseau.
      throw new Error('Serveur injoignable. Vérifiez votre connexion.')
    }
  }

  /** Renouvelle les jetons ; les requêtes simultanées partagent le même renouvellement. */
  function refreshTokens(): Promise<boolean> {
    refreshing ??= (async () => {
      const refreshToken = session.read()?.refreshToken
      if (!refreshToken) return false
      const response = await send('POST', '/auth/refresh', { body: { refreshToken }, auth: false })
      if (!response.ok) return false
      session.write((await response.json()) as AuthTokens)
      return true
    })()
      .catch(() => false)
      .finally(() => (refreshing = null))
    return refreshing
  }

  async function request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    let response = await send(method, path, options)
    if (response.status === 401 && options.auth !== false && (await refreshTokens())) {
      response = await send(method, path, options)
    }
    if (!response.ok) throw await toApiError(response)
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return {
    get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
    post: <T>(path: string, body?: unknown, auth = true) =>
      request<T>('POST', path, { body, auth }),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
    session,
  }
}

type HttpClient = ReturnType<typeof createHttpClient>

const id = (value: string) => encodeURIComponent(value)

function authApi(http: HttpClient): AuthApi {
  return {
    register: (body) => http.post('/auth/register', body, false),
    login: (body) => http.post('/auth/login', body, false),
    async logout() {
      // Le serveur ne garde pas de session, le client oublie ses jetons de toute façon.
      const refreshToken = http.session.read()?.refreshToken
      await http.post('/auth/logout', refreshToken ? { refreshToken } : undefined).catch(() => {})
    },
    getMe: () => http.get('/me'),
  }
}

export function createHttpPlayerApi(session: SessionStore): PlayerApi {
  const http = createHttpClient(session)
  return {
    ...authApi(http),
    listFamilies: () => http.get('/families'),
    listRarities: () => http.get('/rarities'),
    listCreatures: (query) => http.get('/creatures', query),
    getCreature: (creatureId) => http.get(`/creatures/${id(creatureId)}`),
    getTodayBooster: () => http.get('/me/boosters/today'),
    claimBooster: () => http.post('/me/boosters'),
    getMyCollection: (query) => http.get('/me/collection', query),
    searchPlayers: (query) => http.get('/players', query),
    getTradeableCards: (playerId) => http.get(`/players/${id(playerId)}/tradeable-cards`),
    createTrade: (body) => http.post('/trades', body),
    listMyTrades: (query) => http.get('/trades', query),
    getTrade: (tradeId) => http.get(`/trades/${id(tradeId)}`),
    acceptTrade: (tradeId) => http.post(`/trades/${id(tradeId)}/accept`),
    refuseTrade: (tradeId) => http.post(`/trades/${id(tradeId)}/refuse`),
    cancelTrade: (tradeId) => http.post(`/trades/${id(tradeId)}/cancel`),
  }
}

export function createHttpAdminApi(session: SessionStore): AdminApi {
  const http = createHttpClient(session)
  return {
    ...authApi(http),
    listRarities: () => http.get('/rarities'),
    searchPlayers: (query) => http.get('/players', query),
    getAdminStats: (query) => http.get('/admin/stats', query),
    listAdminTrades: (query) => http.get('/admin/trades', query),
    getRarityDistribution: (query) => http.get('/admin/rarity-distribution', query),
    getBoosterSettings: () => http.get('/admin/settings/booster'),
    updateBoosterSettings: (body) => http.put('/admin/settings/booster', body),
  }
}
