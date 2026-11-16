import { beforeEach, describe, expect, it } from 'vitest'
import { isApiError, type Trade, type TradeServerMessage } from '@creatura/shared/api/types'

import { clearDbCache, DEMO_PASSWORD } from '@/api/mock/db'
import { createMockPlayerApi } from '@/api/mock/server'
import { closeAllRooms } from '@/api/mock/trade-room'
import {
  DEFAULT_CARDS_PER_BOOSTER,
  writeMockBoosterSettings,
} from '@creatura/shared/api/mock-settings'

const MOUSSOU = '0b6f2c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'
const BRUMEL = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a'
const CRISTILLE = '7c8d9e0f-1a2b-4c3d-9e8f-7a6b5c4d3e2f'
const GLANDINET = 'c0ffee00-0001-4000-8000-000000000001'
const VAPELINE = 'c0ffee00-0006-4000-8000-000000000006'
const BRAISARD = 'c0ffee00-0008-4000-8000-000000000008'
const TRADE_LINA_TO_DEMO = 'aaaaaaaa-0001-4000-8000-000000000001'

function setup() {
  let token: string | null = null
  const api = createMockPlayerApi({ getToken: () => token, random: () => 0.5 })
  const loginAs = async (login: string) => {
    token = (await api.login({ login, password: DEMO_PASSWORD })).accessToken
  }
  return { api, loginAs }
}

async function quantity(api: ReturnType<typeof setup>['api'], creatureId: string) {
  const page = await api.getMyCollection({ pageSize: 100 })
  return page.items.find((e) => e.creature.id === creatureId)?.quantity ?? 0
}

/** Laisse passer les messages de la salle (latence simulée nulle en test, mais asynchrone). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

/** Un joueur connecté à une salle d'échange, avec ce qu'il a reçu du serveur. */
async function join(login: string, tradeId: string) {
  const { api, loginAs } = setup()
  await loginAs(login)
  let trade: Trade | null = null
  const errors: string[] = []
  const chat: string[] = []
  const connection = api.joinTrade(tradeId, (message: TradeServerMessage) => {
    if (message.type === 'init') {
      trade = message.trade
      chat.push(...message.messages.map((m) => m.text))
    } else if (message.type === 'trade') trade = message.trade
    else if (message.type === 'chat') chat.push(message.message.text)
    else if (message.type === 'error') errors.push(message.problem.code)
  })
  await settle()
  return {
    api,
    send: connection.send,
    close: connection.close,
    trade: () => trade,
    errors: () => errors,
    chat: () => chat,
  }
}

/** Les deux joueurs de l'échange de démonstration « Lina → Dresseur », tous deux dans la salle. */
async function room(tradeId: string) {
  return { lina: await join('lina', tradeId), demo: await join('demo', tradeId) }
}

/** Ouvre un échange depuis `login` vers le premier joueur dont le pseudo commence par `pseudo`. */
async function openTrade(login: string, pseudo: string) {
  const { api, loginAs } = setup()
  await loginAs(login)
  const other = (await api.searchPlayers({ search: pseudo })).items[0]!
  return (await api.createTrade({ recipientId: other.id })).id
}

beforeEach(() => {
  // Sous Node ≥ 25, `localStorage` peut être indéfini : la base simulée retombe alors en mémoire.
  globalThis.localStorage?.clear()
  document.cookie = 'creatura_mock_booster=; path=/; max-age=0'
  clearDbCache()
  closeAllRooms()
})

