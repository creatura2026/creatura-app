/**
 * Réglage des boosters pour les API SIMULÉES uniquement.
 *
 * Sans serveur, l'app joueur et le dashboard ne partagent aucune donnée : en local ils tournent sur
 * des ports différents, donc avec des localStorage séparés. Les cookies, eux, sont partagés par tous
 * les ports d'un même hôte : on y range le réglage pour que la démonstration fonctionne de bout en bout.
 * Avec le vrai back, ce fichier disparaît (le serveur fait autorité, voir `/admin/settings/booster`).
 */
import type { BoosterSettings } from './types'

export const DEFAULT_CARDS_PER_BOOSTER = 5
export const MIN_CARDS_PER_BOOSTER = 1
export const MAX_CARDS_PER_BOOSTER = 10

const COOKIE = 'creatura_mock_booster'

const DEFAULTS: BoosterSettings = {
  cardsPerBooster: DEFAULT_CARDS_PER_BOOSTER,
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
    return parsed
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
