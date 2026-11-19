/**
 * Fixtures de la stack réelle.
 *
 * Chaque test crée ses propres comptes par l'API (`newPlayer`) : les tests restent indépendants,
 * parallélisables, et la limite d'un booster par jour ne gêne pas les suivants.
 *
 *   test('…', async ({ openPlayer }) => {
 *     const alice = await openPlayer(await newPlayer('Alice'))   // navigateur connecté
 *     const bob = await openPlayer(await newPlayer('Bob'))       // un second navigateur
 *     await alice.room.put('Moussou')
 *   })
 */
import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

import { ADMIN_URL, PLAYER_URL } from '../stack/urls.ts'
import { AdminLoginPage, AdminShell, PlayersPage } from '../pages/admin.ts'
import {
  BoosterPage,
  CollectionPage,
  PlayerLoginPage,
  ProfilePage,
  TradeRoomPage,
  TradesPage,
} from '../pages/player.ts'
import type { Account } from '../stack/api.ts'

/** Un joueur connecté dans son propre navigateur. */
export interface PlayerSession {
  account: Account
  context: BrowserContext
  page: Page
  booster: BoosterPage
  collection: CollectionPage
  trades: TradesPage
  room: TradeRoomPage
  profile: ProfilePage
  /** Ouvre la salle d'un échange. */
  enterRoom: (tradeId: string) => Promise<void>
}

export interface AdminSession {
  account: Account
  context: BrowserContext
  page: Page
  shell: AdminShell
  players: PlayersPage
}

async function newContext(browser: Browser, baseURL: string, contexts: BrowserContext[]) {
  const context = await browser.newContext({
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  })
  contexts.push(context)
  return context
}

interface StackFixtures {
  /** Ouvre un navigateur et y connecte ce joueur. */
  openPlayer: (account: Account) => Promise<PlayerSession>
  /** Ouvre un navigateur sur le dashboard et y connecte cet administrateur. */
  openAdmin: (account: Account) => Promise<AdminSession>
}

export const test = base.extend<StackFixtures>({
  openPlayer: async ({ browser }, use) => {
    const contexts: BrowserContext[] = []
    await use(async (account) => {
      // Playwright enregistre la trace de ce navigateur (use.trace), gardée en cas d'échec.
      const context = await newContext(browser, PLAYER_URL, contexts)
      const page = await context.newPage()
      const login = new PlayerLoginPage(page)
      await login.goto()
      await login.signIn(account.credentials)
      await expect(page).toHaveURL(/\/accueil$/)
      const room = new TradeRoomPage(page)
      return {
        account,
        context,
        page,
        booster: new BoosterPage(page),
        collection: new CollectionPage(page),
        trades: new TradesPage(page),
        room,
        profile: new ProfilePage(page),
        enterRoom: async (tradeId) => {
          await page.goto(`/echanges/${tradeId}`)
          await expect(room.title).toBeVisible()
        },
      }
    })
    for (const context of contexts) await context.close()
  },

  openAdmin: async ({ browser }, use) => {
    const contexts: BrowserContext[] = []
    await use(async (account) => {
      const context = await newContext(browser, ADMIN_URL, contexts)
      const page = await context.newPage()
      const login = new AdminLoginPage(page)
      await login.goto()
      await login.signIn(account.credentials)
      await expect(page).not.toHaveURL(/\/connexion/)
      return { account, context, page, shell: new AdminShell(page), players: new PlayersPage(page) }
    })
    for (const context of contexts) await context.close()
  },
})

export { expect }
