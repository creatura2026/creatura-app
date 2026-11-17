/**
 * Implémentation SIMULÉE de l'API d'administration, en attendant le serveur NestJS.
 * Les données sont FICTIVES mais déterministes (graine fixe) : mêmes chiffres à chaque rechargement.
 * Un compte joueur peut se connecter, mais reçoit 403 sur toutes les routes /admin (preuve qualité 02).
 */
import type { AdminApi } from '@creatura/shared/api/contract'
import {
  MAX_CARDS_PER_BOOSTER,
  MIN_CARDS_PER_BOOSTER,
  readMockBoosterSettings,
  writeMockBoosterSettings,
} from '@creatura/shared/api/mock-settings'
import type {
  AdminAccount,
  AdminCreature,
  AdminPlayer,
  AdminSummary,
  DailyCount,
  DeletionRequest,
  PlayerSummary,
  Role,
  Trade,
  TradeStatus,
  User,
} from '@creatura/shared/api/types'
import {
  clone,
  delay,
  normalize,
  paginate,
  problem,
  seededRandom,
  uuid,
} from '@creatura/shared/api/mock-utils'
import { CREATURES, FAMILIES, RARITIES } from '@creatura/shared/fixtures/catalog'
import { addDays, parisToday } from '@creatura/shared/format'

export const DEMO_ACCOUNTS = {
  admin: { login: 'admin', password: 'creatura-admin' },
  // Deuxième admin : valide les demandes de suppression faites par le premier (AS-71).
  admin2: { login: 'admin2', password: 'creatura-admin2' },
  player: { login: 'demo', password: 'creatura-demo' },
}

interface MockAccount extends User {
  login: string
  password: string
  createdBy: string | null
  deactivatedAt: string | null
  deactivatedBy: string | null
}

const ACCOUNTS: MockAccount[] = [
  {
    id: 'adadadad-0000-4000-8000-000000000001',
    pseudo: 'Admin',
    role: 'ADMIN' as Role,
    createdAt: '2026-09-01T08:00:00Z',
    mustChangePassword: false,
    createdBy: null,
    deactivatedAt: null,
    deactivatedBy: null,
    ...DEMO_ACCOUNTS.admin,
  },
  {
    id: 'adadadad-0000-4000-8000-000000000002',
    pseudo: 'Noa',
    role: 'ADMIN' as Role,
    createdAt: '2026-09-15T08:00:00Z',
    mustChangePassword: false,
    createdBy: 'adadadad-0000-4000-8000-000000000001',
    deactivatedAt: null,
    deactivatedBy: null,
    ...DEMO_ACCOUNTS.admin2,
  },
  {
    id: '11111111-1111-4111-8111-111111111111',
    pseudo: 'Dresseur',
    role: 'PLAYER' as Role,
    createdAt: '2026-10-01T09:00:00Z',
    mustChangePassword: false,
    createdBy: null,
    deactivatedAt: null,
    deactivatedBy: null,
    ...DEMO_ACCOUNTS.player,
  },
]

const PSEUDOS = [
  'Dresseur',
  'Lina_42',
  'Noe',
  'Mina',
  'Linette',
  'Sacha',
  'Camille_B',
  'Yanis',
  'Lou',
  'Maelle',
  'Tom-77',
  'Ines',
  'Hugo',
  'Zoe_R',
  'Nael',
  'Jade',
  'Elio',
  'Romane',
  'Axel',
  'Lea_K',
  'Gabin',
  'Manon',
  'Rayan',
  'Chloe',
  'Timeo',
  'Lily',
  'Sohan',
  'Alba',
  'Nino',
  'Iris',
]

const HISTORY_DAYS = 120
const DAY_MS = 86_400_000

interface Dataset {
  today: string
  players: (PlayerSummary & { createdDay: string })[]
  boosters: DailyCount[]
  trades: Trade[]
  /** jour → quantité de cartes tirées par rareté */
  draws: Record<string, Record<string, number>>
}

let dataset: Dataset | null = null

