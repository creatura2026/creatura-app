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
  AdminCreature,
  DailyCount,
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
} from '@creatura/shared/api/mock-utils'
import { CREATURES, FAMILIES, RARITIES } from '@creatura/shared/fixtures/catalog'
import { addDays, parisToday } from '@creatura/shared/format'

export const DEMO_ACCOUNTS = {
  admin: { login: 'admin', password: 'creatura-admin' },
  player: { login: 'demo', password: 'creatura-demo' },
}

interface MockAccount extends User {
  login: string
  password: string
}

const ACCOUNTS: MockAccount[] = [
  {
    id: 'adadadad-0000-4000-8000-000000000001',
    pseudo: 'Admin',
    role: 'ADMIN' as Role,
    createdAt: '2026-09-01T08:00:00Z',
    ...DEMO_ACCOUNTS.admin,
  },
  {
    id: '11111111-1111-4111-8111-111111111111',
    pseudo: 'Dresseur',
    role: 'PLAYER' as Role,
    createdAt: '2026-10-01T09:00:00Z',
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
    id: i === 0 ? ACCOUNTS[1]!.id : `ffffffff-0000-4000-8000-${String(i).padStart(12, '0')}`,
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

export function createMockAdminApi(getToken: () => string | null): AdminApi {
  const sessions = new Map<string, MockAccount>()

  function current(): MockAccount {
    const token = getToken()
    const account = token ? (sessions.get(token) ?? restore(token)) : undefined
    if (!account) throw problem('UNAUTHENTICATED', 'Votre session a expiré, reconnectez-vous.')
    return account
  }

  /** Les jetons simulés encodent l'identifiant du compte, pour survivre au rechargement. */
  function restore(token: string): MockAccount | undefined {
    const account = ACCOUNTS.find((a) => token === `mock-admin.${a.id}`)
    if (account) sessions.set(token, account)
    return account
  }

  function admin(): MockAccount {
    const account = current()
    if (account.role !== 'ADMIN')
      throw problem('FORBIDDEN', 'Ces informations sont réservées au rôle administrateur.')
    return account
  }

  const toUser = ({ id, pseudo, role, createdAt }: MockAccount): User => ({
    id,
    pseudo,
    role,
    createdAt,
  })

  return {
    async register() {
      throw problem('FORBIDDEN', 'La création de compte se fait depuis l’application joueur.')
    },

    async login(body) {
      await delay()
      const account = ACCOUNTS.find(
        (a) => normalize(a.login) === normalize(body.login) && a.password === body.password,
      )
      if (!account) throw problem('INVALID_CREDENTIALS', 'Identifiant ou mot de passe incorrect.')
      const accessToken = `mock-admin.${account.id}`
      sessions.set(accessToken, account)
      return {
        accessToken,
        refreshToken: `refresh.${account.id}`,
        tokenType: 'Bearer',
        expiresIn: 900,
        user: toUser(account),
      }
    },

    async logout() {
      const token = getToken()
      if (token) sessions.delete(token)
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
          ? 'Une légendaire est une édition limitée : indiquez le nombre d’exemplaires.'
          : 'Seule une légendaire (édition limitée) a un nombre d’exemplaires.'
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
      if (!creature) throw problem('NOT_FOUND', 'Cette créature n’existe pas.')
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
      if (!creature) throw problem('NOT_FOUND', 'Cette créature n’existe pas.')
      return clone(creature)
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
  return [...base, ...addedCreatures].map((c) => ({ ...c, scheduledChange: rarityChanges.get(c.id) ?? null }))
}
