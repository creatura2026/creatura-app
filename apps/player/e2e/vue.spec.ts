import { test, expect } from '@playwright/test'

test('un visiteur découvre Créatura puis se connecte avec le compte de démonstration', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('CREATURA')

  await page.getByRole('link', { name: 'J’ai déjà un compte' }).click()
  await page.getByRole('button', { name: 'Dresseur' }).click()
  await page.getByRole('button', { name: 'Connexion', exact: true }).click()

  await expect(page).toHaveURL(/\/accueil$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Dresseur')
})
