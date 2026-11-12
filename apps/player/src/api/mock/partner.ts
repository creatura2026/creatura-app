/**
 * Partenaire SIMULÉ, pour la démonstration uniquement.
 *
 * Sans serveur, l'autre joueur n'est jamais connecté : la salle d'échange resterait vide. Ce module
 * tient donc son rôle dans l'onglet du joueur. Il entre dans la salle, pose une carte, répond à la
 * discussion et valide quand il reçoit au moins autant de cartes qu'il en donne. Il passe par les
 * mêmes règles que le joueur (`act`) et disparaît avec le vrai serveur.
 */
import type {
  PlayerSummary,
  Trade,
  TradeClientMessage,
  TradeMessage,
  TradeServerMessage,
} from '@creatura/shared/api/types'
import { normalize } from '@creatura/shared/api/mock-utils'
import { CREATURES } from '@creatura/shared/fixtures/catalog'

import { loadDb, quantityOf } from './db'
import { act, enterRoom } from './trade-room'

/** Dans les tests, le partenaire répond sans attendre. */
const SPEED = import.meta.env.MODE === 'test' ? 0 : 1

const SMALL_TALK = [
  'Pose tes cartes sur ton tapis, je regarde.',
  'Ça me va si tu valides.',
  'Tu as un doublon à me proposer ?',
]

const partners = new Map<string, () => void>()

const count = (items: Trade['offered']) => items.reduce((sum, item) => sum + item.quantity, 0)

