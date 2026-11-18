/**
 * Fixtures du dashboard admin : page objects prêts à l'emploi et connexion par compte.
 *
 *   test('…', async ({ signIn, dashboardPage }) => {
 *     await signIn('admin')
 *     await expect(dashboardPage.title).toBeVisible()
 *   })
 *
 * Attention : l'API simulée de l'admin garde ses données en mémoire (voir pages/admin.ts). Pour
 * passer d'un compte à l'autre sans les perdre, utiliser `switchTo`, qui ne recharge pas la page.
 */
import { test as base, expect } from '@playwright/test'

import { expectAccessible } from './a11y.ts'
import { admins, type Account, type AdminName } from './accounts.ts'
import {
  AccountPage,
  AdminLoginPage,
  AdminShell,
  AdminTradesPage,
  AdminsPage,
  ChangePasswordPage,
  CreaturesPage,
  DashboardPage,
  DeletionRequestDialog,
  ForbiddenPage,
  PlayerDetailPage,
  PlayersPage,
  RaritiesPage,
  SettingsPage,
} from '../pages/admin.ts'

interface AdminFixtures {
  loginPage: AdminLoginPage
  shell: AdminShell
  dashboardPage: DashboardPage
  forbiddenPage: ForbiddenPage
  changePasswordPage: ChangePasswordPage
  playersPage: PlayersPage
  playerDetailPage: PlayerDetailPage
  deletionDialog: DeletionRequestDialog
  adminsPage: AdminsPage
  creaturesPage: CreaturesPage
  settingsPage: SettingsPage
  raritiesPage: RaritiesPage
  tradesPage: AdminTradesPage
  accountPage: AccountPage
  /** Ouvre la page de connexion et se connecte. N'attend pas de page précise : un joueur est refusé. */
  signIn: (name: AdminName) => Promise<void>
  /** Se déconnecte par le menu puis se reconnecte, sans recharger la page (données conservées). */
  switchTo: (account: AdminName | Account) => Promise<void>
  /** Vérifie l'accessibilité de la page affichée (axe-core). */
  checkA11y: (options?: { exclude?: string[] }) => Promise<void>
}

export const test = base.extend<AdminFixtures>({
  loginPage: async ({ page }, use) => use(new AdminLoginPage(page)),
  shell: async ({ page }, use) => use(new AdminShell(page)),
  dashboardPage: async ({ page }, use) => use(new DashboardPage(page)),
  forbiddenPage: async ({ page }, use) => use(new ForbiddenPage(page)),
  changePasswordPage: async ({ page }, use) => use(new ChangePasswordPage(page)),
  playersPage: async ({ page }, use) => use(new PlayersPage(page)),
  playerDetailPage: async ({ page }, use) => use(new PlayerDetailPage(page)),
  deletionDialog: async ({ page }, use) => use(new DeletionRequestDialog(page)),
  adminsPage: async ({ page }, use) => use(new AdminsPage(page)),
  creaturesPage: async ({ page }, use) => use(new CreaturesPage(page)),
  settingsPage: async ({ page }, use) => use(new SettingsPage(page)),
  raritiesPage: async ({ page }, use) => use(new RaritiesPage(page)),
  tradesPage: async ({ page }, use) => use(new AdminTradesPage(page)),
  accountPage: async ({ page }, use) => use(new AccountPage(page)),

  signIn: async ({ page, loginPage }, use) => {
    await use(async (name) => {
      await loginPage.goto()
      await loginPage.signIn(admins[name])
      await expect(page).not.toHaveURL(/\/connexion/)
    })
  },

  switchTo: async ({ page, shell, loginPage }, use) => {
    await use(async (account) => {
      await shell.signOut.click()
      await expect(page).toHaveURL(/\/connexion/)
      await loginPage.signIn(typeof account === 'string' ? admins[account] : account)
      await expect(page).not.toHaveURL(/\/connexion/)
    })
  },

  checkA11y: async ({ page }, use) => {
    await use((options) => expectAccessible(page, options))
  },
})

export { expect }
