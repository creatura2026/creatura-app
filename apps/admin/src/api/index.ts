/**
 * Point d'entrée unique de l'API pour le dashboard (Web et Desktop).
 *
 * Par défaut : le vrai serveur (`backend/`), via `/api/v1`. Mode simulé, sans serveur :
 * `pnpm dev:mock` (variable `VITE_API_MOCK=true`, fichier `.env.mock`).
 */
import type { AdminApi } from '@creatura/shared/api/contract'
import { createHttpAdminApi } from '@creatura/shared/api/http'
import { createSessionStorage } from '@creatura/shared/session'

import { createMockAdminApi } from './mock'

export const USE_MOCK_API = import.meta.env.VITE_API_MOCK === 'true'

export const session = createSessionStorage('creatura.admin-session')

export const api: AdminApi = USE_MOCK_API
  ? createMockAdminApi(session.getAccessToken)
  : createHttpAdminApi(session)
