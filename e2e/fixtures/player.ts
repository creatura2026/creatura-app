/**
 * Fixtures du site joueur : page objects prêts à l'emploi et connexion par compte.
 *
 *   test('…', async ({ signIn, homePage }) => {
 *     await signIn('lina')
 *     await expect(homePage.greeting).toContainText('Lina_42')
 *   })
 *
 * Chaque test a son propre contexte navigateur, donc son propre `localStorage` : l'API simulée
 * repart de ses données de démonstration à chaque test.
 */
import { test as base, expect } from '@playwright/test'

import { players, type PlayerName } from './accounts.ts'
import { HomePage, LandingPage, PlayerLoginPage, ProfilePage } from '../pages/player.ts'

interface PlayerFixtures {
  landingPage: LandingPage
  loginPage: PlayerLoginPage
  homePage: HomePage
  profilePage: ProfilePage
  /** Se connecte avec un compte de démonstration et attend la page d'accueil du joueur. */
  signIn: (name: PlayerName) => Promise<void>
}

export const test = base.extend<PlayerFixtures>({
  landingPage: async ({ page }, use) => use(new LandingPage(page)),
  loginPage: async ({ page }, use) => use(new PlayerLoginPage(page)),
  homePage: async ({ page }, use) => use(new HomePage(page)),
  profilePage: async ({ page }, use) => use(new ProfilePage(page)),

  signIn: async ({ page, loginPage }, use) => {
    await use(async (name) => {
      await loginPage.goto()
      await loginPage.signIn(players[name])
      await expect(page).toHaveURL(/\/accueil$/)
    })
  },
})

export { expect }
