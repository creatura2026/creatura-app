import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpPlayerApi, type SessionStore } from '@creatura/shared/api/http'
import { isApiError, type AuthTokens } from '@creatura/shared/api/types'
import type { Session } from '@creatura/shared/session'

const USER = {
  id: 'u1',
  pseudo: 'Alice',
  role: 'PLAYER',
  createdAt: '2026-11-10T08:00:00Z',
} as const

function memorySession(accessToken = 'access-1'): SessionStore & { current: Session | null } {
  const store = {
    current: { accessToken, refreshToken: 'refresh-1', user: USER } as Session | null,
    read: () => store.current,
    write(tokens: AuthTokens | null) {
      store.current = tokens
        ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: tokens.user }
        : null
    },
  }
  return store
}

const json = (status: number, body: unknown, type = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } })

function mockFetch(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => {
    const next = responses.shift()
    if (!next) throw new Error('requête inattendue')
    if (next instanceof Error) throw next
    return next
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const creature = (name: string, family: string) => ({
  id: '1',
  name,
  family: { code: family, label: family },
  rarity: { code: 'COMMON', label: 'Commun' },
  imageUrl: `https://d3tkhh3xjmflkh.cloudfront.net/sprites/${name.toLowerCase()}.png`,
})

afterEach(() => vi.unstubAllGlobals())

describe('API HTTP du joueur', () => {
  it('envoie le jeton et les filtres, sans les paramètres vides', async () => {
    const fetchMock = mockFetch(
      json(200, { items: [], page: 2, pageSize: 20, totalItems: 0, totalPages: 0 }),
    )
    const api = createHttpPlayerApi(memorySession())

    await api.listCreatures({ family: 'NATURE', search: '', page: 2 })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/v1/creatures?family=NATURE&page=2')
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer access-1')
  })

  it('affiche les images du CDN renvoyées par le serveur', async () => {
    mockFetch(
      json(200, {
        items: [creature('Moussou', 'NATURE')],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      }),
    )
    const page = await createHttpPlayerApi(memorySession()).listCreatures()

    expect(page.items[0]!.imageUrl).toBe(
      'https://d3tkhh3xjmflkh.cloudfront.net/sprites/moussou.png',
    )
  })

  it('transforme un Problem Details en ApiError avec son code', async () => {
    mockFetch(
      json(
        409,
        {
          type: 'https://app.creatura.fr/problems/booster-already-claimed',
          title: 'Booster déjà réclamé',
          status: 409,
          code: 'BOOSTER_ALREADY_CLAIMED',
          detail: 'Le booster du jour a déjà été ouvert.',
        },
        'application/problem+json',
      ),
    )
    const error = await createHttpPlayerApi(memorySession())
      .claimBooster()
      .catch((e: unknown) => e)

    expect(isApiError(error, 'BOOSTER_ALREADY_CLAIMED')).toBe(true)
    expect((error as Error).message).toBe('Le booster du jour a déjà été ouvert.')
  })

  it('renouvelle les jetons une fois sur un 401, puis rejoue la requête', async () => {
    const session = memorySession()
    const fetchMock = mockFetch(
      json(401, { code: 'UNAUTHENTICATED', status: 401, title: 'x', type: 'x' }),
      json(200, {
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: USER,
      }),
      json(200, { ...USER, progress: {}, boosterAvailableToday: true }),
    )

    const me = await createHttpPlayerApi(session).getMe()

    expect(me.pseudo).toBe('Alice')
    expect(session.current?.accessToken).toBe('access-2')
    const calls = fetchMock.mock.calls
    expect(calls.map(([url]) => url)).toEqual(['/api/v1/me', '/api/v1/auth/refresh', '/api/v1/me'])
    expect(JSON.parse(calls[1]![1]!.body as string)).toEqual({ refreshToken: 'refresh-1' })
    expect((calls[2]![1]!.headers as Record<string, string>).Authorization).toBe('Bearer access-2')
  })

  it('renvoie UNAUTHENTICATED si le renouvellement échoue', async () => {
    const unauthenticated = { code: 'UNAUTHENTICATED', status: 401, title: 'x', type: 'x' }
    mockFetch(json(401, unauthenticated), json(401, unauthenticated))

    const error = await createHttpPlayerApi(memorySession())
      .getMe()
      .catch((e: unknown) => e)

    expect(isApiError(error, 'UNAUTHENTICATED')).toBe(true)
  })

  it('signale un serveur injoignable sans ApiError (la requête sera réessayée)', async () => {
    mockFetch(new TypeError('Failed to fetch'))
    const error = await createHttpPlayerApi(memorySession())
      .getMe()
      .catch((e: unknown) => e)

    expect(isApiError(error)).toBe(false)
    expect((error as Error).message).toMatch(/injoignable/)
  })

  it('donne un code même quand la passerelle ne renvoie pas de JSON', async () => {
    mockFetch(new Response('Bad Gateway', { status: 502 }))
    const error = await createHttpPlayerApi(memorySession())
      .getMe()
      .catch((e: unknown) => e)

    expect(isApiError(error)).toBe(true)
    expect((error as Error).message).toMatch(/serveur/)
  })
})
