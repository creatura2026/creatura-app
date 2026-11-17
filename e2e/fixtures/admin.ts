/**
 * Fixtures du dashboard admin : page objects prêts à l'emploi et connexion par compte.
 *
 *   test('…', async ({ signIn, dashboardPage }) => {
 *     await signIn('admin')
 *     await expect(dashboardPage.title).toBeVisible()
 *   })
 */
import { test as base, expect } from '@playwright/test'

import { admins, type AdminName } from './accounts.ts'
import { AdminLoginPage, DashboardPage, ForbiddenPage } from '../pages/admin.ts'

interface AdminFixtures {
  loginPage: AdminLoginPage
  dashboardPage: DashboardPage
  forbiddenPage: ForbiddenPage
  /** Se connecte avec un compte de démonstration. N'attend pas de page précise : un joueur est refusé. */
  signIn: (name: AdminName) => Promise<void>
}

export const test = base.extend<AdminFixtures>({
  loginPage: async ({ page }, use) => use(new AdminLoginPage(page)),
  dashboardPage: async ({ page }, use) => use(new DashboardPage(page)),
  forbiddenPage: async ({ page }, use) => use(new ForbiddenPage(page)),

  signIn: async ({ page, loginPage }, use) => {
    await use(async (name) => {
      await loginPage.goto()
      await loginPage.signIn(admins[name])
      await expect(page).not.toHaveURL(/\/connexion/)
    })
  },
})

export { expect }
