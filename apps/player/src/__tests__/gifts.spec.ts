import { beforeEach, describe, expect, it } from 'vitest'
import { isApiError } from '@creatura/shared/api/types'

import { clearDbCache, DEMO_PASSWORD } from '@/api/mock/db'
import { createMockPlayerApi } from '@/api/mock/server'
import { closeAllRooms } from '@/api/mock/trade-room'

// Données de démonstration (apps/player/src/api/mock/db.ts) : Dresseur a un seul Glandinet.
const GLANDINET = 'c0ffee00-0001-4000-8000-000000000001'
const MOUSSOU = '0b6f2c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'
const DRESSEUR = '11111111-1111-4111-8111-111111111111'
const LINA = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const NOE = '22222222-2222-4222-8222-222222222222'

/** Un joueur connecté à l'API simulée (tous partagent la même « base »). */
async function as(login: string) {
  let token: string | null = null
  const api = createMockPlayerApi({ getToken: () => token, random: () => 0.5 })
  token = (await api.login({ login, password: DEMO_PASSWORD })).accessToken
  const quantity = async (creatureId: string) =>
    (await api.getMyCollection({ pageSize: 100 })).items.find((e) => e.creature.id === creatureId)
      ?.quantity ?? 0
  return { api, quantity }
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (isApiError(error)) return error.code
    throw error
  }
  throw new Error('la promesse aurait dû être refusée')
}

beforeEach(() => {
  globalThis.localStorage?.clear()
  clearDbCache()
  closeAllRooms()
})

describe('API simulée — dons de carte', () => {
  it('le destinataire accepte : la carte change de collection, dernier exemplaire compris', async () => {
    const dresseur = await as('demo')
    const gift = await dresseur.api.createGift({ recipientId: LINA, creatureId: GLANDINET })
    expect(gift).toMatchObject({ status: 'PENDING', quantity: 1 })
    // Rien ne bouge tant que le don n'est pas accepté.
    expect(await dresseur.quantity(GLANDINET)).toBe(1)

    const lina = await as('lina')
    const accepted = await lina.api.acceptGift(gift.id)

    expect(accepted.status).toBe('ACCEPTED')
    expect(await lina.quantity(GLANDINET)).toBe(1)
    expect(await dresseur.quantity(GLANDINET)).toBe(0)
  })

  it('le destinataire refuse : rien ne bouge', async () => {
    const dresseur = await as('demo')
    const gift = await dresseur.api.createGift({ recipientId: LINA, creatureId: GLANDINET })

    const refused = await (await as('lina')).api.refuseGift(gift.id)

    expect(refused.status).toBe('REFUSED')
    expect(await dresseur.quantity(GLANDINET)).toBe(1)
  })

  it('le donneur annule tant que le don est en attente ; après, plus rien ne se décide', async () => {
    const dresseur = await as('demo')
    const gift = await dresseur.api.createGift({ recipientId: LINA, creatureId: GLANDINET })

    expect((await dresseur.api.cancelGift(gift.id)).status).toBe('CANCELLED')
    expect(await rejection((await as('lina')).api.acceptGift(gift.id))).toBe('GIFT_NOT_PENDING')
  })

  it('chacun son rôle : seul le destinataire décide, seul le donneur annule', async () => {
    const dresseur = await as('demo')
    const gift = await dresseur.api.createGift({ recipientId: LINA, creatureId: GLANDINET })

    expect(await rejection(dresseur.api.acceptGift(gift.id))).toBe('FORBIDDEN')
    expect(await rejection((await as('lina')).api.cancelGift(gift.id))).toBe('FORBIDDEN')
    expect(await rejection((await as('noe')).api.refuseGift(gift.id))).toBe('FORBIDDEN')
  })

  it('le don échoue si la carte est partie entre-temps, sans rien transférer', async () => {
    const dresseur = await as('demo')
    const toLina = await dresseur.api.createGift({ recipientId: LINA, creatureId: GLANDINET })
    const toNoe = await dresseur.api.createGift({ recipientId: NOE, creatureId: GLANDINET })
    await (await as('lina')).api.acceptGift(toLina.id)

    const noe = await as('noe')
    const failed = await noe.api.acceptGift(toNoe.id)

    expect(failed).toMatchObject({ status: 'FAILED', failureReason: 'CARDS_UNAVAILABLE' })
    expect(await noe.quantity(GLANDINET)).toBe(0)
  })

  it('refuse les dons impossibles', async () => {
    const dresseur = await as('demo')

    expect(await rejection(dresseur.api.createGift({ recipientId: DRESSEUR, creatureId: GLANDINET }))).toBe(
      'GIFT_WITH_SELF',
    )
    expect(
      await rejection(dresseur.api.createGift({ recipientId: LINA, creatureId: GLANDINET, quantity: 2 })),
    ).toBe('VALIDATION_ERROR')
    expect(
      await rejection(dresseur.api.createGift({ recipientId: 'joueur-inconnu', creatureId: GLANDINET })),
    ).toBe('NOT_FOUND')

    await dresseur.api.createGift({ recipientId: LINA, creatureId: MOUSSOU })
    expect(await rejection(dresseur.api.createGift({ recipientId: LINA, creatureId: MOUSSOU }))).toBe(
      'GIFT_ALREADY_PENDING',
    )
  })

  it('liste les dons offerts et reçus, du plus récent au plus ancien', async () => {
    const dresseur = await as('demo')
    await dresseur.api.createGift({ recipientId: LINA, creatureId: GLANDINET })
    await dresseur.api.createGift({ recipientId: NOE, creatureId: MOUSSOU })

    const sent = await dresseur.api.listMyGifts({ role: 'sent' })
    expect(sent.items.map((g) => g.recipient.id).sort()).toEqual([LINA, NOE].sort())
    expect((await dresseur.api.listMyGifts({ role: 'received' })).items).toHaveLength(0)

    const lina = await as('lina')
    const received = await lina.api.listMyGifts({ role: 'received' })
    expect(received.items).toHaveLength(1)
    expect(received.items[0]).toMatchObject({ giver: { id: DRESSEUR }, creature: { id: GLANDINET } })
  })
})
