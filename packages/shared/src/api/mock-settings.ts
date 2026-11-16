/**
 * Réglage des boosters pour les API SIMULÉES uniquement.
 *
 * Sans serveur, l'app joueur et le dashboard ne partagent aucune donnée : en local ils tournent sur
 * des ports différents, donc avec des localStorage séparés. Les cookies, eux, sont partagés par tous
 * les ports d'un même hôte : on y range le réglage pour que la démonstration fonctionne de bout en bout.
 * Avec le vrai back, ce fichier disparaît (le serveur fait autorité, voir `/admin/settings/booster`).
 */
import type { BoosterSettings } from './types'
import { parisToday } from '../format'

export const DEFAULT_CARDS_PER_BOOSTER = 5
export const MIN_CARDS_PER_BOOSTER = 3
export const MAX_CARDS_PER_BOOSTER = 10

const COOKIE = 'creatura_mock_booster'

export const DEFAULT_RARITY_WEIGHTS = { COMMON: 70, UNCOMMON: 20, RARE: 8, LEGENDARY: 2 }

const DEFAULTS: BoosterSettings = {
  cardsPerBooster: DEFAULT_CARDS_PER_BOOSTER,
  rarityWeights: { ...DEFAULT_RARITY_WEIGHTS },
  scheduled: null,
  updatedAt: null,
  updatedBy: null,
}

export function readMockBoosterSettings(): BoosterSettings {
  try {
    const raw = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(decodeURIComponent(raw)) as BoosterSettings
    const n = Number(parsed.cardsPerBooster)
    if (!Number.isInteger(n) || n < MIN_CARDS_PER_BOOSTER || n > MAX_CARDS_PER_BOOSTER) {
      return { ...DEFAULTS }
    }
    const settings: BoosterSettings = {
      ...parsed,
      rarityWeights: parsed.rarityWeights ?? { ...DEFAULT_RARITY_WEIGHTS },
      scheduled: parsed.scheduled ?? null,
    }
    // Comme le serveur : les réglages enregistrés s'appliquent au prochain minuit.
    if (settings.scheduled && settings.scheduled.effectiveFrom <= parisToday()) {
      const { cardsPerBooster, rarityWeights } = settings.scheduled
      const applied = { ...settings, cardsPerBooster, rarityWeights, scheduled: null }
      writeMockBoosterSettings(applied)
      return applied
    }
    return settings
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeMockBoosterSettings(settings: BoosterSettings): void {
  try {
    const value = encodeURIComponent(JSON.stringify(settings))
    document.cookie = `${COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`
  } catch {
    // Cookies indisponibles : le réglage ne sera pas partagé.
  }
}