function build(today: string): Dataset {
  const random = seededRandom(2026)
  const start = addDays(today, -(HISTORY_DAYS - 1))

  const players = PSEUDOS.map((pseudo, i) => ({
    id: i === 0 ? ACCOUNTS.find((a) => a.role === 'PLAYER')!.id : `ffffffff-0000-4000-8000-${String(i).padStart(12, '0')}`,
    pseudo,
    createdDay: addDays(start, Math.floor(random() * (HISTORY_DAYS - 3))),
  })).sort((a, b) => a.createdDay.localeCompare(b.createdDay))

  const boosters: DailyCount[] = []
  const draws: Dataset['draws'] = {}
  const trades: Trade[] = []
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)]!
  const summary = (c: (typeof CREATURES)[number]) => ({
    id: c.id,
    name: c.name,
    family: c.family,
    rarity: c.rarity,
    imageUrl: c.imageUrl,
  })

  for (let d = 0; d < HISTORY_DAYS; d++) {
    const day = addDays(start, d)
    const registered = players.filter((p) => p.createdDay <= day)
    const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())
    // Chaque inscrit ouvre son booster avec une probabilité d'environ 60 %.
    const count = registered.filter(() => random() < (weekend ? 0.75 : 0.55)).length
    boosters.push({ date: day, count })

    // 5 cartes par booster, tirées selon les probabilités théoriques.
    const byRarity: Record<string, number> = Object.fromEntries(RARITIES.map((r) => [r.code, 0]))
    for (let i = 0; i < count * 5; i++) {
      let roll = random()
      const rarity = RARITIES.find((r) => (roll -= r.dropRate) < 0) ?? RARITIES[0]!
      byRarity[rarity.code]!++
    }
    draws[day] = byRarity

    // Quelques échanges par jour.
    const tradeCount = registered.length < 2 ? 0 : Math.floor(random() * (weekend ? 5 : 3.5))
    for (let t = 0; t < tradeCount; t++) {
      const proposer = pick(registered)
      let recipient = pick(registered)
      if (recipient.id === proposer.id) recipient = registered.find((p) => p.id !== proposer.id)!
      const createdAt = new Date(Date.parse(`${day}T07:00:00Z`) + random() * 14 * 3_600_000)
      const roll = random()
      const age = (Date.parse(`${today}T12:00:00Z`) - createdAt.getTime()) / DAY_MS
      const status: TradeStatus =
        age < 2 && roll < 0.5
          ? 'PENDING'
          : roll < 0.62
            ? 'ACCEPTED'
            : roll < 0.84
              ? 'REFUSED'
              : roll < 0.94
                ? 'CANCELLED'
                : 'FAILED'
      const offered = pick(CREATURES)
      let requested = pick(CREATURES)
      while (requested.id === offered.id) requested = pick(CREATURES)
      const decidedAt =
        status === 'PENDING'
          ? null
          : new Date(createdAt.getTime() + random() * 10 * 3_600_000).toISOString()
      trades.push({
        id: `eeeeeeee-${String(d).padStart(4, '0')}-4000-8000-${String(t).padStart(12, '0')}`,
        status,
        proposer: { id: proposer.id, pseudo: proposer.pseudo },
        recipient: { id: recipient.id, pseudo: recipient.pseudo },
        offered: [{ creature: summary(offered), quantity: 1 }],
        requested: [{ creature: summary(requested), quantity: 1 }],
        // Un échange conclu a été validé par les deux joueurs.
        proposerReady: status === 'ACCEPTED',
        recipientReady: status === 'ACCEPTED',
        createdAt: createdAt.toISOString(),
        decidedAt,
        failureReason: status === 'FAILED' ? 'CARDS_UNAVAILABLE' : null,
      })
    }
  }

  trades.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { today, players, boosters, trades, draws }
}

function data(): Dataset {
  const today = parisToday()
  if (!dataset || dataset.today !== today) dataset = build(today)
  return dataset
}

/** Valide et complète la période (30 derniers jours par défaut, 366 jours au maximum). */
function period(query: { from?: string; to?: string } = {}) {
  const to = query.to ?? data().today
  const from = query.from ?? addDays(to, -29)
  if (from > to) throw problem('VALIDATION_ERROR', 'La date de début doit précéder la date de fin.')
  const span = (Date.parse(to) - Date.parse(from)) / DAY_MS
  if (span > 365) throw problem('VALIDATION_ERROR', 'La période ne peut pas dépasser 366 jours.')
  return { from, to }
}

function days(from: string, to: string): string[] {
  const list: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) list.push(d)
  return list
}

const dayOf = (iso: string) => parisToday(new Date(iso))

