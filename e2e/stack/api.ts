/**
 * Client de l'API réelle, pour préparer les données d'un test sans passer par l'écran
 * (créer des joueurs, ouvrir un booster, offrir une carte, conclure un échange…).
 * Contrat : creatura-api.openapi.yaml.
 */
import { randomBytes } from 'node:crypto'

export const API_ORIGIN = 'http://localhost:58000'
export const API_URL = `${API_ORIGIN}/api/v1`

export const ADMIN = { login: 'admin', password: 'admin', pseudo: 'Admin' }
export const PASSWORD = 'mot-de-passe-e2e-1234'

export interface CreatureSummary {
  id: string
  name: string
}
export interface CollectionEntry {
  creature: CreatureSummary
  quantity: number
}
export interface Trade {
  id: string
  status: 'PENDING' | 'ACCEPTED' | 'REFUSED' | 'CANCELLED' | 'FAILED'
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status} : ${JSON.stringify(body)}`)
  }
}

async function call<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const data = text ? (JSON.parse(text) as unknown) : undefined
  if (!response.ok) throw new ApiError(response.status, data)
  return data as T
}

/** Pseudo unique (lettres, chiffres, 20 caractères au plus) : les tests ne se gênent pas. */
export function uniquePseudo(prefix: string): string {
  return `${prefix}${randomBytes(4).toString('hex')}`.slice(0, 20)
}

/** Un compte connecté à l'API. */
export class Account {
  constructor(
    readonly id: string,
    readonly pseudo: string,
    readonly login: string,
    readonly password: string,
    readonly token: string,
  ) {}

  get credentials() {
    return { login: this.login, password: this.password }
  }

  get<T>(path: string) {
    return call<T>('GET', path, this.token)
  }
  post<T>(path: string, body?: unknown) {
    return call<T>('POST', path, this.token, body ?? {})
  }
  put<T>(path: string, body: unknown) {
    return call<T>('PUT', path, this.token, body)
  }

  /** Ouvre le booster du jour et renvoie les créatures tirées. */
  async claimBooster(): Promise<CreatureSummary[]> {
    const booster = await this.post<{ cards: { creature: CreatureSummary }[] }>('/me/boosters')
    return booster.cards.map((c) => c.creature)
  }

  async collection(): Promise<CollectionEntry[]> {
    const page = await this.get<{ items: CollectionEntry[] }>('/me/collection?pageSize=100')
    return page.items.filter((e) => e.quantity > 0)
  }

  async quantityOf(creatureId: string): Promise<number> {
    return (await this.collection()).find((e) => e.creature.id === creatureId)?.quantity ?? 0
  }

  /** Une carte de la collection, de préférence en un seul exemplaire (le « dernier »). */
  async oneCard(options: { single?: boolean; except?: string[] } = {}): Promise<CreatureSummary> {
    const entries = (await this.collection()).filter((e) => !options.except?.includes(e.creature.id))
    const pick = (options.single && entries.find((e) => e.quantity === 1)) || entries[0]
    if (!pick) throw new Error(`${this.pseudo} n'a aucune carte`)
    return pick.creature
  }

  openTrade(recipient: Account, wantedCreatureId?: string) {
    return this.post<Trade>('/trades', { recipientId: recipient.id, wantedCreatureId })
  }

  gift(recipient: Account, creatureId: string, quantity = 1) {
    return this.post<{ id: string; status: string }>('/gifts', {
      recipientId: recipient.id,
      creatureId,
      quantity,
    })
  }
}

async function login(credentials: { login: string; password: string }) {
  return call<{ accessToken: string; user: { id: string; pseudo: string } }>(
    'POST',
    '/auth/login',
    undefined,
    credentials,
  )
}

export async function signIn(credentials: { login: string; password: string }): Promise<Account> {
  // Seulement l'identifiant et le mot de passe : l'API refuse les champs inconnus.
  const tokens = await login({ login: credentials.login, password: credentials.password })
  return new Account(tokens.user.id, tokens.user.pseudo, credentials.login, credentials.password, tokens.accessToken)
}

