/** Session du joueur (jetons + utilisateur), conservée entre les visites. */
import { createSessionStorage } from '@creatura/shared/session'

const session = createSessionStorage('creatura.session')

export const readSession = session.read
export const writeSession = session.write
export const getAccessToken = session.getAccessToken
