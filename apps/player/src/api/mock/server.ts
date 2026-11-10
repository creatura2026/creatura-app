/**
 * Implémentation SIMULÉE de l'API joueur, en attendant le serveur NestJS.
 * Elle applique les règles métier du document (un booster par jour, transfert tout-ou-rien…)
 * et renvoie les mêmes codes d'erreur que le contrat OpenAPI.
 */
import type { PlayerApi } from '@creatura/shared/api/contract'
import type {
  Booster,
  BoosterCard,
  CollectionEntry,
  CollectionProgress,
  CreatureSummary,
  Trade,
  TradeItem,
  TradeItemInput,
  User,
} from '@creatura/shared/api/types'
import { clone, delay, normalize, paginate, problem, uuid } from '@creatura/shared/api/mock-utils'
import { compareCreatures, CREATURES, FAMILIES, RARITIES } from '@creatura/shared/fixtures/catalog'
import { nextParisMidnight, parisToday } from '@creatura/shared/format'

import { loadDb, saveDb, type MockBooster, type MockUser } from './db'

/** Nombre de cartes par booster — à valider au point client. */
export const CARDS_PER_BOOSTER = 5

const withoutUser = ({ id, claimDate, openedAt, cards }: MockBooster): Booster => ({
  id,
  claimDate,
  openedAt,
  cards,
})

const toUser = (u: MockUser): User => ({
  id: u.id,
  pseudo: u.pseudo,
  role: u.role,
  createdAt: u.createdAt,
})

const toSummary = (id: string): CreatureSummary => {
  const creature = CREATURES.find((c) => c.id === id)
  if (!creature) throw problem('NOT_FOUND', 'Créature inconnue.')
  const { name, family, rarity, imageUrl } = creature
  return { id, name, family, rarity, imageUrl }
}

function progressOf(userId: string): CollectionProgress {
  const owned = loadDb().collections[userId] ?? {}
  const quantities = Object.values(owned).filter((q) => q > 0)
  const ownedCreatures = quantities.length
  const totalCreatures = CREATURES.length
  return {
    ownedCreatures,
    totalCreatures,
    totalCards: quantities.reduce((a, b) => a + b, 0),
    completionPercent: totalCreatures
      ? Math.round((ownedCreatures / totalCreatures) * 1000) / 10
      : 0,
  }
}

function drawCreatureId(random: () => number): string {
  let roll = random()
  let rarityCode = RARITIES[0]!.code
  for (const r of RARITIES) {
    if (roll < r.dropRate) {
      rarityCode = r.code
      break
    }
    roll -= r.dropRate
  }
  const pool = CREATURES.filter((c) => c.rarity.code === rarityCode)
  return pool[Math.floor(random() * pool.length)]!.id
}

function quantityOf(userId: string, creatureId: string): number {
  return loadDb().collections[userId]?.[creatureId] ?? 0
}

function addCards(userId: string, creatureId: string, delta: number): void {
  const db = loadDb()
  const col = (db.collections[userId] ??= {})
  col[creatureId] = (col[creatureId] ?? 0) + delta
  if (col[creatureId] <= 0) delete col[creatureId]
}

function toItems(inputs: TradeItemInput[]): TradeItem[] {
  return inputs.map((i) => ({ creature: toSummary(i.creatureId), quantity: i.quantity }))
}

function hasAll(userId: string, items: TradeItem[]): boolean {
  return items.every((i) => quantityOf(userId, i.creature.id) >= i.quantity)
}

export interface MockApiOptions {
  getToken: () => string | null
  random?: () => number
  now?: () => Date
}

