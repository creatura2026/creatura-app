import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { clone, normalize, paginate, problem, seededRandom } from '../api/mock-utils'
import {
  DEFAULT_CARDS_PER_BOOSTER,
  readMockBoosterSettings,
  writeMockBoosterSettings,
} from '../api/mock-settings'
import { ApiError, errorMessage, isApiError } from '../api/types'
import { useDebounced } from '../composables'
import { familyTint } from '../family'
import { rarityColor } from '../rarity'
import { createSessionStorage } from '../session'
import { dismissToast, toast, toasts } from '../toast'

describe('API simulée : outils', () => {
  it('compare sans accents ni casse, comme le paramètre search du contrat', () => {
    expect(normalize('Améthine')).toBe('amethine')
    expect(normalize('ÉCLAT')).toBe(normalize('éclat'))
  })

  it('découpe en pages et borne la taille de page', () => {
    const all = Array.from({ length: 45 }, (_, i) => i)
    expect(paginate(all, 2, 20)).toMatchObject({ items: all.slice(20, 40), totalPages: 3, totalItems: 45 })
    expect(paginate(all, 1, 500).pageSize).toBe(100)
    expect(paginate(all, 0, 0)).toMatchObject({ pageSize: 1, items: [0] })
    expect(paginate([], 1, 20)).toMatchObject({ items: [], totalPages: 0 })
  })

  it('fabrique une erreur au format du contrat (Problem)', () => {
    const error = problem('LOGIN_ALREADY_USED', 'Cet identifiant est déjà utilisé.', {
      errors: [{ field: 'login', message: 'Cet identifiant est déjà utilisé.' }],
    })
    expect(error).toBeInstanceOf(ApiError)
    expect(error.problem).toMatchObject({
      code: 'LOGIN_ALREADY_USED',
      status: 409,
      type: 'https://app.creatura.fr/problems/login-already-used',
    })
    expect(isApiError(error, 'LOGIN_ALREADY_USED')).toBe(true)
    expect(isApiError(error, 'NOT_FOUND')).toBe(false)
    expect(errorMessage(error)).toBe('Cet identifiant est déjà utilisé.')
  })

  it('donne un message lisible pour toute erreur', () => {
    expect(errorMessage(new Error('Réseau coupé'))).toBe('Réseau coupé')
    expect(errorMessage('???')).toBe('Une erreur inattendue est survenue.')
  })

  it('copie en profondeur, sans référence partagée', () => {
    const source = { cards: [{ name: 'Moussou' }] }
    const copy = clone(source)
    copy.cards[0]!.name = 'Brumel'
    expect(source.cards[0]!.name).toBe('Moussou')
  })

  it('le hasard « à graine » rejoue la même suite', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true)
    expect(seededRandom(43)()).not.toBe(first[0])
  })
})

describe('réglage des boosters partagé par cookie (API simulée)', () => {
  beforeEach(() => {
    document.cookie = 'creatura_mock_booster=; path=/; max-age=0'
  })

  it('vaut le réglage par défaut sans cookie, ou avec un cookie invalide', () => {
    expect(readMockBoosterSettings().cardsPerBooster).toBe(DEFAULT_CARDS_PER_BOOSTER)
    writeMockBoosterSettings({ ...readMockBoosterSettings(), cardsPerBooster: 99 })
    expect(readMockBoosterSettings().cardsPerBooster).toBe(DEFAULT_CARDS_PER_BOOSTER)
  })

  it('applique un réglage prévu une fois son jour arrivé', () => {
    const current = readMockBoosterSettings()
    writeMockBoosterSettings({
      ...current,
      scheduled: { cardsPerBooster: 7, rarityWeights: current.rarityWeights, effectiveFrom: '2000-01-01' },
    })
    const applied = readMockBoosterSettings()
    expect(applied.cardsPerBooster).toBe(7)
    expect(applied.scheduled).toBeNull()
  })

  it('garde un réglage prévu pour plus tard', () => {
    const current = readMockBoosterSettings()
    writeMockBoosterSettings({
      ...current,
      scheduled: { cardsPerBooster: 8, rarityWeights: current.rarityWeights, effectiveFrom: '2999-01-01' },
    })
    expect(readMockBoosterSettings()).toMatchObject({ cardsPerBooster: DEFAULT_CARDS_PER_BOOSTER, scheduled: { cardsPerBooster: 8 } })
  })
})

describe('session', () => {
  beforeEach(() => localStorage.clear())

  it('garde les jetons et la durée d’inactivité, puis les oublie', () => {
    const session = createSessionStorage('test.session')
    session.write({
      accessToken: 'acces',
      refreshToken: 'renouvellement',
      tokenType: 'Bearer',
      expiresIn: 900,
      sessionIdleSeconds: 1200,
      user: { id: 'u1', pseudo: 'Dresseur', role: 'PLAYER', createdAt: '2026-10-01T09:00:00Z' },
    } as Parameters<typeof session.write>[0])

    expect(session.getAccessToken()).toBe('acces')
    expect(session.read()).toMatchObject({ refreshToken: 'renouvellement', idleSeconds: 1200 })

    session.write(null)
    expect(session.read()).toBeNull()
  })

  it('ignore une session illisible', () => {
    localStorage.setItem('test.session', '{pas du json')
    expect(createSessionStorage('test.session').read()).toBeNull()
  })
})

describe('notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    toasts.splice(0)
  })
  afterEach(() => vi.useRealTimers())

  it('disparaissent seules, et jamais plus de trois à la fois', () => {
    for (const n of [1, 2, 3, 4]) toast(`message ${n}`, 'info', 1_000)
    expect(toasts.map((t) => t.message)).toEqual(['message 2', 'message 3', 'message 4'])

    vi.advanceTimersByTime(1_000)
    expect(toasts).toHaveLength(0)
  })

  it('se ferment à la demande', () => {
    toast('à fermer', 'success')
    dismissToast(toasts[0]!.id)
    expect(toasts).toHaveLength(0)
  })
})

describe('recherche différée (useDebounced)', () => {
  it('ne suit la saisie qu’après une pause', async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    const source = ref('')
    const debounced = scope.run(() => useDebounced(source, 250))!

    source.value = 'mo'
    await nextTick()
    source.value = 'mou'
    await nextTick()
    vi.advanceTimersByTime(249)
    expect(debounced.value).toBe('')
    vi.advanceTimersByTime(1)
    expect(debounced.value).toBe('mou')

    scope.stop()
    vi.useRealTimers()
  })
})

describe('couleurs des raretés et des familles', () => {
  it('donne une couleur à chaque rareté, et une couleur neutre sinon', () => {
    expect(rarityColor('LEGENDARY')).toBe('var(--color-rarity-legendary)')
    expect(rarityColor('INCONNUE')).toBe('var(--color-line)')
  })

  it('donne une teinte à chaque famille, et le gris brume sinon', () => {
    expect(familyTint('NATURE')).toBe('var(--color-mint)')
    expect(familyTint('INCONNUE')).toBe('var(--color-mist)')
  })
})