describe('API simulée — comptes (UC-01, UC-02)', () => {
  it('crée un compte joueur puis retrouve son profil après reconnexion', async () => {
    const { api, loginAs } = setup()
    const user = await api.register({
      pseudo: 'Nouveau',
      login: 'nouveau',
      password: DEMO_PASSWORD,
    })
    expect(user.role).toBe('PLAYER')
    await loginAs('nouveau')
    const me = await api.getMe()
    expect(me.pseudo).toBe('Nouveau')
    expect(me.boosterAvailableToday).toBe(true)
    expect(me.progress.ownedCreatures).toBe(0)
  })

  it('refuse un identifiant déjà utilisé', async () => {
    const { api } = setup()
    await expect(
      api.register({ pseudo: 'Autre', login: 'demo', password: DEMO_PASSWORD }),
    ).rejects.toSatisfy((e) => isApiError(e, 'LOGIN_ALREADY_USED'))
  })

  it('ne précise pas lequel des identifiants est faux', async () => {
    const { api } = setup()
    await expect(api.login({ login: 'demo', password: 'mauvais' })).rejects.toSatisfy((e) =>
      isApiError(e, 'INVALID_CREDENTIALS'),
    )
  })

  it('exige une session pour consulter la collection', async () => {
    const { api } = setup()
    await expect(api.getMyCollection()).rejects.toSatisfy((e) => isApiError(e, 'UNAUTHENTICATED'))
  })
})

describe('API simulée — booster quotidien (UC-03, UC-04)', () => {
  it('donne un seul booster par jour et ajoute ses cartes à la collection', async () => {
    const { api, loginAs } = setup()
    await loginAs('demo')
    const before = (await api.getMe()).progress.totalCards

    const booster = await api.claimBooster()
    expect(booster.cards).toHaveLength(DEFAULT_CARDS_PER_BOOSTER)
    expect((await api.getMe()).progress.totalCards).toBe(before + DEFAULT_CARDS_PER_BOOSTER)

    const today = await api.getTodayBooster()
    expect(today.available).toBe(false)
    expect(today.booster?.id).toBe(booster.id)

    await expect(api.claimBooster()).rejects.toSatisfy((e) =>
      isApiError(e, 'BOOSTER_ALREADY_CLAIMED'),
    )
    expect((await api.getMe()).progress.totalCards).toBe(before + DEFAULT_CARDS_PER_BOOSTER)
  })

  it('tire le nombre de cartes réglé par l’administrateur', async () => {
    writeMockBoosterSettings({
      cardsPerBooster: 8,
      rarityWeights: { COMMON: 70, UNCOMMON: 20, RARE: 8, LEGENDARY: 2 },
      scheduled: null,
      updatedAt: null,
      updatedBy: null,
    })
    const { api, loginAs } = setup()
    await loginAs('demo')
    expect((await api.getTodayBooster()).cardsPerBooster).toBe(8)
    expect((await api.claimBooster()).cards).toHaveLength(8)
  })
})

describe('API simulée — collection (UC-06, UC-07)', () => {
  it('liste les manques et les doublons', async () => {
    const { api, loginAs } = setup()
    await loginAs('demo')
    const missing = await api.getMyCollection({ ownership: 'missing', pageSize: 100 })
    expect(missing.items.every((e) => e.quantity === 0)).toBe(true)
    const duplicates = await api.getMyCollection({ duplicatesOnly: true, pageSize: 100 })
    expect(duplicates.items.length).toBeGreaterThan(0)
    expect(duplicates.items.every((e) => e.quantity >= 2)).toBe(true)
  })

  it('recherche sans tenir compte des accents ni de la casse', async () => {
    const { api, loginAs } = setup()
    await loginAs('demo')
    const page = await api.getMyCollection({ search: 'AMETH', pageSize: 100 })
    expect(page.items.map((e) => e.creature.name)).toEqual(['Améthine'])
  })
})

describe('API simulée — joueurs et cartes (UC-08)', () => {
  it('rend toutes les cartes d’un joueur échangeables, y compris son dernier exemplaire', async () => {
    const { api, loginAs } = setup()
    await loginAs('demo')
    const lina = (await api.searchPlayers({ search: 'Lina' })).items[0]!
    const cards = await api.getTradeableCards(lina.id)
    expect(cards.items.find((i) => i.creature.id === BRUMEL)?.availableQuantity).toBe(2)
    expect(cards.items.find((i) => i.creature.id === MOUSSOU)?.availableQuantity).toBe(1)
  })

  it('trouve les autres joueurs qui possèdent une carte, les mieux fournis d’abord', async () => {
    const { api, loginAs } = setup()
    await loginAs('demo')
    const owners = await api.listCreatureOwners(MOUSSOU)
    expect(owners.items.map((o) => [o.player.pseudo, o.quantity])).toEqual([
      ['Linette', 2],
      ['Lina_42', 1],
    ])
  })
})

