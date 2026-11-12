/**
 * Implémentation HTTP des API joueur et admin : le vrai serveur (FastAPI, dossier `backend/`).
 * Mêmes interfaces que les API simulées (`contract.ts`) : les écrans ne voient pas la
 * différence.
 *
 * - Adresse : `/api/v1` sur le même domaine que le front (proxy Vite en local, Ingress sur EKS),
 *   ou `VITE_API_BASE_URL` pour un serveur sur un autre domaine.
 * - Jeton d'accès expiré (401) : renouvellement automatique avec le refresh token, une fois.
 * - Erreurs : le Problem Details du serveur devient une `ApiError` (même code que le mock).
 * - Salle d'échange : WebSocket `/trades/{tradeId}/live`, reconnecté après une coupure.
 */
import type { AdminApi, AuthApi, PlayerApi, TradeConnection } from './contract'
import {
  ApiError,
  isApiError,
  type AuthTokens,
  type ErrorCode,
  type Problem,
  type TradeClientMessage,
  type TradeServerMessage,
} from './types'
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

/** Délai avant la reconnexion n° `attempt` : 1 s, 2 s, 4 s… jusqu'à 15 s. */
const reconnectDelay = (attempt: number) => Math.min(1000 * 2 ** (attempt - 1), 15_000)

function clientProblem(code: ErrorCode, status: number, detail: string): Problem {
  return { type: 'about:blank', title: 'Salle d’échange', status, code, detail }
}

/** Adresse WebSocket d'une route de l'API : même hôte que l'API, en ws:// ou wss://. */
function webSocketUrl(baseUrl: string, path: string, accessToken: string): string {
  const url = new URL(`${baseUrl}${path}`, globalThis.location?.href ?? 'http://localhost/')
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('access_token', accessToken)
  return url.toString()
}

/**
 * Salle d'échange en WebSocket. Le jeton d'accès passe dans l'adresse (un navigateur n'envoie
 * pas d'en-tête sur un WebSocket).
 *
 * - Un navigateur ne donne pas la raison d'un refus d'ouverture : on la demande en HTTP
 *   (`GET /trades/{tradeId}`, qui renouvelle le jeton si besoin). Refus définitif (403, 404,
 *   session expirée) : un message `error`, comme le mock. Sinon (jeton renouvelé, serveur
 *   redémarré…), nouvelle tentative.
 * - Coupure en cours de route : un message `error` prévient le joueur, puis reconnexion ;
 *   le serveur renvoie alors `init`, l'état complet de la salle.
 */
function joinTradeRoom(
  http: HttpClient,
  baseUrl: string,
  tradeId: string,
  onMessage: (message: TradeServerMessage) => void,
): TradeConnection {
  let socket: WebSocket | null = null
  let closed = false
  let attempts = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const fail = (problem: Problem) => onMessage({ type: 'error', problem })

  async function refusal(): Promise<Problem | null> {
    try {
      await http.get(`/trades/${encodeURIComponent(tradeId)}`)
      return null
    } catch (error) {
      return isApiError(error) && error.problem.status < 500 ? error.problem : null
    }
  }

  function retry() {
    attempts += 1
    timer = setTimeout(connect, reconnectDelay(attempts))
  }

  function connect() {
    if (closed) return
    const token = http.session.read()?.accessToken
    if (!token) {
      fail(clientProblem('UNAUTHENTICATED', 401, 'Connectez-vous pour continuer.'))
      return
    }
    const ws = new WebSocket(
      webSocketUrl(baseUrl, `/trades/${encodeURIComponent(tradeId)}/live`, token),
    )
    socket = ws
    let entered = false

    ws.onmessage = (event: MessageEvent) => {
      let message: TradeServerMessage
      try {
        message = JSON.parse(String(event.data)) as TradeServerMessage
      } catch {
        return
      }
      if (message.type === 'init') {
        entered = true
        attempts = 0
      }
      onMessage(message)
    }
    ws.onclose = () => {
      if (socket === ws) socket = null
      if (closed) return
      if (entered) {
        fail(
          clientProblem(
            'INTERNAL_ERROR',
            503,
            'Connexion à la salle d’échange perdue. Reconnexion en cours…',
          ),
        )
        retry()
        return
      }
      void refusal().then((problem) => {
        if (closed) return
        if (problem) fail(problem)
        else retry()
      })
    }
  }

  connect()
  return {
    send(message: TradeClientMessage) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
      else
        fail(
          clientProblem(
            'INTERNAL_ERROR',
            503,
            'Connexion à la salle d’échange en cours : réessayez dans un instant.',
          ),
        )
    },
    close() {
      closed = true
      clearTimeout(timer)
      socket?.close(1000)
      socket = null
    },
  }
}

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

export function createHttpPlayerApi(
  session: SessionStore,
  baseUrl: string = API_BASE_URL,
): PlayerApi {
  const http = createHttpClient(session, baseUrl)
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
    listCreatureOwners: (creatureId) => http.get(`/creatures/${id(creatureId)}/owners`),
    createTrade: (body) => http.post('/trades', body),
    listMyTrades: (query) => http.get('/trades', query),
    getTrade: (tradeId) => http.get(`/trades/${id(tradeId)}`),
    refuseTrade: (tradeId) => http.post(`/trades/${id(tradeId)}/refuse`),
    cancelTrade: (tradeId) => http.post(`/trades/${id(tradeId)}/cancel`),
    joinTrade: (tradeId, onMessage) => joinTradeRoom(http, baseUrl, tradeId, onMessage),
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
