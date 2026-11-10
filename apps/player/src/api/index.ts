/**
 * Point d'entrée unique de l'API pour les écrans.
 *
 * Pour l'instant, l'implémentation est SIMULÉE (aucun back). Quand le serveur sera prêt, il suffira de
 * remplacer `createMockPlayerApi` par une implémentation HTTP de `PlayerApi` (openapi-fetch + `schema.d.ts`).
 */
import type { PlayerApi } from '@creatura/shared/api/contract'

import { createMockPlayerApi } from './mock/server'
import { resetDb } from './mock/db'
import { getAccessToken } from './token'

export const USE_MOCK_API = true

const mock = createMockPlayerApi({ getToken: getAccessToken })

export const api: PlayerApi = mock

/** Outils réservés à la démonstration en mode simulé. */
export const demoTools = {
  resetTodayBooster: () => mock.resetTodayBooster(),
  resetData: async () => resetDb(),
}
