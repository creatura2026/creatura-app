/**
 * Salle d'échange SIMULÉE : ce que fera le serveur derrière le WebSocket `/trades/{tradeId}/live`.
 *
 * Les règles sont celles du contrat :
 *  - un joueur ne modifie que son tapis, et seulement tant qu'il n'a pas validé ;
 *  - toute modification d'un tapis retire les deux validations : on ne valide que ce que l'on voit ;
 *  - on ne valide que s'il y a au moins une carte sur chaque tapis ;
 *  - quand le second joueur valide, tout est revérifié puis transféré d'un seul coup.
 *
 * Les « connexions » sont de simples fonctions d'écoute gardées en mémoire. Elles ne relient que les
 * joueurs de cet onglet : le joueur connecté et, en démonstration, son partenaire simulé.
 */
import {
  ApiError,
  type PlayerSummary,
  type Trade,
  type TradeClientMessage,
  type TradeItem,
  type TradeItemInput,
  type TradeMessage,
  type TradeServerMessage,
} from '@creatura/shared/api/types'
import { clone, delay, problem, uuid } from '@creatura/shared/api/mock-utils'

import { addCards, loadDb, quantityOf, saveDb, toSummary } from './db'

export type RoomListener = (message: TradeServerMessage) => void

type Side = 'proposer' | 'recipient'

interface Seat {
  playerId: string
  listener: RoomListener
  /** Partenaire simulé : il ne compte pas comme un vrai joueur présent. */
  simulated: boolean
  open: boolean
  /** File d'envoi : les messages arrivent dans l'ordre, après une petite latence. */
  queue: Promise<void>
}

const rooms = new Map<string, Set<Seat>>()

/** Limites du contrat. */
const MAX_STACKS = 10
const MAX_MESSAGE_LENGTH = 500
/** La démonstration ne garde que les derniers messages d'une discussion. */
const MAX_MESSAGES = 200

// ── Lecture de l'échange ─────────────────────────────────────────────────────

export function findTrade(tradeId: string): Trade {
  const trade = loadDb().trades.find((t) => t.id === tradeId)
  if (!trade) throw problem('NOT_FOUND', 'Cet échange n’existe pas.')
  return trade
}

/** De quel côté du tapis le joueur est assis ; refuse un joueur étranger à l'échange. */
export function sideOf(trade: Trade, playerId: string): Side {
  if (trade.proposer.id === playerId) return 'proposer'
  if (trade.recipient.id === playerId) return 'recipient'
  throw problem('FORBIDDEN', 'Cet échange ne vous concerne pas.')
}

const matOf = (trade: Trade, side: Side) => (side === 'proposer' ? trade.offered : trade.requested)
const playerOf = (trade: Trade, side: Side) =>
  side === 'proposer' ? trade.proposer : trade.recipient

function requirePending(trade: Trade): void {
  if (trade.status !== 'PENDING') throw problem('TRADE_NOT_PENDING', 'Cet échange est terminé.')
}

function clearValidations(trade: Trade): void {
  trade.proposerReady = false
  trade.recipientReady = false
}

// ── Règles ───────────────────────────────────────────────────────────────────

/** Remplace le tapis d'un joueur. Les deux validations tombent : l'échange n'est plus le même. */
function setOffer(trade: Trade, playerId: string, inputs: TradeItemInput[]): void {
  const side = sideOf(trade, playerId)
  requirePending(trade)
  if (side === 'proposer' ? trade.proposerReady : trade.recipientReady) {
    throw problem('VALIDATION_ERROR', 'Retirez votre validation pour modifier vos cartes.')
  }

  // Une seule ligne par créature, dans l'ordre où le joueur a posé ses cartes.
  const quantities = new Map<string, number>()
  for (const { creatureId, quantity } of inputs) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw problem('VALIDATION_ERROR', 'Quantité invalide.')
    }
    quantities.set(creatureId, (quantities.get(creatureId) ?? 0) + quantity)
  }
  if (quantities.size > MAX_STACKS) {
    throw problem('VALIDATION_ERROR', `Pas plus de ${MAX_STACKS} cartes différentes par tapis.`)
  }
  const items: TradeItem[] = [...quantities].map(([id, quantity]) => ({
    creature: toSummary(id),
    quantity,
  }))
  const missing = items.find((i) => quantityOf(playerId, i.creature.id) < i.quantity)
  if (missing) {
    throw problem(
      'CARDS_NOT_OWNED',
      `Vous n’avez pas assez d’exemplaires de ${missing.creature.name}.`,
    )
  }

  if (side === 'proposer') trade.offered = items
  else trade.requested = items
  clearValidations(trade)
}