export function startPartner(
  tradeId: string,
  partner: PlayerSummary,
  now: () => Date,
  random: () => number = Math.random,
): void {
  if (partners.has(tradeId)) return

  const timers = new Set<ReturnType<typeof setTimeout>>()
  let leave: (() => void) | null = null
  let trade: Trade | null = null
  let deciding = false
  let lastComplaint = ''
  let chatter = 0

  const later = (min: number, max: number, run: () => void) => {
    const timer = setTimeout(
      () => {
        timers.delete(timer)
        run()
      },
      SPEED * (min + random() * (max - min)),
    )
    timers.add(timer)
  }
  const send = (message: TradeClientMessage) => act(tradeId, partner, message, now)
  const say = (text: string) => send({ type: 'chat', text })

  /** L'échange vu du partenaire : son tapis, celui du joueur, et qui a validé. */
  const view = (t: Trade) => {
    const proposer = t.proposer.id === partner.id
    return {
      cards: proposer ? t.offered : t.requested,
      theirs: proposer ? t.requested : t.offered,
      ready: proposer ? t.proposerReady : t.recipientReady,
      theirReady: proposer ? t.recipientReady : t.proposerReady,
      player: proposer ? t.recipient : t.proposer,
      // Le souhait indiqué à l'ouverture concerne les cartes du destinataire.
      wanted: proposer ? null : (t.wanted ?? null),
    }
  }

  /** Ajoute un exemplaire d'une carte à son tapis (en retirant sa validation s'il le faut). */
  const put = (t: Trade, creatureId: string) => {
    const mine = view(t)
    if (mine.ready) send({ type: 'ready', ready: false })
    send({
      type: 'offer',
      items: [
        ...mine.cards.map((item) => ({ creatureId: item.creature.id, quantity: item.quantity })),
        { creatureId, quantity: 1 },
      ],
    })
  }

  /** Une carte à proposer : de préférence un doublon que le joueur n'a pas encore. */
  const pickCard = (playerId: string) => {
    const owned = Object.entries(loadDb().collections[partner.id] ?? {}).filter(([, q]) => q > 0)
    const score = ([id, q]: [string, number]) =>
      (quantityOf(playerId, id) === 0 ? 2 : 0) + (q >= 2 ? 1 : 0)
    const best = owned.sort((a, b) => score(b) - score(a))[0]
    return best ? CREATURES.find((c) => c.id === best[0]) : undefined
  }

  const greet = (messages: TradeMessage[]) => {
    if (messages.some((m) => m.author.id === partner.id)) return
    later(700, 1300, () => {
      if (trade?.status !== 'PENDING') return
      const mine = view(trade)
      if (mine.wanted && quantityOf(partner.id, mine.wanted.id) > 0) {
        if (!mine.cards.some((item) => item.creature.id === mine.wanted?.id)) {
          put(trade, mine.wanted.id)
        }
        say(`Salut ! Tu cherches ${mine.wanted.name} ? Je pose la carte sur mon tapis.`)
      } else if (!mine.cards.length) {
        const card = pickCard(mine.player.id)
        if (card) {
          put(trade, card.id)
          say(`Salut ! Je peux te proposer ${card.name}.`)
        } else {
          say('Salut ! Je n’ai pas grand-chose à échanger en ce moment.')
        }
      } else {
        say('Salut ! Dis-moi si mon offre te convient.')
      }
    })
  }

  const reply = (text: string) => {
    later(1100, 2000, () => {
      if (trade?.status !== 'PENDING') return
      const said = normalize(text)
      const mine = view(trade)
      const onMat = (items: Trade['offered'], id: string) =>
        items.some((item) => item.creature.id === id)
      const named = CREATURES.filter((c) => said.includes(normalize(c.name)))
      // Une carte que le joueur donne déjà n'est pas une demande : seules les autres comptent.
      const asked = named.filter((c) => !onMat(mine.theirs, c.id))
      const toAdd = asked.find((c) => !onMat(mine.cards, c.id))
      // Toutes les cartes citées sont déjà sur les tapis : l'échange proposé est celui qu'on voit.
      if (named.length && !toAdd) say('Ça me va. Valide quand tu veux.')
      else if (toAdd && quantityOf(partner.id, toAdd.id) === 0) say(`Je n’ai pas ${toAdd.name}.`)
      else if (toAdd) {
        put(trade, toAdd.id)
        say(`D’accord, j’ajoute ${toAdd.name}.`)
      } else if (/\b(merci|super|top|parfait)\b/.test(said)) say('Avec plaisir !')
      else if (/\b(salut|bonjour|bonsoir|coucou|hello)\b/.test(said)) say('Salut !')
      else say(SMALL_TALK[chatter++ % SMALL_TALK.length]!)
    })
  }

  /** Le joueur a validé : le partenaire valide à son tour si l'échange est équilibré. */
  const consider = () => {
    if (deciding || trade?.status !== 'PENDING') return
    const before = view(trade)
    if (!before.theirReady || before.ready) return
    deciding = true
    later(1200, 2200, () => {
      deciding = false
      if (trade?.status !== 'PENDING') return
      const mine = view(trade)
      if (!mine.theirReady || mine.ready) return
      const shortfall = count(mine.cards) - count(mine.theirs)
      if (shortfall <= 0) {
        send({ type: 'ready', ready: true })
        return
      }
      const key = JSON.stringify([trade.offered, trade.requested])
      if (key === lastComplaint) return
      lastComplaint = key
      say(
        shortfall === 1
          ? 'Il me faudrait une carte de plus de ton côté.'
          : `Il me faudrait ${shortfall} cartes de plus de ton côté.`,
      )
    })
  }

  const onMessage = (message: TradeServerMessage) => {
    if (message.type === 'init') {
      trade = message.trade
      greet(message.messages)
      consider()
    } else if (message.type === 'trade') {
      trade = message.trade
      consider()
    } else if (message.type === 'chat' && message.message.author.id !== partner.id) {
      reply(message.message.text)
    }
  }

  // Le partenaire arrive un instant après le joueur.
  later(500, 900, () => {
    leave = enterRoom(tradeId, partner, onMessage, { simulated: true })
  })

  partners.set(tradeId, () => {
    timers.forEach(clearTimeout)
    timers.clear()
    leave?.()
    partners.delete(tradeId)
  })
}

export function stopPartner(tradeId: string): void {
  partners.get(tradeId)?.()
}

/** Pour les tests : arrête tous les partenaires simulés. */
export function stopAllPartners(): void {
  ;[...partners.values()].forEach((stop) => stop())
}