// ── Joueurs : connexions et cartes fictives (AS-71) ──────────────────────────

interface PlayerExtras {
  /** jour → nombre de connexions */
  logins: Record<string, number>
  /** identifiant de créature → exemplaires */
  cards: Record<string, number>
}

let extras: { today: string; byPlayer: Map<string, PlayerExtras> } | null = null

/** Graine à part : les autres données fictives (boosters, échanges) ne changent pas. */
function playerExtras(): Map<string, PlayerExtras> {
  const d = data()
  if (extras?.today === d.today) return extras.byPlayer
  const random = seededRandom(71)
  const byPlayer = new Map<string, PlayerExtras>()
  for (const p of d.players) {
    const logins: Record<string, number> = {}
    const assiduity = 0.2 + random() * 0.6
    for (let day = p.createdDay; day <= d.today; day = addDays(day, 1))
      if (random() < assiduity) logins[day] = 1 + Math.floor(random() * 2)
    const cards: Record<string, number> = {}
    const owned = 5 + Math.floor(random() * 30)
    for (let i = 0; i < owned; i++) {
      const c = CREATURES[Math.floor(random() * CREATURES.length)]!
      cards[c.id] = (cards[c.id] ?? 0) + 1
    }
    byPlayer.set(p.id, { logins, cards })
  }
  extras = { today: d.today, byPlayer }
  return byPlayer
}

function months(from: string, to: string): string[] {
  const list: string[] = []
  let [y, m] = from.split('-').map(Number) as [number, number]
  for (;;) {
    const month = `${y}-${String(m).padStart(2, '0')}-01`
    if (month > to) return list
    list.push(month)
    ;[y, m] = m === 12 ? [y + 1, 1] : [y, m + 1]
  }
}

const REQUEST_DAYS = 7