/** Retire d'un tapis ce que son joueur ne possède plus. Renvoie vrai si le tapis a changé. */
function trimMat(trade: Trade, side: Side): boolean {
  const owner = playerOf(trade, side).id
  const kept = matOf(trade, side)
    .map((item) => ({
      ...item,
      quantity: Math.min(item.quantity, quantityOf(owner, item.creature.id)),
    }))
    .filter((item) => item.quantity > 0)
  const changed = JSON.stringify(kept) !== JSON.stringify(matOf(trade, side))
  if (side === 'proposer') trade.offered = kept
  else trade.requested = kept
  return changed
}

type ReadyOutcome = 'updated' | 'concluded' | 'unavailable'

/**
 * Valide l'échange tel qu'il est, ou retire sa validation. Quand les deux joueurs ont validé, les
 * cartes changent de collection d'un seul coup. Si une carte posée n'est plus possédée, elle est
 * retirée du tapis et personne n'a validé : l'échange reste ouvert.
 */
function setReady(trade: Trade, playerId: string, ready: boolean, now: () => Date): ReadyOutcome {
  const side = sideOf(trade, playerId)
  requirePending(trade)
  if (!ready) {
    if (side === 'proposer') trade.proposerReady = false
    else trade.recipientReady = false
    return 'updated'
  }
  if (!trade.offered.length || !trade.requested.length) {
    throw problem('VALIDATION_ERROR', 'Il faut au moins une carte sur chaque tapis.')
  }

  // Pas de court-circuit : les deux tapis sont vérifiés à chaque validation.
  const trimmed = [trimMat(trade, 'proposer'), trimMat(trade, 'recipient')].some(Boolean)
  if (trimmed) {
    clearValidations(trade)
    return 'unavailable'
  }

  if (side === 'proposer') trade.proposerReady = true
  else trade.recipientReady = true
  if (!trade.proposerReady || !trade.recipientReady) return 'updated'

  // Les deux joueurs ont validé : transfert dans les deux sens, tout ou rien.
  for (const item of trade.offered) {
    addCards(trade.proposer.id, item.creature.id, -item.quantity)
    addCards(trade.recipient.id, item.creature.id, item.quantity)
  }
  for (const item of trade.requested) {
    addCards(trade.recipient.id, item.creature.id, -item.quantity)
    addCards(trade.proposer.id, item.creature.id, item.quantity)
  }
  trade.status = 'ACCEPTED'
  trade.decidedAt = now().toISOString()
  return 'concluded'
}

function say(trade: Trade, author: PlayerSummary, text: string, now: () => Date): TradeMessage {
  sideOf(trade, author.id)
  if (trade.status !== 'PENDING') {
    throw problem('TRADE_NOT_PENDING', 'L’échange est terminé : la discussion est fermée.')
  }
  const clean = text.trim()
  if (!clean || clean.length > MAX_MESSAGE_LENGTH) {
    throw problem(
      'VALIDATION_ERROR',
      `Un message contient entre 1 et ${MAX_MESSAGE_LENGTH} caractères.`,
    )
  }
  const message: TradeMessage = {
    id: uuid(),
    author: { id: author.id, pseudo: author.pseudo },
    text: clean,
    sentAt: now().toISOString(),
  }
  const db = loadDb()
  const discussion = (db.messages[trade.id] ??= [])
  discussion.push(message)
  if (discussion.length > MAX_MESSAGES) discussion.splice(0, discussion.length - MAX_MESSAGES)
  return message
}

