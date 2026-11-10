import { beforeEach, describe, expect, it } from 'vitest'
import { isApiError } from '@creatura/shared/api/types'

import { clearDbCache, DEMO_PASSWORD } from '@/api/mock/db'
import { CARDS_PER_BOOSTER, createMockPlayerApi } from '@/api/mock/server'

const MOUSSOU = '0b6f2c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'
const BRUMEL = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a'
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

beforeEach(() => {
  // Sous Node ≥ 25, `localStorage` peut être indéfini : la base simulée retombe alors en mémoire.
  globalThis.localStorage?.clear()
  clearDbCache()
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
    expect(booster.cards).toHaveLength(CARDS_PER_BOOSTER)
    expect((await api.getMe()).progress.totalCards).toBe(before + CARDS_PER_BOOSTER)

    const today = await api.getTodayBooster()
    expect(today.available).toBe(false)
    expect(today.booster?.id).toBe(booster.id)

    await expect(api.claimBooster()).rejects.toSatisfy((e) =>
      isApiError(e, 'BOOSTER_ALREADY_CLAIMED'),
    )
    expect((await api.getMe()).progress.totalCards).toBe(before + CARDS_PER_BOOSTER)
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

describe('API simulée — échanges (UC-08 à UC-11)', () => {
  it('transfère les cartes dans les deux sens à l’acceptation', async () => {
    const { api, loginAs } = setup()
    await loginAs('demo')
    const moussou = await quantity(api, MOUSSOU)
    const brumel = await quantity(api, BRUMEL)

    const trade = await api.acceptTrade(TRADE_LINA_TO_DEMO)
    expect(trade.status).toBe('ACCEPTED')
    expect(await quantity(api, MOUSSOU)).toBe(moussou - 1)
    expect(await quantity(api, BRUMEL)).toBe(brumel + 1)

    await expect(api.acceptTrade(TRADE_LINA_TO_DEMO)).rejects.toSatisfy((e) =>
      isApiError(e, 'TRADE_NOT_PENDING'),
    )
  })

  it('ne transfère rien si une carte n’est plus disponible (échange FAILED)', async () => {
    const { api, loginAs } = setup()
    // Lina donne ses Brumel en trop à Noe, puis Dresseur tente d'accepter l'échange avec Lina.
    await loginAs('lina')
    const noe = (await api.searchPlayers({ search: 'Noe' })).items[0]!
    const toNoe = await api.createTrade({
      recipientId: noe.id,
      offered: [{ creatureId: BRUMEL, quantity: 2 }],
      requested: [{ creatureId: '7c8d9e0f-1a2b-4c3d-9e8f-7a6b5c4d3e2f', quantity: 1 }],
    })
    await loginAs('noe')
    await api.acceptTrade(toNoe.id)

    await loginAs('demo')
    const moussou = await quantity(api, MOUSSOU)
    await expect(api.acceptTrade(TRADE_LINA_TO_DEMO)).rejects.toSatisfy((e) =>
      isApiError(e, 'CARDS_UNAVAILABLE'),
    )
    expect((await api.getTrade(TRADE_LINA_TO_DEMO)).status).toBe('FAILED')
    expect(await quantity(api, MOUSSOU)).toBe(moussou)
    expect(await quantity(api, BRUMEL)).toBe(0)
  })

  it('réserve la décision au destinataire', async () => {
    const { api, loginAs } = setup()
    await loginAs('lina')
    await expect(api.acceptTrade(TRADE_LINA_TO_DEMO)).rejects.toSatisfy((e) =>
      isApiError(e, 'FORBIDDEN'),
    )
  })

  it('n’expose que les doublons d’un autre joueur, en lui laissant un exemplaire', async () => {
    const { api, loginAs } = setup()
    await loginAs('demo')
    const lina = (await api.searchPlayers({ search: 'Lina' })).items[0]!
    const cards = await api.getTradeableCards(lina.id)
    expect(cards.items.find((i) => i.creature.id === BRUMEL)?.availableQuantity).toBe(1)
    expect(cards.items.some((i) => i.creature.id === MOUSSOU)).toBe(false)
  })
})
