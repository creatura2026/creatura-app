/**
 * Comptes de démonstration de l'API simulée.
 * Sources : apps/player/src/api/mock/db.ts et apps/admin/src/api/mock.ts.
 */
export interface Account {
  login: string
  password: string
  pseudo: string
}

export const players = {
  dresseur: { login: 'demo', password: 'creatura-demo', pseudo: 'Dresseur' },
  lina: { login: 'lina', password: 'creatura-demo', pseudo: 'Lina_42' },
  noe: { login: 'noe', password: 'creatura-demo', pseudo: 'Noe' },
} satisfies Record<string, Account>

export const admins = {
  admin: { login: 'admin', password: 'creatura-admin', pseudo: 'Admin' },
  // Second admin : valide les suppressions de joueur demandées par le premier.
  admin2: { login: 'admin2', password: 'creatura-admin2', pseudo: 'Noa' },
  // Compte joueur : le dashboard doit le refuser.
  player: { login: 'demo', password: 'creatura-demo', pseudo: 'Dresseur' },
} satisfies Record<string, Account>

export type PlayerName = keyof typeof players
export type AdminName = keyof typeof admins