export function createMockAdminApi(getToken: () => string | null): AdminApi {
  const sessions = new Map<string, MockAccount>()
  // Comptes, joueurs supprimés et demandes : propres à chaque instance (perdus au rechargement).
  const accounts: MockAccount[] = ACCOUNTS.map((a) => ({ ...a }))
  const deletedPlayers = new Set<string>()
  const requests: (DeletionRequest & { playerIds: string[] })[] = []

  function current(): MockAccount {
    const token = getToken()
    const account = token ? (sessions.get(token) ?? restore(token)) : undefined
    if (!account) throw problem('UNAUTHENTICATED', 'Votre session a expiré, reconnectez-vous.')
    return account
  }

  /** Les jetons simulés encodent l'identifiant du compte, pour survivre au rechargement. */
  function restore(token: string): MockAccount | undefined {
    const account = accounts.find((a) => token === `mock-admin.${a.id}`)
    if (account) sessions.set(token, account)
    return account
  }

  function admin(): MockAccount {
    const account = current()
    if (account.role !== 'ADMIN')
      throw problem('FORBIDDEN', 'Ces informations sont réservées au rôle administrateur.')
    if (account.deactivatedAt) throw problem('UNAUTHENTICATED', 'Ce compte a été désactivé.')
    if (account.mustChangePassword)
      throw problem('PASSWORD_CHANGE_REQUIRED', 'Changez votre mot de passe provisoire pour continuer.')
    return account
  }

  const toUser = ({ id, pseudo, role, createdAt, mustChangePassword }: MockAccount): User => ({
    id,
    pseudo,
    role,
    createdAt,
    mustChangePassword,
  })

  const summaryOf = (accountId: string | null): AdminSummary | null => {
    const a = accounts.find((x) => x.id === accountId)
    return a ? { id: a.id, pseudo: a.pseudo } : null
  }

  function toAdminAccount(a: MockAccount): AdminAccount {
    return {
      id: a.id,
      pseudo: a.pseudo,
      login: a.login,
      createdAt: a.createdAt,
      createdBy: summaryOf(a.createdBy),
      lastLoginAt: a.id === current().id ? new Date().toISOString() : null,
      mustChangePassword: a.mustChangePassword,
      active: !a.deactivatedAt,
      deactivatedAt: a.deactivatedAt,
      deactivatedBy: summaryOf(a.deactivatedBy),
    }
  }

  function expireRequests() {
    const limit = Date.now() - REQUEST_DAYS * DAY_MS
    for (const r of requests)
      if (r.status === 'PENDING' && Date.parse(r.createdAt) < limit) {
        r.status = 'EXPIRED'
        r.decidedAt = new Date().toISOString()
      }
  }

  function livePlayers() {
    return data().players.filter((p) => !deletedPlayers.has(p.id))
  }

  function toAdminPlayer(p: Dataset['players'][number], from: string, to: string): AdminPlayer {
    const x = playerExtras().get(p.id)!
    const loginDays = Object.keys(x.logins).sort()
    return {
      id: p.id,
      pseudo: p.pseudo,
      login: p.pseudo.toLowerCase(),
      createdAt: `${p.createdDay}T09:00:00Z`,
      lastLoginAt: loginDays.length ? `${loginDays[loginDays.length - 1]}T18:00:00Z` : null,
      loginsInPeriod: loginDays
        .filter((d) => d >= from && d <= to)
        .reduce((n, d) => n + x.logins[d]!, 0),
      totalCards: Object.values(x.cards).reduce((a, b) => a + b, 0),
      pendingDeletionRequestId:
        requests.find((r) => r.status === 'PENDING' && r.playerIds.includes(p.id))?.id ?? null,
    }
  }

  function findRequest(requestId: string) {
    expireRequests()
    const request = requests.find((r) => r.id === requestId)
    if (!request) throw problem('NOT_FOUND', "Cette demande n'existe pas.")
    return request
  }

  function pending(request: DeletionRequest) {
    if (request.status !== 'PENDING')
      throw problem('REQUEST_NOT_PENDING', 'Cette demande a déjà été traitée, annulée ou a expiré.')
  }

  /** Réponse sans le champ interne `playerIds`. */
  function publicRequest(request: DeletionRequest & { playerIds: string[] }): DeletionRequest {
    const copy: Partial<typeof request> = clone(request)
    delete copy.playerIds
    return copy as DeletionRequest
  }

  return {
    async register() {
      throw problem('FORBIDDEN', "La création de compte se fait depuis l'application joueur.")
    },

    async login(body) {
      await delay()
      const account = accounts.find(
        (a) => normalize(a.login) === normalize(body.login) && a.password === body.password,
      )
      if (!account) throw problem('INVALID_CREDENTIALS', 'Identifiant ou mot de passe incorrect.')
      if (account.deactivatedAt)
        throw problem('ACCOUNT_DISABLED', 'Ce compte administrateur a été désactivé.')
      const accessToken = `mock-admin.${account.id}`
      sessions.set(accessToken, account)
      return {
        accessToken,
        refreshToken: `refresh.${account.id}`,
        tokenType: 'Bearer',
        expiresIn: 900,
        sessionIdleSeconds: 1200,
        user: toUser(account),
      }
    },

    async logout() {
      const token = getToken()
      if (token) sessions.delete(token)
    },

    // Mode simulé : les jetons n'expirent pas, rien à renouveler.
    async keepAlive() {},

    async changePassword(body) {
      await delay()
      const account = current()
      if (account.password !== body.currentPassword) {
        throw problem('VALIDATION_ERROR', 'Mot de passe incorrect.', {
          errors: [{ field: 'currentPassword', message: 'Mot de passe incorrect.' }],
        })
      }
      account.password = body.newPassword
      account.mustChangePassword = false
      return {
        accessToken: getToken() ?? `mock-admin.${account.id}`,
        refreshToken: `refresh.${account.id}`,
        tokenType: 'Bearer',
        expiresIn: 900,
        sessionIdleSeconds: 1200,
        user: toUser(account),
      }
    },

    async deleteAccount(body) {
      await delay()
      const account = current()
      if (account.password !== body.password) {
        throw problem('VALIDATION_ERROR', 'Mot de passe incorrect.', {
          errors: [{ field: 'password', message: 'Mot de passe incorrect.' }],
        })
      }
      const otherAdmins = accounts.filter(
        (a) => a.role === 'ADMIN' && a.id !== account.id && !a.deactivatedAt,
      )
      if (account.role === 'ADMIN' && otherAdmins.length === 0) {
        throw problem(
          'LAST_ADMIN',
          'Vous êtes le dernier administrateur : nommez-en un autre avant de supprimer votre compte.',
        )
      }
      accounts.splice(accounts.indexOf(account), 1)
      for (const r of requests)
        if (r.status === 'PENDING' && (r.requestedBy.id === account.id || r.validator.id === account.id)) {
          r.status = 'CANCELLED'
          r.decidedAt = new Date().toISOString()
        }
      for (const [token, a] of sessions) if (a.id === account.id) sessions.delete(token)
    },

    async getMe() {
      await delay(80, 160)
      const account = current()
      return {
        ...toUser(account),
        progress: {
          ownedCreatures: 0,
          totalCreatures: CREATURES.length,
          totalCards: 0,
          completionPercent: 0,
        },
        boosterAvailableToday: false,
      }
    },

    async listRarities() {
      await delay(50, 120)
      return clone(RARITIES)
    },

    async searchPlayers(query) {
      await delay(120, 250)
      admin()
      const search = normalize(query.search ?? '')
      if (search.length < 2) throw problem('VALIDATION_ERROR', 'Saisissez au moins 2 caractères.')
      const items = data()
        .players.filter((p) => normalize(p.pseudo).startsWith(search))
        .map(({ id, pseudo }) => ({ id, pseudo }))
      return clone(paginate(items, query.page, query.pageSize))
    },

    async getAdminStats(query) {
      await delay()
      admin()
      const { from, to } = period(query)
      const d = data()
      const range = days(from, to)
      const boosters = new Map(d.boosters.map((b) => [b.date, b.count]))
      const accepted = d.trades.filter((t) => t.status === 'ACCEPTED' && t.decidedAt)
      const perDay = range.map((date) => ({
        date,
        count: accepted.filter((t) => dayOf(t.decidedAt!) === date).length,
      }))
      return {
        period: { from, to },
        registrations: {
          total: d.players.filter((p) => p.createdDay <= to).length,
          inPeriod: d.players.filter((p) => p.createdDay >= from && p.createdDay <= to).length,
        },
        boostersOpenedPerDay: range.map((date) => ({ date, count: boosters.get(date) ?? 0 })),
        completedTrades: { inPeriod: perDay.reduce((a, b) => a + b.count, 0), perDay },
      }
    },

    async listAdminTrades(query = {}) {
      await delay()
      admin()
      const { from, to } = period(query)
      const items = data().trades.filter((t) => {
        const day = dayOf(t.createdAt)
        return (
          day >= from &&
          day <= to &&
          (!query.status || t.status === query.status) &&
          (!query.playerId || t.proposer.id === query.playerId || t.recipient.id === query.playerId)
        )
      })
      return clone(paginate(items, query.page, query.pageSize))
    },

    async getRarityDistribution(query) {
      await delay()
      admin()
      const { from, to } = period(query)
      const d = data()
      const totals: Record<string, number> = Object.fromEntries(RARITIES.map((r) => [r.code, 0]))
      for (const day of days(from, to)) {
        for (const [code, n] of Object.entries(d.draws[day] ?? {}))
          totals[code] = (totals[code] ?? 0) + n
      }
      const total = Object.values(totals).reduce((a, b) => a + b, 0)
      return {
        period: { from, to },
        totalCardsDistributed: total,
        items: RARITIES.map((r) => ({
          rarity: { code: r.code, label: r.label },
          expectedRate: r.dropRate,
          observedCount: totals[r.code] ?? 0,
          observedRate: total ? (totals[r.code] ?? 0) / total : 0,
        })),
      }
    },

    async getBoosterSettings() {
      await delay(100, 220)
      admin()
      return clone(readMockBoosterSettings())
    },

    async updateBoosterSettings(body) {
      await delay()
      const account = admin()
      const n = body.cardsPerBooster
      if (!Number.isInteger(n) || n < MIN_CARDS_PER_BOOSTER || n > MAX_CARDS_PER_BOOSTER) {
        const message = `Choisissez entre ${MIN_CARDS_PER_BOOSTER} et ${MAX_CARDS_PER_BOOSTER} cartes.`
        throw problem('VALIDATION_ERROR', message, {
          errors: [{ field: 'cardsPerBooster', message }],
        })
      }
      const current = readMockBoosterSettings()
      const settings = {
        ...current,
        // Comme le serveur : appliqué au prochain minuit, les valeurs du jour ne changent pas.
        scheduled: {
          cardsPerBooster: n,
          rarityWeights: body.rarityWeights ?? current.rarityWeights,
          effectiveFrom: addDays(parisToday(), 1),
        },
        updatedAt: new Date().toISOString(),
        updatedBy: { id: account.id, pseudo: account.pseudo },
      }
      writeMockBoosterSettings(settings)
      return clone(settings)
    },

    async listAdminCreatures() {
      await delay(100, 220)
      admin()
      return clone(mockCreatures())
    },

    async createAdminCreature(body) {
      await delay()
      admin()
      const legendary = body.rarity === 'LEGENDARY'
      if (legendary !== (body.stock != null)) {
        const message = legendary
          ? "Une légendaire est une édition limitée : indiquez le nombre d'exemplaires."
          : "Seule une légendaire (édition limitée) a un nombre d'exemplaires."
        throw problem('VALIDATION_ERROR', message, { errors: [{ field: 'stock', message }] })
      }
      if (mockCreatures().some((c) => normalize(c.name) === normalize(body.name))) {
        const message = 'Une carte porte déjà ce nom.'
        throw problem('VALIDATION_ERROR', message, { errors: [{ field: 'name', message }] })
      }
      const family = FAMILIES.find((f) => f.code === body.family) ?? FAMILIES[0]!
      const rarity = RARITIES.find((r) => r.code === body.rarity) ?? RARITIES[0]!
      const created: AdminCreature = {
        id: String(1000 + addedCreatures.length),
        name: body.name.trim(),
        description: body.description ?? '',
        family,
        rarity: { code: rarity.code, label: rarity.label },
        image: body.image,
        imageUrl: body.image,
        stockTotal: body.stock ?? null,
        stockRemaining: body.stock ?? null,
        availableFrom: addDays(parisToday(), 1),
        scheduledChange: null,
      }
      addedCreatures.push(created)
      return clone(created)
    },

    async scheduleRarityChange(creatureId, body) {
      await delay()
      admin()
      const creature = mockCreatures().find((c) => c.id === creatureId)
      if (!creature) throw problem('NOT_FOUND', "Cette créature n'existe pas.")
      const rarity = RARITIES.find((r) => r.code === body.rarity) ?? RARITIES[0]!
      rarityChanges.set(creatureId, {
        rarity: { code: rarity.code, label: rarity.label },
        stock: body.stock ?? null,
        effectiveFrom: addDays(parisToday(), 1),
      })
      return clone(mockCreatures().find((c) => c.id === creatureId)!)
    },

    async cancelRarityChange(creatureId) {
      await delay()
      admin()
      rarityChanges.delete(creatureId)
      const creature = mockCreatures().find((c) => c.id === creatureId)
      if (!creature) throw problem('NOT_FOUND', "Cette créature n'existe pas.")
      return clone(creature)
    },

    async uploadSprite(creatureId, file, filename) {
      await delay()
      admin()
      const creature = mockCreatures().find((c) => c.id === creatureId)
      if (!creature) throw problem('NOT_FOUND', "Cette créature n'existe pas.")
      const name = filename ? `${filename}.png` : file.name
      if (!name.match(/^[a-z0-9_-]+\.png$/))
        throw problem('VALIDATION_ERROR', "Le nom de fichier doit être en snake_case minuscules, extension .png.")
      const updated = { ...creature, image: `sprites/${name}`, imageUrl: URL.createObjectURL(file) }
      const idx = addedCreatures.findIndex((c) => c.id === creatureId)
      if (idx >= 0) addedCreatures[idx] = updated
      return clone(updated)
    },

    // ── Joueurs et admins (AS-71) ──

    async listAdminPlayers(query = {}) {
      await delay()
      admin()
      expireRequests()
      const { from, to } = period(query)
      const search = normalize(query.search ?? '')
      const rows = livePlayers()
        .filter((p) => normalize(p.pseudo).includes(search))
        .map((p) => toAdminPlayer(p, from, to))
      const sort = query.sort ?? 'pseudo'
      const key = (p: AdminPlayer): string | number => {
        if (sort === 'pseudo') return p.pseudo.toLowerCase()
        if (sort === 'createdAt') return p.createdAt
        if (sort === 'lastLoginAt') return p.lastLoginAt ?? ''
        if (sort === 'logins') return p.loginsInPeriod
        return p.totalCards
      }
      const direction = query.order === 'desc' ? -1 : 1
      rows.sort((a, b) => {
        const ka = key(a)
        const kb = key(b)
        if (ka === kb) return a.pseudo.localeCompare(b.pseudo)
        return (ka < kb ? -1 : 1) * direction
      })
      return clone({ ...paginate(rows, query.page, query.pageSize), period: { from, to } })
    },

    async getAdminPlayer(playerId, query = {}) {
      await delay()
      admin()
      expireRequests()
      const { from, to } = period(query)
      const p = livePlayers().find((x) => x.id === playerId)
      if (!p) throw problem('NOT_FOUND', "Ce joueur n'existe pas.")
      const x = playerExtras().get(p.id)!
      const owned = Object.entries(x.cards).map(([id, n]) => ({
        creature: CREATURES.find((c) => c.id === id)!,
        n,
      }))
      const granularity = query.granularity ?? 'DAY'
      const buckets = granularity === 'DAY' ? days(from, to) : months(from, to)
      const bucketOf = (day: string) => (granularity === 'DAY' ? day : `${day.slice(0, 7)}-01`)
      const counts: Record<string, number> = {}
      for (const [day, n] of Object.entries(x.logins))
        if (day >= from && day <= to) counts[bucketOf(day)] = (counts[bucketOf(day)] ?? 0) + n
      return clone({
        player: toAdminPlayer(p, from, to),
        cardsByRarity: RARITIES.map((r) => {
          const mine = owned.filter((o) => o.creature.rarity.code === r.code)
          return {
            rarity: { code: r.code, label: r.label },
            cards: mine.reduce((a, o) => a + o.n, 0),
            distinctCreatures: mine.length,
          }
        }),
        cardsByFamily: FAMILIES.map((f) => {
          const mine = owned.filter((o) => o.creature.family.code === f.code)
          return { family: f, cards: mine.reduce((a, o) => a + o.n, 0), distinctCreatures: mine.length }
        }),
        logins: {
          granularity,
          points: buckets.map((date) => ({ date, count: counts[date] ?? 0 })),
        },
      })
    },

    async listDeletionRequests(query = {}) {
      await delay(100, 220)
      const me = admin()
      expireRequests()
      const items = requests
        .filter((r) => (!query.status || r.status === query.status) && (!query.toValidate || r.validator.id === me.id))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(publicRequest)
      return clone(paginate(items, query.page, query.pageSize))
    },

    async createDeletionRequest(body) {
      await delay()
      const me = admin()
      expireRequests()
      const field = (name: string, message: string) =>
        problem('VALIDATION_ERROR', message, { errors: [{ field: name, message }] })
      if (body.validatorId === me.id)
        throw field('validatorId', 'Choisissez un autre administrateur que vous pour valider.')
      const validator = accounts.find((a) => a.id === body.validatorId)
      if (!validator || validator.role !== 'ADMIN' || validator.deactivatedAt)
        throw field('validatorId', 'Le validateur doit être un administrateur actif.')
      const ids = [...new Set(body.playerIds)]
      if (!ids.length) throw field('playerIds', 'Choisissez au moins un joueur.')
      const players = ids.map((id) => livePlayers().find((p) => p.id === id))
      if (players.some((p) => !p))
        throw field('playerIds', 'Seuls des comptes joueurs existants peuvent être supprimés.')
      if (requests.some((r) => r.status === 'PENDING' && r.playerIds.some((id) => ids.includes(id))))
        throw problem('PLAYER_ALREADY_REQUESTED', "Un des joueurs fait déjà l'objet d'une demande en attente.")
      const createdAt = new Date().toISOString()
      const request = {
        id: uuid(),
        status: 'PENDING' as const,
        requestedBy: { id: me.id, pseudo: me.pseudo },
        validator: { id: validator.id, pseudo: validator.pseudo },
        reason: body.reason?.trim() || null,
        accountCount: ids.length,
        players: players
          .map((p) => ({ id: p!.id, pseudo: p!.pseudo }))
          .sort((a, b) => a.pseudo.localeCompare(b.pseudo)),
        createdAt,
        expiresAt: new Date(Date.parse(createdAt) + REQUEST_DAYS * DAY_MS).toISOString(),
        decidedAt: null,
        playerIds: ids,
      }
      requests.push(request)
      return publicRequest(request)
    },

    async approveDeletionRequest(requestId) {
      await delay()
      const me = admin()
      const request = findRequest(requestId)
      if (request.validator.id !== me.id)
        throw problem('FORBIDDEN', "Seul l'administrateur choisi peut traiter cette demande.")
      pending(request)
      for (const id of request.playerIds) deletedPlayers.add(id)
      request.status = 'APPROVED'
      request.decidedAt = new Date().toISOString()
      request.players = [] // le journal ne garde pas les joueurs supprimés
      return publicRequest(request)
    },

    async rejectDeletionRequest(requestId) {
      await delay()
      const me = admin()
      const request = findRequest(requestId)
      if (request.validator.id !== me.id)
        throw problem('FORBIDDEN', "Seul l'administrateur choisi peut traiter cette demande.")
      pending(request)
      request.status = 'REJECTED'
      request.decidedAt = new Date().toISOString()
      return publicRequest(request)
    },

    async cancelDeletionRequest(requestId) {
      await delay()
      const me = admin()
      const request = findRequest(requestId)
      if (request.requestedBy.id !== me.id)
        throw problem('FORBIDDEN', "Seul l'administrateur qui a fait la demande peut l'annuler.")
      pending(request)
      request.status = 'CANCELLED'
      request.decidedAt = new Date().toISOString()
      return publicRequest(request)
    },

    async listAdmins() {
      await delay(100, 220)
      admin()
      return clone(
        accounts
          .filter((a) => a.role === 'ADMIN')
          .sort((a, b) => Number(!!a.deactivatedAt) - Number(!!b.deactivatedAt) || a.pseudo.localeCompare(b.pseudo))
          .map(toAdminAccount),
      )
    },

    async createAdmin(body) {
      await delay()
      const me = admin()
      if (accounts.some((a) => normalize(a.login) === normalize(body.login))) {
        const message = 'Cet identifiant est déjà utilisé.'
        throw problem('LOGIN_ALREADY_USED', message, { errors: [{ field: 'login', message }] })
      }
      if (accounts.some((a) => a.pseudo.toLowerCase() === body.pseudo.toLowerCase())) {
        const message = 'Ce pseudonyme est déjà pris.'
        throw problem('PSEUDO_ALREADY_USED', message, { errors: [{ field: 'pseudo', message }] })
      }
      const account: MockAccount = {
        id: uuid(),
        pseudo: body.pseudo,
        login: body.login,
        password: body.temporaryPassword,
        role: 'ADMIN',
        createdAt: new Date().toISOString(),
        mustChangePassword: true,
        createdBy: me.id,
        deactivatedAt: null,
        deactivatedBy: null,
      }
      accounts.push(account)
      return clone(toAdminAccount(account))
    },

    async deactivateAdmin(adminId) {
      await delay()
      const me = admin()
      if (adminId === me.id) throw problem('VALIDATION_ERROR', 'Vous ne pouvez pas désactiver votre propre compte.')
      const target = accounts.find((a) => a.id === adminId && a.role === 'ADMIN' && !a.deactivatedAt)
      if (!target) throw problem('NOT_FOUND', "Ce compte n'est pas un administrateur actif.")
      const othersActive = accounts.filter(
        (a) => a.role === 'ADMIN' && !a.deactivatedAt && a.id !== adminId,
      ).length
      if (othersActive < 2)
        throw problem(
          'VALIDATION_ERROR',
          'Impossible : il doit rester au moins deux administrateurs actifs.',
        )
      target.deactivatedAt = new Date().toISOString()
      target.deactivatedBy = me.id
      for (const r of requests)
        if (r.status === 'PENDING' && (r.requestedBy.id === adminId || r.validator.id === adminId)) {
          r.status = 'CANCELLED'
          r.decidedAt = target.deactivatedAt
        }
      return clone(toAdminAccount(target))
    },
  }
}

// Cartes ajoutées et changements de rareté de la démo : en mémoire, perdus au rechargement.
const addedCreatures: AdminCreature[] = []
const rarityChanges = new Map<string, NonNullable<AdminCreature['scheduledChange']>>()

function mockCreatures(): AdminCreature[] {
  const base: AdminCreature[] = CREATURES.map((c) => ({
    ...c,
    image: c.imageUrl,
    stockTotal: null,
    stockRemaining: null,
    availableFrom: '2026-01-01',
    scheduledChange: null,
  }))
  return [...base, ...addedCreatures].map((c) => ({
    ...c,
    scheduledChange: rarityChanges.get(c.id) ?? null,
  }))
}