describe('API simulée — salle d’échange (UC-09, UC-10)', () => {
  it('rouvre l’échange en cours au lieu d’en créer un second avec le même joueur', async () => {
    const { api, loginAs } = setup()
    await loginAs('demo')
    const lina = (await api.searchPlayers({ search: 'Lina' })).items[0]!
    const trade = await api.createTrade({ recipientId: lina.id })
    expect(trade.id).toBe(TRADE_LINA_TO_DEMO)
  })

  it('ouvre une salle vide qui retient la carte recherchée', async () => {
    const { api, loginAs } = setup()
    await loginAs('demo')
    const mina = (await api.searchPlayers({ search: 'Mina' })).items[0]!
    const trade = await api.createTrade({ recipientId: mina.id, wantedCreatureId: BRAISARD })
    expect(trade.status).toBe('PENDING')
    expect(trade.offered).toEqual([])
    expect(trade.requested).toEqual([])
    expect(trade.wanted?.id).toBe(BRAISARD)
  })

  it('conclut quand les deux joueurs ont validé, dernier exemplaire compris', async () => {
    const { demo, lina } = await room(TRADE_LINA_TO_DEMO)
    // Lina a déjà posé un Brumel ; Dresseur pose son seul Glandinet et un Moussou.
    demo.send({
      type: 'offer',
      items: [
        { creatureId: GLANDINET, quantity: 1 },
        { creatureId: MOUSSOU, quantity: 1 },
      ],
    })
    await settle()
    lina.send({ type: 'ready', ready: true })
    await settle()
    expect(demo.trade()?.recipientReady).toBe(false)
    expect(demo.trade()?.status).toBe('PENDING')

    demo.send({ type: 'ready', ready: true })
    await settle()
    expect(demo.trade()?.status).toBe('ACCEPTED')
    expect(lina.trade()?.status).toBe('ACCEPTED')

    expect(await quantity(demo.api, GLANDINET)).toBe(0)
    expect(await quantity(demo.api, MOUSSOU)).toBe(2)
    expect(await quantity(demo.api, BRUMEL)).toBe(1)
    expect(await quantity(lina.api, GLANDINET)).toBe(1)
    expect(await quantity(lina.api, MOUSSOU)).toBe(2)
    expect(await quantity(lina.api, BRUMEL)).toBe(1)
  })

  it('retire les deux validations quand un tapis change, et bloque le tapis validé', async () => {
    const { demo, lina } = await room(TRADE_LINA_TO_DEMO)
    demo.send({ type: 'offer', items: [{ creatureId: MOUSSOU, quantity: 1 }] })
    await settle()
    demo.send({ type: 'ready', ready: true })
    await settle()
    expect(lina.trade()?.recipientReady).toBe(true)

    // Dresseur a validé : il doit décocher avant de toucher à son tapis.
    demo.send({ type: 'offer', items: [{ creatureId: MOUSSOU, quantity: 2 }] })
    await settle()
    expect(demo.errors()).toEqual(['VALIDATION_ERROR'])
    expect(lina.errors()).toEqual([])

    // Lina change son tapis : la validation de Dresseur tombe.
    lina.send({ type: 'offer', items: [{ creatureId: VAPELINE, quantity: 1 }] })
    await settle()
    expect(demo.trade()?.recipientReady).toBe(false)
    expect(demo.trade()?.offered.map((i) => i.creature.id)).toEqual([VAPELINE])
  })

  it('refuse de valider tant qu’un tapis est vide', async () => {
    const { demo } = await room(TRADE_LINA_TO_DEMO)
    demo.send({ type: 'ready', ready: true })
    await settle()
    expect(demo.errors()).toEqual(['VALIDATION_ERROR'])
    expect(demo.trade()?.recipientReady).toBe(false)
  })

  it('refuse de poser plus d’exemplaires que le joueur n’en possède', async () => {
    const { demo } = await room(TRADE_LINA_TO_DEMO)
    demo.send({ type: 'offer', items: [{ creatureId: MOUSSOU, quantity: 4 }] })
    await settle()
    expect(demo.errors()).toEqual(['CARDS_NOT_OWNED'])
    expect(demo.trade()?.requested).toEqual([])
  })

  it('ne transfère rien si une carte a disparu entre-temps, et garde l’échange ouvert', async () => {
    const { demo, lina } = await room(TRADE_LINA_TO_DEMO)
    demo.send({ type: 'offer', items: [{ creatureId: MOUSSOU, quantity: 1 }] })
    lina.send({ type: 'offer', items: [{ creatureId: BRUMEL, quantity: 2 }] })
    await settle()
    lina.send({ type: 'ready', ready: true })
    await settle()

    // Pendant ce temps, Lina donne ses deux Brumel à Noe dans un autre échange.
    const noe = await join('noe', await openTrade('noe', 'Lina'))
    const linaWithNoe = await join('lina', noe.trade()!.id)
    linaWithNoe.send({ type: 'offer', items: [{ creatureId: BRUMEL, quantity: 2 }] })
    noe.send({ type: 'offer', items: [{ creatureId: CRISTILLE, quantity: 1 }] })
    await settle()
    linaWithNoe.send({ type: 'ready', ready: true })
    noe.send({ type: 'ready', ready: true })
    await settle()
    expect(noe.trade()?.status).toBe('ACCEPTED')

    const moussou = await quantity(demo.api, MOUSSOU)
    demo.send({ type: 'ready', ready: true })
    await settle()
    expect(demo.trade()?.status).toBe('PENDING')
    expect(demo.trade()?.offered).toEqual([])
    expect(demo.trade()?.proposerReady).toBe(false)
    expect(demo.trade()?.recipientReady).toBe(false)
    expect(demo.errors()).toContain('CARDS_UNAVAILABLE')
    expect(lina.errors()).toContain('CARDS_UNAVAILABLE')
    expect(await quantity(demo.api, MOUSSOU)).toBe(moussou)
  })

  it('diffuse la discussion aux deux joueurs et la garde pour la prochaine visite', async () => {
    const { demo, lina } = await room(TRADE_LINA_TO_DEMO)
    demo.send({ type: 'chat', text: '  Marché conclu si tu ajoutes une Vapeline  ' })
    await settle()
    expect(lina.chat().slice(-1)[0]).toBe('Marché conclu si tu ajoutes une Vapeline')
    demo.close()

    const again = await join('demo', TRADE_LINA_TO_DEMO)
    expect(again.chat().slice(-1)[0]).toBe('Marché conclu si tu ajoutes une Vapeline')
  })

  it('refuse l’entrée aux joueurs étrangers à l’échange', async () => {
    const mina = await join('mina', TRADE_LINA_TO_DEMO)
    expect(mina.errors()).toEqual(['FORBIDDEN'])
    expect(mina.trade()).toBeNull()
  })

  it('ferme la salle quand le destinataire refuse, sans rien transférer', async () => {
    const { demo, lina } = await room(TRADE_LINA_TO_DEMO)
    const brumel = await quantity(demo.api, BRUMEL)
    await demo.api.refuseTrade(TRADE_LINA_TO_DEMO)
    await settle()
    expect(lina.trade()?.status).toBe('REFUSED')
    lina.send({ type: 'chat', text: 'Dommage' })
    await settle()
    expect(lina.errors()).toEqual(['TRADE_NOT_PENDING'])
    expect(await quantity(demo.api, BRUMEL)).toBe(brumel)
    await expect(demo.api.refuseTrade(TRADE_LINA_TO_DEMO)).rejects.toSatisfy((e) =>
      isApiError(e, 'TRADE_NOT_PENDING'),
    )
  })

  it('réserve le refus au destinataire', async () => {
    const { api, loginAs } = setup()
    await loginAs('lina')
    await expect(api.refuseTrade(TRADE_LINA_TO_DEMO)).rejects.toSatisfy((e) =>
      isApiError(e, 'FORBIDDEN'),
    )
  })
})
