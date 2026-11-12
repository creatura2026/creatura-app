/** Un échange vu du joueur connecté : son tapis, celui de l'autre joueur, et qui a validé. */
import type { PlayerSummary, Trade, TradeItem } from '@creatura/shared/api/types'

export interface TradeSeat {
  player: PlayerSummary
  /** Les cartes que ce joueur donne. */
  cards: TradeItem[]
  /** Ce joueur a validé l'échange tel qu'il est. */
  ready: boolean
}

export interface TradeSeats {
  mine: TradeSeat
  theirs: TradeSeat
  /** Le joueur connecté a ouvert l'échange. */
  iAmProposer: boolean
}

export function seatsOf(trade: Trade, meId: string): TradeSeats {
  const proposer: TradeSeat = {
    player: trade.proposer,
    cards: trade.offered,
    ready: trade.proposerReady,
  }
  const recipient: TradeSeat = {
    player: trade.recipient,
    cards: trade.requested,
    ready: trade.recipientReady,
  }
  const iAmProposer = trade.proposer.id === meId
  return {
    mine: iAmProposer ? proposer : recipient,
    theirs: iAmProposer ? recipient : proposer,
    iAmProposer,
  }
}

/**
 * L'échange attend-il une action du joueur connecté ? Oui si l'autre joueur a validé et pas lui,
 * ou s'il vient d'être invité et n'a encore rien posé.
 */
export function awaitsMe(trade: Trade, meId: string): boolean {
  if (trade.status !== 'PENDING') return false
  const { mine, theirs, iAmProposer } = seatsOf(trade, meId)
  if (mine.ready) return false
  return theirs.ready || (!iAmProposer && mine.cards.length === 0)
}

export const cardCount = (items: TradeItem[]) => items.reduce((sum, item) => sum + item.quantity, 0)
