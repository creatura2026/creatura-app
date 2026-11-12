/**
 * Point d'entrée unique de l'API pour les écrans.
 *
 * Par défaut : le vrai serveur (`backend/`), via `/api/v1`. Mode simulé, sans serveur :
 * `pnpm dev:mock` (variable `VITE_API_MOCK=true`, fichier `.env.mock`).
 */
import type { PlayerApi } from '@creatura/shared/api/contract'
import { createHttpPlayerApi } from '@creatura/shared/api/http'

import { createMockPlayerApi } from './mock/server'
import { resetDb } from './mock/db'
import { getAccessToken, session } from './token'

export const USE_MOCK_API = import.meta.env.VITE_API_MOCK === 'true'

const mock = createMockPlayerApi({ getToken: getAccessToken })

export const api: PlayerApi = USE_MOCK_API ? mock : createHttpPlayerApi(session)

/** Outils réservés à la démonstration en mode simulé. */
export const demoTools = {
  resetTodayBooster: () => mock.resetTodayBooster(),
  resetData: async () => resetDb(),
}