/** Crée un joueur (et, par défaut, lui fait ouvrir son booster du jour pour qu'il ait des cartes). */
export async function newPlayer(prefix = 'J', options: { withCards?: boolean } = {}): Promise<Account> {
  const pseudo = uniquePseudo(prefix)
  const credentials = { login: pseudo.toLowerCase(), password: PASSWORD }
  await call('POST', '/auth/register', undefined, { pseudo, ...credentials })
  const account = await signIn(credentials)
  if (options.withCards ?? true) await account.claimBooster()
  return account
}

export function signInAdmin(): Promise<Account> {
  return signIn(ADMIN)
}

/**
 * Crée un administrateur prêt à l'emploi : compte créé par `creator`, mot de passe provisoire
 * remplacé comme à la première connexion.
 */
export async function newAdmin(creator: Account): Promise<Account> {
  const pseudo = uniquePseudo('Adm')
  const login_ = pseudo.toLowerCase()
  const temporaryPassword = 'provisoire-e2e-1234'
  await creator.post('/admin/admins', { pseudo, login: login_, temporaryPassword })
  const first = await signIn({ login: login_, password: temporaryPassword })
  await first.put('/me/password', { currentPassword: temporaryPassword, newPassword: PASSWORD })
  return signIn({ login: login_, password: PASSWORD })
}

type ServerMessage = { type: string; trade?: Trade & Record<string, unknown>; [key: string]: unknown }

/** Un joueur dans une salle d'échange, par le WebSocket, comme le ferait l'écran. */
export class RoomClient {
  private messages: ServerMessage[] = []
  private waiters: (() => void)[] = []

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      this.messages.push(JSON.parse(String(event.data)) as ServerMessage)
      for (const wake of this.waiters.splice(0)) wake()
    })
  }

  static async join(account: Account, tradeId: string): Promise<RoomClient> {
    const url = `${API_ORIGIN.replace('http', 'ws')}/api/v1/trades/${tradeId}/live?access_token=${account.token}`
    const client = new RoomClient(new WebSocket(url))
    await client.next((m) => m.type === 'init')
    return client
  }

  /** Attend un message du serveur (y compris un message déjà reçu). */
  async next(match: (message: ServerMessage) => boolean, timeoutMs = 10_000): Promise<ServerMessage> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const found = this.messages.find(match)
      if (found) return found
      if (Date.now() > deadline) throw new Error('message attendu non reçu dans la salle')
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve)
        setTimeout(resolve, 200)
      })
    }
  }

  offer(cards: { creatureId: string; quantity: number }[]) {
    this.socket.send(JSON.stringify({ type: 'offer', items: cards }))
  }

  ready(ready = true) {
    this.socket.send(JSON.stringify({ type: 'ready', ready }))
  }

  say(text: string) {
    this.socket.send(JSON.stringify({ type: 'chat', text }))
  }

  close() {
    this.socket.close()
  }
}

/** Ouvre un échange entre deux joueurs et le conclut, une carte contre une carte. */
export async function concludeTrade(a: Account, b: Account): Promise<{ trade: Trade; given: CreatureSummary; received: CreatureSummary }> {
  const given = await a.oneCard()
  const received = await b.oneCard()
  const trade = await a.openTrade(b)
  const roomA = await RoomClient.join(a, trade.id)
  const roomB = await RoomClient.join(b, trade.id)
  try {
    roomA.offer([{ creatureId: given.id, quantity: 1 }])
    roomB.offer([{ creatureId: received.id, quantity: 1 }])
    // Les validations sont retirées à chaque changement de tapis : on valide une fois les deux posés.
    const both = (m: ServerMessage) =>
      m.type === 'trade' &&
      Array.isArray(m.trade?.offered) && (m.trade.offered as unknown[]).length > 0 &&
      Array.isArray(m.trade?.requested) && (m.trade.requested as unknown[]).length > 0
    await roomA.next(both)
    roomA.ready()
    roomB.ready()
    await roomA.next((m) => m.type === 'trade' && m.trade?.status === 'ACCEPTED')
  } finally {
    roomA.close()
    roomB.close()
  }
  return { trade, given, received }
}
