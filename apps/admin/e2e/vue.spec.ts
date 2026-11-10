import { test, expect } from '@playwright/test'

test('un joueur se voit refuser l’accès administrateur', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/connexion/)
  await page.getByRole('button', { name: 'Joueur (refusé)' }).click()
  await page.getByRole('button', { name: 'Connexion', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible()
})

test('un administrateur consulte les statistiques', async ({ page }) => {
  await page.goto('/connexion')
  await page.getByRole('button', { name: 'Administrateur' }).click()
  await page.getByRole('button', { name: 'Connexion', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Piloter Créatura' })).toBeVisible()
  await expect(page.getByText('Inscrits · total')).toBeVisible()
})
