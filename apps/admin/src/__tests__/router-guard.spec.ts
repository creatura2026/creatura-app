import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { User } from '@creatura/shared/api/types'

import router from '@/router'
import { useAuthStore } from '@/stores/auth'

const ADMIN: User = { id: 'a1', pseudo: 'Admin', role: 'ADMIN', createdAt: '2026-09-01T08:00:00Z', mustChangePassword: false }
const NEW_ADMIN: User = { ...ADMIN, id: 'a2', pseudo: 'Zoe', mustChangePassword: true }
const PLAYER: User = { id: 'p1', pseudo: 'Dresseur', role: 'PLAYER', createdAt: '2026-10-01T09:00:00Z', mustChangePassword: false }

/** Ouvre `path` avec ce compte connecté (ou personne) et renvoie la route obtenue. */
async function open(path: string, user: User | null) {
  useAuthStore().user = user
  await router.push(path)
  return router.currentRoute.value
}

beforeEach(async () => {
  setActivePinia(createPinia())
  globalThis.localStorage?.clear()
  // Point de départ neutre, sans compte : une page sans règle d'accès. (Naviguer vers la page
  // déjà affichée ne déclencherait pas la garde.)
  useAuthStore().user = null
  await router.push('/acces-refuse')
})

describe('garde du routeur du dashboard', () => {
  it('sans compte : vers la connexion, en gardant la page demandée', async () => {
    const route = await open('/joueurs', null)
    expect(route.name).toBe('login')
    expect(route.query.redirect).toBe('/joueurs')
  })

  it('un joueur est refusé (accès réservé aux administrateurs)', async () => {
    expect((await open('/joueurs', PLAYER)).name).toBe('forbidden')
  })

  it('un admin au mot de passe provisoire le change avant tout', async () => {
    expect((await open('/joueurs', NEW_ADMIN)).name).toBe('change-password')
    expect((await open('/', NEW_ADMIN)).name).toBe('change-password')
  })

  it('un admin accède aux pages du dashboard', async () => {
    expect((await open('/joueurs', ADMIN)).name).toBe('players')
    expect((await open('/cartes', ADMIN)).name).toBe('creatures')
  })

  it('la page du mot de passe n’est ouverte qu’aux admins qui doivent le changer', async () => {
    expect((await open('/mot-de-passe', ADMIN)).name).toBe('dashboard')
    expect((await open('/mot-de-passe', null)).name).toBe('login')
  })

  it('déjà connecté : la page de connexion renvoie au dashboard, ou au refus pour un joueur', async () => {
    expect((await open('/connexion', ADMIN)).name).toBe('dashboard')
    expect((await open('/connexion', PLAYER)).name).toBe('forbidden')
  })

  it('une adresse inconnue ramène au dashboard', async () => {
    expect((await open('/nulle-part', ADMIN)).name).toBe('dashboard')
  })
})
