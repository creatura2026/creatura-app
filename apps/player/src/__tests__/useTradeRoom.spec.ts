import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { Problem, Trade, TradeClientMessage, TradeServerMessage } from '@creatura/shared/api/types'

// La connexion à la salle est remplacée : le test joue le rôle du serveur.
const connection = vi.hoisted(() => ({
  onMessage: null as null | ((message: TradeServerMessage) => void),
  sent: [] as TradeClientMessage[],
  closed: 0,
  joined: [] as string[],
}))
vi.mock('@/api', () => ({
  api: {
    joinTrade: (tradeId: string, onMessage: (message: TradeServerMessage) => void) => {
      connection.joined.push(tradeId)
      connection.onMessage = onMessage
      return {
        send: (message: TradeClientMessage) => connection.sent.push(message),
        close: () => connection.closed++,
      }
    },
  },
}))

import { useTradeRoom, type TradeRoomHooks } from '@/composables/useTradeRoom'

const ALICE = { id: 'alice', pseudo: 'Alice' }
const BOB = { id: 'bob', pseudo: 'Bob' }

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 't1',
    status: 'PENDING',
    proposer: ALICE,
    recipient: BOB,
    offered: [],
    requested: [],
    proposerReady: false,
    recipientReady: false,
    wanted: null,
    createdAt: '2026-11-17T10:00:00Z',
    decidedAt: null,
    ...overrides,
  } as Trade
}

/** Monte un composant qui utilise la salle, et renvoie la salle et le client de requêtes. */
function enter(hooks: TradeRoomHooks = {}) {
  const client = new QueryClient()
  let room!: ReturnType<typeof useTradeRoom>
  const wrapper = mount(
    defineComponent({
      setup() {
        room = useTradeRoom('t1', hooks)
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  )
  const server = (message: TradeServerMessage) => connection.onMessage!(message)
  return { room, client, wrapper, server }
}

beforeEach(() => {
  connection.onMessage = null
  connection.sent = []
  connection.closed = 0
  connection.joined = []
})

describe('salle d’échange côté écran (useTradeRoom)', () => {
  it('entre dans la salle et prend l’état complet envoyé par le serveur (init)', () => {
    const { room, server } = enter()
    expect(connection.joined).toEqual(['t1'])
    expect(room.connected.value).toBe(false)

    server({
      type: 'init',
      trade: trade(),
      messages: [{ id: 'm1', author: BOB, text: 'Salut', sentAt: '2026-11-17T10:01:00Z' }],
      online: ['bob'],
    })

    expect(room.connected.value).toBe(true)
    expect(room.trade.value?.id).toBe('t1')
    expect(room.messages.value.map((m) => m.text)).toEqual(['Salut'])
    expect(room.online.value).toEqual(['bob'])
  })

  it('suit l’échange, la discussion (sans doublon) et la présence', () => {
    const { room, server } = enter()
    server({ type: 'init', trade: trade(), messages: [], online: ['alice'] })

    server({ type: 'trade', trade: trade({ proposerReady: true }) })
    expect(room.trade.value?.proposerReady).toBe(true)

    const message = { id: 'm2', author: ALICE, text: 'Je valide', sentAt: '2026-11-17T10:02:00Z' }
    server({ type: 'chat', message })
    server({ type: 'chat', message })
    expect(room.messages.value).toHaveLength(1)

    server({ type: 'presence', playerId: 'bob', online: true })
    server({ type: 'presence', playerId: 'bob', online: true })
    expect(room.online.value).toEqual(['alice', 'bob'])
    server({ type: 'presence', playerId: 'alice', online: false })
    expect(room.online.value).toEqual(['bob'])
  })

  it('prévient l’écran : échange modifié (avec l’état précédent), message, erreur', () => {
    const onTrade = vi.fn<NonNullable<TradeRoomHooks['onTrade']>>()
    const onMessage = vi.fn<NonNullable<TradeRoomHooks['onMessage']>>()
    const onError = vi.fn<(problem: Problem) => void>()
    const { server } = enter({ onTrade, onMessage, onError })

    server({ type: 'init', trade: trade(), messages: [], online: [] })
    server({ type: 'trade', trade: trade({ status: 'CANCELLED' }) })
    expect(onTrade).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'CANCELLED' }),
      expect.objectContaining({ status: 'PENDING' }),
    )

    server({ type: 'chat', message: { id: 'm3', author: BOB, text: 'Tant pis', sentAt: '2026-11-17T10:03:00Z' } })
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ text: 'Tant pis' }))

    const problem = { type: 'about:blank', title: 'Indisponible', status: 409, code: 'CARDS_UNAVAILABLE' } as Problem
    server({ type: 'error', problem })
    expect(onError).toHaveBeenCalledWith(problem)
  })

  it('un échange conclu rafraîchit la collection et les échanges', () => {
    const { client, server } = enter()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    server({ type: 'init', trade: trade(), messages: [], online: [] })

    server({ type: 'trade', trade: trade({ status: 'ACCEPTED' }) })

    const keys = invalidate.mock.calls.map(([filters]) =>
      JSON.stringify(typeof filters === 'function' ? filters().queryKey : filters?.queryKey),
    )
    expect(keys).toEqual(expect.arrayContaining(['["collection"]', '["trades"]']))
  })

  it('envoie le tapis, la validation et les messages au serveur', () => {
    const { room } = enter()

    room.setOffer([{ creatureId: 'moussou', quantity: 2 }])
    room.setReady(true)
    room.say('Ça marche')

    expect(connection.sent).toEqual([
      { type: 'offer', items: [{ creatureId: 'moussou', quantity: 2 }] },
      { type: 'ready', ready: true },
      { type: 'chat', text: 'Ça marche' },
    ])
  })

  it('quitte la salle quand l’écran disparaît', () => {
    const { wrapper } = enter()
    wrapper.unmount()
    expect(connection.closed).toBe(1)
  })
})
