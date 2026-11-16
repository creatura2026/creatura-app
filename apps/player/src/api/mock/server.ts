/**
 * Implémentation SIMULÉE de l'API joueur, en attendant le serveur NestJS.
 * Elle applique les règles métier du document (un booster par jour, transfert tout-ou-rien…)
 * et renvoie les mêmes codes d'erreur que le contrat OpenAPI.
 * La salle d'échange (WebSocket dans le contrat) est simulée dans `trade-room.ts`.
 */
import type { PlayerApi } from '@creatura/shared/api/contract'
import {
  ApiError,
  type Booster,
  type BoosterCard,
  type CollectionEntry,
  type CollectionProgress,
  type PlayerSummary,
  type Trade,
  type User,
} from '@creatura/shared/api/types'
import { clone, delay, normalize, paginate, problem, uuid } from '@creatura/shared/api/mock-utils'
import { compareCreatures, CREATURES, FAMILIES, RARITIES } from '@creatura/shared/fixtures/catalog'
import { nextParisMidnight, parisToday } from '@creatura/shared/format'
import { readMockBoosterSettings } from '@creatura/shared/api/mock-settings'

import {
  addCards,
  loadDb,
  quantityOf,
  saveDb,
  toSummary,
  type MockBooster,
  type MockUser,
} from './db'
import { startPartner, stopPartner } from './partner'
import { act, enterRoom, findTrade, hasPlayers, notifyRoom, sideOf } from './trade-room'

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

export interface MockApiOptions {
  getToken: () => string | null
  random?: () => number
  now?: () => Date
  /**
   * Fait jouer l'autre joueur dans la salle d'échange (voir `partner.ts`). Actif en démonstration,
   * coupé dans les tests, qui font parler deux vrais joueurs.
   */
  simulatePartner?: boolean
}

export function createMockPlayerApi({
  getToken,
  random = Math.random,
  now = () => new Date(),
  simulatePartner = import.meta.env.MODE !== 'test',
}: MockApiOptions): PlayerApi & { resetTodayBooster(): Promise<void> } {
  function currentUser(): MockUser {
    const db = loadDb()
    const token = getToken()
    const userId = token ? db.sessions[token] : undefined
    const user = userId ? db.users.find((u) => u.id === userId) : undefined
    if (!user) throw problem('UNAUTHENTICATED', 'Votre session a expiré, reconnectez-vous.')
    return user
  }

  /** Ferme un échange en cours sans rien transférer, et prévient la salle. */
  function close(trade: Trade, status: 'REFUSED' | 'CANCELLED'): Trade {
    if (trade.status !== 'PENDING') {
      throw problem('TRADE_NOT_PENDING', 'Cet échange n’est plus en cours.')
    }
    trade.status = status
    trade.proposerReady = false
    trade.recipientReady = false
    trade.decidedAt = now().toISOString()
    saveDb()
    notifyRoom(trade.id)
    return clone(trade)
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
        // Réglé par l'administrateur (dashboard → Réglages du booster).
        cardsPerBooster: readMockBoosterSettings().cardsPerBooster,
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
      const count = readMockBoosterSettings().cardsPerBooster
      for (let i = 0; i < count; i++) {
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
      // Toutes ses cartes peuvent être échangées, y compris son dernier exemplaire.
      const items = Object.entries(loadDb().collections[target.id] ?? {})
        .filter(([, q]) => q > 0)
        .map(([id, q]) => ({ creature: toSummary(id), availableQuantity: q }))
        .sort((a, b) => compareCreatures(a.creature, b.creature))
      return clone({ player: { id: target.id, pseudo: target.pseudo }, items })
    },

    async listCreatureOwners(creatureId) {
      await delay()
      const me = currentUser()
      const creature = toSummary(creatureId)
      const items = loadDb()
        .users.filter((u) => u.id !== me.id && u.role === 'PLAYER')
        .map((u) => ({
          player: { id: u.id, pseudo: u.pseudo },
          quantity: quantityOf(u.id, creatureId),
        }))
        .filter((owner) => owner.quantity > 0)
        .sort(
          (a, b) => b.quantity - a.quantity || a.player.pseudo.localeCompare(b.player.pseudo, 'fr'),
        )
      return clone({ creature, items })
    },

    async createTrade(body) {
      await delay()
      const me = currentUser()
      if (body.recipientId === me.id)
        throw problem('TRADE_WITH_SELF', 'Vous ne pouvez pas échanger avec vous-même.')
      const recipient = loadDb().users.find((u) => u.id === body.recipientId && u.role === 'PLAYER')
      if (!recipient) throw problem('NOT_FOUND', 'Ce joueur n’existe pas.')
      const wanted = body.wantedCreatureId ? toSummary(body.wantedCreatureId) : null

      // Un seul échange en cours entre deux joueurs : on rouvre celui qui existe.
      const ids = [me.id, recipient.id]
      const existing = loadDb().trades.find(
        (t) =>
          t.status === 'PENDING' && ids.includes(t.proposer.id) && ids.includes(t.recipient.id),
      )
      if (existing) {
        if (wanted && existing.proposer.id === me.id && existing.wanted?.id !== wanted.id) {
          existing.wanted = wanted
          saveDb()
          notifyRoom(existing.id)
        }
        return clone(existing)
      }

      const trade: Trade = {
        id: uuid(),
        status: 'PENDING',
        proposer: { id: me.id, pseudo: me.pseudo },
        recipient: { id: recipient.id, pseudo: recipient.pseudo },
        offered: [],
        requested: [],
        proposerReady: false,
        recipientReady: false,
        wanted,
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
      sideOf(trade, me.id)
      return clone(trade)
    },

    async refuseTrade(tradeId) {
      await delay()
      const me = currentUser()
      const trade = findTrade(tradeId)
      if (trade.recipient.id !== me.id)
        throw problem('FORBIDDEN', 'Seul le destinataire peut refuser.')
      return close(trade, 'REFUSED')
    },

    async cancelTrade(tradeId) {
      await delay()
      const me = currentUser()
      const trade = findTrade(tradeId)
      if (trade.proposer.id !== me.id) throw problem('FORBIDDEN', 'Seul le proposant peut annuler.')
      return close(trade, 'CANCELLED')
    },

    joinTrade(tradeId, onMessage) {
      let player: PlayerSummary | null = null
      let leave: (() => void) | null = null
      try {
        const me = currentUser()
        player = { id: me.id, pseudo: me.pseudo }
        leave = enterRoom(tradeId, player, onMessage)
        const trade = findTrade(tradeId)
        if (simulatePartner && trade.status === 'PENDING') {
          const partner = trade.proposer.id === me.id ? trade.recipient : trade.proposer
          startPartner(tradeId, partner, now, random)
        }
      } catch (error) {
        // Comme un WebSocket refusé : l'erreur arrive par le canal, pas par une exception.
        if (!(error instanceof ApiError)) throw error
        const { problem: refused } = error
        void delay(40, 140).then(() => onMessage({ type: 'error', problem: refused }))
      }
      return {
        send(message) {
          if (player && leave) act(tradeId, player, message, now)
        },
        close() {
          leave?.()
          leave = null
          if (!hasPlayers(tradeId)) stopPartner(tradeId)
        },
      }
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
