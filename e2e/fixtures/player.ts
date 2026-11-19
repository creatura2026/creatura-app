/**
 * Fixtures du site joueur : page objects prêts à l'emploi et connexion par compte.
 *
 *   test('…', async ({ signIn, homePage }) => {
 *     await signIn('lina')
 *     await expect(homePage.greeting).toContainText('Lina_42')
 *   })
 *
 * Chaque test a son propre contexte navigateur, donc son propre `localStorage` : l'API simulée
 * repart de ses données de démonstration à chaque test. Dans un même test, les comptes partagent
 * ces données : `switchTo('lina')` permet de voir l'effet d'une action de Dresseur chez Lina.
 */
import { test as base, expect } from '@playwright/test'

import { expectAccessible } from './a11y.ts'
import { players, type PlayerName } from './accounts.ts'
import {
  BoosterPage,
  CataloguePage,
  CollectionPage,
  CreaturePage,
  HomePage,
  LandingPage,
  NewTradePage,
  NotFoundPage,
  PlayerLoginPage,
  ProfilePage,
  RegisterPage,
  TradeRoomPage,
  TradesPage,
} from '../pages/player.ts'

interface PlayerFixtures {
  landingPage: LandingPage
  loginPage: PlayerLoginPage
  registerPage: RegisterPage
  homePage: HomePage
  boosterPage: BoosterPage
  cataloguePage: CataloguePage
  creaturePage: CreaturePage
  collectionPage: CollectionPage
  tradesPage: TradesPage
  newTradePage: NewTradePage
  tradeRoomPage: TradeRoomPage
  profilePage: ProfilePage
  notFoundPage: NotFoundPage
  /** Se connecte avec un compte de démonstration et attend la page d'accueil du joueur. */
  signIn: (name: PlayerName) => Promise<void>
  /** Se déconnecte depuis le profil. */
  signOut: () => Promise<void>
  /** Se déconnecte puis se reconnecte avec un autre compte (mêmes données simulées). */
  switchTo: (name: PlayerName) => Promise<void>
  /** Vérifie l'accessibilité de la page affichée (axe-core). */
  checkA11y: (options?: { exclude?: string[] }) => Promise<void>
}

export const test = base.extend<PlayerFixtures>({
  landingPage: async ({ page }, use) => use(new LandingPage(page)),
  loginPage: async ({ page }, use) => use(new PlayerLoginPage(page)),
  registerPage: async ({ page }, use) => use(new RegisterPage(page)),
  homePage: async ({ page }, use) => use(new HomePage(page)),
  boosterPage: async ({ page }, use) => use(new BoosterPage(page)),
  cataloguePage: async ({ page }, use) => use(new CataloguePage(page)),
  creaturePage: async ({ page }, use) => use(new CreaturePage(page)),
  collectionPage: async ({ page }, use) => use(new CollectionPage(page)),
  tradesPage: async ({ page }, use) => use(new TradesPage(page)),
  newTradePage: async ({ page }, use) => use(new NewTradePage(page)),
  tradeRoomPage: async ({ page }, use) => use(new TradeRoomPage(page)),
  profilePage: async ({ page }, use) => use(new ProfilePage(page)),
  notFoundPage: async ({ page }, use) => use(new NotFoundPage(page)),

  signIn: async ({ page, loginPage }, use) => {
    await use(async (name) => {
      await loginPage.goto()
      await loginPage.signIn(players[name])
      await expect(page).toHaveURL(/\/accueil$/)
    })
  },

  signOut: async ({ page, profilePage }, use) => {
    await use(async () => {
      await profilePage.goto()
      await profilePage.signOutButton.click()
      await expect(page).toHaveURL(/\/$/)
    })
  },

  switchTo: async ({ signIn, signOut }, use) => {
    await use(async (name) => {
      await signOut()
      await signIn(name)
    })
  },

  checkA11y: async ({ page }, use) => {
    await use((options) => expectAccessible(page, options))
  },
})

export { expect }
