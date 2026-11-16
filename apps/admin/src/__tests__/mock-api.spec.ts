import { describe, expect, it } from 'vitest'
import { isApiError } from '@creatura/shared/api/types'
import { addDays, parisToday } from '@creatura/shared/format'

import { createMockAdminApi, DEMO_ACCOUNTS } from '@/api/mock'

function setup() {
  let token: string | null = null
  const api = createMockAdminApi(() => token)
  const loginAs = async (account: keyof typeof DEMO_ACCOUNTS) => {
    token = (await api.login(DEMO_ACCOUNTS[account])).accessToken
  }
  return { api, loginAs }
}

describe('API d’administration simulée', () => {
  it('refuse l’accès administrateur à un joueur (preuve qualité 02)', async () => {
    const { api, loginAs } = setup()
    await loginAs('player')
    await expect(api.getAdminStats()).rejects.toSatisfy((e) => isApiError(e, 'FORBIDDEN'))
    await expect(api.listAdminTrades()).rejects.toSatisfy((e) => isApiError(e, 'FORBIDDEN'))
    await expect(api.getRarityDistribution()).rejects.toSatisfy((e) => isApiError(e, 'FORBIDDEN'))
  })

  it('exige une session', async () => {
    const { api } = setup()
    await expect(api.getAdminStats()).rejects.toSatisfy((e) => isApiError(e, 'UNAUTHENTICATED'))
  })

  it('renvoie un point par jour de la période, jours sans activité compris (UC-12)', async () => {
    const { api, loginAs } = setup()
    await loginAs('admin')
    const to = parisToday()
    const stats = await api.getAdminStats({ from: addDays(to, -6), to })
    expect(stats.boostersOpenedPerDay).toHaveLength(7)
    expect(stats.completedTrades.perDay).toHaveLength(7)
    expect(stats.completedTrades.inPeriod).toBe(
      stats.completedTrades.perDay.reduce((a, b) => a + b.count, 0),
    )
  })

  it('filtre les échanges par état et par joueur (UC-13)', async () => {
    const { api, loginAs } = setup()
    await loginAs('admin')
    const player = (await api.searchPlayers({ search: 'Lina' })).items[0]!
    const page = await api.listAdminTrades({
      status: 'ACCEPTED',
      playerId: player.id,
      pageSize: 100,
    })
    expect(page.items.every((t) => t.status === 'ACCEPTED')).toBe(true)
    expect(
      page.items.every((t) => t.proposer.id === player.id || t.recipient.id === player.id),
    ).toBe(true)
  })

  it('compare la répartition observée aux probabilités (UC-14)', async () => {
    const { api, loginAs } = setup()
    await loginAs('admin')
    const dist = await api.getRarityDistribution()
    const sum = dist.items.reduce((a, b) => a + b.observedRate, 0)
    expect(sum).toBeCloseTo(1, 5)
    expect(dist.items.reduce((a, b) => a + b.observedCount, 0)).toBe(dist.totalCardsDistributed)
  })

  it('rejette une période inversée', async () => {
    const { api, loginAs } = setup()
    await loginAs('admin')
    await expect(api.getAdminStats({ from: '2026-11-10', to: '2026-11-01' })).rejects.toSatisfy(
      (e) => isApiError(e, 'VALIDATION_ERROR'),
    )
  })
})

describe('Réglage des boosters (simulé)', () => {
  it('enregistre le nombre de cartes pour le prochain minuit', async () => {
    const { api, loginAs } = setup()
    await loginAs('admin')
    const before = (await api.getBoosterSettings()).cardsPerBooster
    const saved = await api.updateBoosterSettings({ cardsPerBooster: 7 })
    expect(saved.cardsPerBooster).toBe(before) // inchangé jusqu'à minuit
    expect(saved.scheduled?.cardsPerBooster).toBe(7)
    expect(saved.updatedBy?.pseudo).toBe('Admin')
    expect((await api.getBoosterSettings()).scheduled?.cardsPerBooster).toBe(7)
  })

  it('ajoute une carte en édition limitée, visible au prochain minuit', async () => {
    const { api, loginAs } = setup()
    await loginAs('admin')
    const card = await api.createAdminCreature({
      name: 'Pixelion',
      family: 'LUEUR',
      rarity: 'LEGENDARY',
      image: 'sprites/eye_orb_2.png',
      stock: 3,
    })
    expect(card.stockTotal).toBe(3)
    expect(card.availableFrom > new Date().toISOString().slice(0, 10)).toBe(true)
    await expect(
      api.createAdminCreature({ name: 'X', family: 'LUEUR', rarity: 'LEGENDARY', image: 'sprites/x.png' }),
    ).rejects.toSatisfy((e) => isApiError(e, 'VALIDATION_ERROR'))
  })

  it('refuse une valeur hors limites', async () => {
    const { api, loginAs } = setup()
    await loginAs('admin')
    for (const n of [0, 2, 11, 2.5]) {
      await expect(api.updateBoosterSettings({ cardsPerBooster: n })).rejects.toSatisfy((e) =>
        isApiError(e, 'VALIDATION_ERROR'),
      )
    }
  })

  it('réserve le réglage au rôle administrateur', async () => {
    const { api, loginAs } = setup()
    await loginAs('player')
    await expect(api.updateBoosterSettings({ cardsPerBooster: 3 })).rejects.toSatisfy((e) =>
      isApiError(e, 'FORBIDDEN'),
    )
  })
})
