import { test, expect } from '../../fixtures/admin.ts'

test('un joueur se voit refuser l’accès administrateur', async ({
  page,
  loginPage,
  forbiddenPage,
}) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/connexion/)

  await loginPage.demoAccount('Joueur (refusé)').click()
  await loginPage.submit.click()

  await expect(forbiddenPage.title).toBeVisible()
})

test(
  'un administrateur consulte les statistiques',
  { tag: '@smoke' },
  async ({ signIn, dashboardPage }) => {
    await signIn('admin')

    await expect(dashboardPage.title).toBeVisible()
    await expect(dashboardPage.kpi('Inscrits · total')).toBeVisible()
  },
)