// ── Diffusion ────────────────────────────────────────────────────────────────

function deliver(seat: Seat, message: TradeServerMessage): void {
  const copy = clone(message)
  seat.queue = seat.queue
    .then(() => delay(40, 140))
    .then(() => {
      if (seat.open) seat.listener(copy)
    })
}

function broadcast(tradeId: string, message: TradeServerMessage): void {
  rooms.get(tradeId)?.forEach((seat) => deliver(seat, message))
}

function present(tradeId: string): string[] {
  return [...new Set([...(rooms.get(tradeId) ?? [])].map((seat) => seat.playerId))]
}

/** Un vrai joueur (pas le partenaire simulé) est-il encore dans la salle ? */
export function hasPlayers(tradeId: string): boolean {
  return [...(rooms.get(tradeId) ?? [])].some((seat) => !seat.simulated)
}

/** Prévient la salle que l'échange a changé en dehors d'elle (refus, annulation). */
export function notifyRoom(tradeId: string): void {
  broadcast(tradeId, { type: 'trade', trade: findTrade(tradeId) })
}

/**
 * Entre dans la salle : `init` arrive juste après, puis chaque événement.
 * Renvoie la fonction qui en fait sortir.
 */
export function enterRoom(
  tradeId: string,
  player: PlayerSummary,
  listener: RoomListener,
  { simulated = false }: { simulated?: boolean } = {},
): () => void {
  const trade = findTrade(tradeId)
  sideOf(trade, player.id)

  const seats = rooms.get(tradeId) ?? new Set<Seat>()
  rooms.set(tradeId, seats)
  const alreadyThere = present(tradeId).includes(player.id)
  const seat: Seat = {
    playerId: player.id,
    listener,
    simulated,
    open: true,
    queue: Promise.resolve(),
  }
  seats.add(seat)

  deliver(seat, {
    type: 'init',
    trade,
    messages: loadDb().messages[tradeId] ?? [],
    online: present(tradeId),
  })
  if (!alreadyThere) {
    seats.forEach((other) => {
      if (other !== seat) deliver(other, { type: 'presence', playerId: player.id, online: true })
    })
  }

  return () => {
    if (!seat.open) return
    seat.open = false
    seats.delete(seat)
    if (!present(tradeId).includes(player.id)) {
      broadcast(tradeId, { type: 'presence', playerId: player.id, online: false })
    }
    if (!seats.size) rooms.delete(tradeId)
  }
}

/**
 * Applique l'action d'un joueur et prévient la salle. Une action refusée ne revient qu'à son
 * auteur, sous la forme d'un message `error`.
 */
export function act(
  tradeId: string,
  player: PlayerSummary,
  message: TradeClientMessage,
  now: () => Date,
): void {
  try {
    const trade = findTrade(tradeId)
    if (message.type === 'chat') {
      const sent = say(trade, player, message.text, now)
      saveDb()
      broadcast(tradeId, { type: 'chat', message: sent })
      return
    }
    let outcome: ReadyOutcome = 'updated'
    if (message.type === 'offer') setOffer(trade, player.id, message.items)
    else outcome = setReady(trade, player.id, message.ready, now)
    saveDb()
    broadcast(tradeId, { type: 'trade', trade })
    if (outcome === 'unavailable') {
      broadcast(tradeId, {
        type: 'error',
        problem: problem(
          'CARDS_UNAVAILABLE',
          'Une carte posée n’est plus disponible : elle a été retirée du tapis. Vérifiez l’échange avant de valider.',
        ).problem,
      })
    }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    rooms.get(tradeId)?.forEach((seat) => {
      if (seat.playerId === player.id) deliver(seat, { type: 'error', problem: error.problem })
    })
  }
}

/** Pour les tests : vide toutes les salles. */
export function closeAllRooms(): void {
  rooms.forEach((seats) => seats.forEach((seat) => (seat.open = false)))
  rooms.clear()
}