export function createMockPlayerApi({
  getToken,
  random = Math.random,
  now = () => new Date(),
}: MockApiOptions): PlayerApi & { resetTodayBooster(): Promise<void> } {
  function currentUser(): MockUser {
    const db = loadDb()
    const token = getToken()
    const userId = token ? db.sessions[token] : undefined
    const user = userId ? db.users.find((u) => u.id === userId) : undefined
    if (!user) throw problem('UNAUTHENTICATED', 'Votre session a expiré, reconnectez-vous.')
    return user
  }

  function findTrade(tradeId: string): Trade {
    const trade = loadDb().trades.find((t) => t.id === tradeId)
    if (!trade) throw problem('NOT_FOUND', 'Cet échange n’existe pas.')
    return trade
  }

  function todayBooster(userId: string) {
    const today = parisToday(now())
    return loadDb().boosters.find((b) => b.userId === userId && b.claimDate === today) ?? null
  }

  return {
    async register(body) {
      await delay()
      const db = loadDb()
      if (db.users.some((u) => normalize(u.login) === normalize(body.login))) {
        throw problem('LOGIN_ALREADY_USED', 'Cet identifiant est déjà utilisé.', {
          errors: [{ field: 'login', message: 'Cet identifiant est déjà utilisé.' }],
        })
      }
      if (db.users.some((u) => normalize(u.pseudo) === normalize(body.pseudo))) {
        throw problem('PSEUDO_ALREADY_USED', 'Ce pseudonyme est déjà pris.', {
          errors: [{ field: 'pseudo', message: 'Ce pseudonyme est déjà pris.' }],
        })
      }
      const user: MockUser = {
        id: uuid(),
        pseudo: body.pseudo,
        login: body.login,
        password: body.password,
        role: 'PLAYER',
        createdAt: now().toISOString(),
      }
      db.users.push(user)
      db.collections[user.id] = {}
      saveDb()
      return toUser(user)
    },

    async login(body) {
      await delay()
      const db = loadDb()
      const user = db.users.find(
        (u) => normalize(u.login) === normalize(body.login) && u.password === body.password,
      )
      if (!user) throw problem('INVALID_CREDENTIALS', 'Identifiant ou mot de passe incorrect.')
      const accessToken = `mock.${uuid()}`
      db.sessions[accessToken] = user.id
      saveDb()
      return {
        accessToken,
        refreshToken: `refresh.${uuid()}`,
        tokenType: 'Bearer',
        expiresIn: 900,
        user: toUser(user),
      }
    },

    async logout() {
      await delay(50, 120)
      const token = getToken()
      if (token) {
        delete loadDb().sessions[token]
        saveDb()
      }
    },

    async getMe() {
      await delay()
      const user = currentUser()
      return {
        ...toUser(user),
        progress: progressOf(user.id),
        boosterAvailableToday: !todayBooster(user.id),
      }
    },

    async listFamilies() {
      await delay(50, 150)
      return clone(FAMILIES)
    },

    async listRarities() {
      await delay(50, 150)
      return clone(RARITIES)
    },

    async listCreatures(query = {}) {
      await delay()
      currentUser()
      const search = query.search ? normalize(query.search) : null
      const items = CREATURES.filter(
        (c) =>
          (!search || normalize(c.name).includes(search)) &&
          (!query.family || c.family.code === query.family) &&
          (!query.rarity || c.rarity.code === query.rarity),
      ).sort(compareCreatures)
      return clone(paginate(items, query.page, query.pageSize))
    },

    async getCreature(creatureId) {
      await delay()
      currentUser()
      const creature = CREATURES.find((c) => c.id === creatureId)
      if (!creature) throw problem('NOT_FOUND', 'Cette créature n’existe pas.')
      return clone(creature)
    },

    async getTodayBooster() {
      await delay()
      const user = currentUser()
      const booster = todayBooster(user.id)
      return {
        claimDate: parisToday(now()),
        available: !booster,
        nextAvailableAt: nextParisMidnight(now()),
        booster: booster ? clone(withoutUser(booster)) : null,
      }
    },

    async claimBooster() {
      await delay(500, 800)
      const user = currentUser()
      const existing = todayBooster(user.id)
      if (existing) {
        throw problem(
          'BOOSTER_ALREADY_CLAIMED',
          `Le booster du ${existing.claimDate} a déjà été ouvert. Prochain booster à partir de minuit (heure de Paris).`,
          { boosterId: existing.id },
        )
      }
      // Tirage et ajout dans la même « transaction » : rien n'est écrit avant la fin.
      const seen = new Set(
        Object.entries(loadDb().collections[user.id] ?? {})
          .filter(([, q]) => q > 0)
          .map(([id]) => id),
      )
      const cards: BoosterCard[] = []
      for (let i = 0; i < CARDS_PER_BOOSTER; i++) {
        const id = drawCreatureId(random)
        cards.push({ creature: toSummary(id), isNew: !seen.has(id) })
        seen.add(id)
      }
      cards.forEach((card) => addCards(user.id, card.creature.id, 1))
      const booster: MockBooster = {
        id: uuid(),
        userId: user.id,
        claimDate: parisToday(now()),
        openedAt: now().toISOString(),
        cards,
      }
      loadDb().boosters.push(booster)
      saveDb()
      return clone(withoutUser(booster))
    },

    async getMyCollection(query = {}) {
      await delay()
      const user = currentUser()
      const search = query.search ? normalize(query.search) : null
      const ownership = query.ownership ?? 'all'
      const items: CollectionEntry[] = CREATURES.map((c) => ({
        creature: toSummary(c.id),
        quantity: quantityOf(user.id, c.id),
      }))
        .filter(
          (e) =>
            (!search || normalize(e.creature.name).includes(search)) &&
            (!query.family || e.creature.family.code === query.family) &&
            (!query.rarity || e.creature.rarity.code === query.rarity) &&
            (ownership === 'all' || (ownership === 'owned' ? e.quantity > 0 : e.quantity === 0)) &&
            (!query.duplicatesOnly || e.quantity >= 2),
        )
        .sort((a, b) => compareCreatures(a.creature, b.creature))
      return clone({
        ...paginate(items, query.page, query.pageSize),
        progress: progressOf(user.id),
      })
    },

    async searchPlayers(query) {
      await delay()
      const me = currentUser()
      const search = normalize(query.search ?? '')
      if (search.length < 2) {
        throw problem('VALIDATION_ERROR', 'Saisissez au moins 2 caractères.', {
          errors: [{ field: 'search', message: 'Saisissez au moins 2 caractères.' }],
        })
      }
      const items = loadDb()
        .users.filter(
          (u) => u.id !== me.id && u.role === 'PLAYER' && normalize(u.pseudo).startsWith(search),
        )
        .map((u) => ({ id: u.id, pseudo: u.pseudo }))
        .sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr'))
      return clone(paginate(items, query.page, query.pageSize))
    },

    async getTradeableCards(playerId) {
      await delay()
      currentUser()
      const target = loadDb().users.find((u) => u.id === playerId && u.role === 'PLAYER')
      if (!target) throw problem('NOT_FOUND', 'Ce joueur n’existe pas.')
      // Règle proposée : seuls les doublons sont échangeables, un exemplaire reste au joueur.
      const items = Object.entries(loadDb().collections[target.id] ?? {})
        .filter(([, q]) => q >= 2)
        .map(([id, q]) => ({ creature: toSummary(id), availableQuantity: q - 1 }))
        .sort((a, b) => compareCreatures(a.creature, b.creature))
      return clone({ player: { id: target.id, pseudo: target.pseudo }, items })
    },

    async createTrade(body) {
      await delay()
      const me = currentUser()
      if (body.recipientId === me.id)
        throw problem('TRADE_WITH_SELF', 'Vous ne pouvez pas échanger avec vous-même.')
      const recipient = loadDb().users.find((u) => u.id === body.recipientId && u.role === 'PLAYER')
      if (!recipient) throw problem('NOT_FOUND', 'Ce joueur n’existe pas.')
      if (!body.offered.length || !body.requested.length) {
        throw problem('VALIDATION_ERROR', 'Il faut au moins une carte de chaque côté.')
      }
      const offered = toItems(body.offered)
      if (!hasAll(me.id, offered)) {
        throw problem('CARDS_NOT_OWNED', 'Vous ne possédez pas toutes les cartes proposées.')
      }
      const trade: Trade = {
        id: uuid(),
        status: 'PENDING',
        proposer: { id: me.id, pseudo: me.pseudo },
        recipient: { id: recipient.id, pseudo: recipient.pseudo },
        offered,
        requested: toItems(body.requested),
        createdAt: now().toISOString(),
        decidedAt: null,
      }
      loadDb().trades.push(trade)
      saveDb()
      return clone(trade)
    },

    async listMyTrades(query = {}) {
      await delay()
      const me = currentUser()
      const role = query.role ?? 'all'
      const items = loadDb()
        .trades.filter(
          (t) =>
            (role === 'all'
              ? t.proposer.id === me.id || t.recipient.id === me.id
              : role === 'sent'
                ? t.proposer.id === me.id
                : t.recipient.id === me.id) &&
            (!query.status || t.status === query.status),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return clone(paginate(items, query.page, query.pageSize))
    },

    async getTrade(tradeId) {
      await delay()
      const me = currentUser()
      const trade = findTrade(tradeId)
      if (trade.proposer.id !== me.id && trade.recipient.id !== me.id) {
        throw problem('FORBIDDEN', 'Cet échange ne vous concerne pas.')
      }
      return clone(trade)
    },

    async acceptTrade(tradeId) {
      await delay(400, 700)
      const me = currentUser()
      const trade = findTrade(tradeId)
      if (trade.recipient.id !== me.id)
        throw problem('FORBIDDEN', 'Seul le destinataire peut accepter.')
      if (trade.status !== 'PENDING')
        throw problem('TRADE_NOT_PENDING', 'Cet échange n’est plus en attente.')
      // Vérification au moment de l'acceptation : tout ou rien.
      if (!hasAll(trade.proposer.id, trade.offered) || !hasAll(me.id, trade.requested)) {
        trade.status = 'FAILED'
        trade.decidedAt = now().toISOString()
        trade.failureReason = 'CARDS_UNAVAILABLE'
        saveDb()
        throw problem(
          'CARDS_UNAVAILABLE',
          'Une carte n’est plus disponible. Aucune carte n’a été transférée.',
        )
      }
      for (const item of trade.offered) {
        addCards(trade.proposer.id, item.creature.id, -item.quantity)
        addCards(me.id, item.creature.id, item.quantity)
      }
      for (const item of trade.requested) {
        addCards(me.id, item.creature.id, -item.quantity)
        addCards(trade.proposer.id, item.creature.id, item.quantity)
      }
      trade.status = 'ACCEPTED'
      trade.decidedAt = now().toISOString()
      saveDb()
      return clone(trade)
    },

    async refuseTrade(tradeId) {
      await delay()
      const me = currentUser()
      const trade = findTrade(tradeId)
      if (trade.recipient.id !== me.id)
        throw problem('FORBIDDEN', 'Seul le destinataire peut refuser.')
      if (trade.status !== 'PENDING')
        throw problem('TRADE_NOT_PENDING', 'Cet échange n’est plus en attente.')
      trade.status = 'REFUSED'
      trade.decidedAt = now().toISOString()
      saveDb()
      return clone(trade)
    },

    async cancelTrade(tradeId) {
      await delay()
      const me = currentUser()
      const trade = findTrade(tradeId)
      if (trade.proposer.id !== me.id) throw problem('FORBIDDEN', 'Seul le proposant peut annuler.')
      if (trade.status !== 'PENDING')
        throw problem('TRADE_NOT_PENDING', 'Cet échange n’est plus en attente.')
      trade.status = 'CANCELLED'
      trade.decidedAt = now().toISOString()
      saveDb()
      return clone(trade)
    },

    /** Outil de démonstration (hors contrat) : rend le booster du jour à nouveau disponible. */
    async resetTodayBooster() {
      await delay(50, 120)
      const user = currentUser()
      const today = parisToday(now())
      const db = loadDb()
      db.boosters = db.boosters.filter((b) => !(b.userId === user.id && b.claimDate === today))
      saveDb()
    },
  }
}
