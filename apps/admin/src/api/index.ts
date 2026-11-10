/**
 * Point d'entrée unique de l'API pour le dashboard (Web et Desktop).
 * Implémentation SIMULÉE tant que le serveur n'existe pas : remplacer `createMockAdminApi`
 * par une implémentation HTTP de `AdminApi` (openapi-fetch + `schema.d.ts`) le moment venu.
 */
import type { AdminApi } from '@creatura/shared/api/contract'
import { createSessionStorage } from '@creatura/shared/session'

import { createMockAdminApi } from './mock'

export const USE_MOCK_API = true

export const session = createSessionStorage('creatura.admin-session')

export const api: AdminApi = createMockAdminApi(session.getAccessToken)
