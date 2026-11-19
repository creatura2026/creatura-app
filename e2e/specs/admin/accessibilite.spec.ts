/**
 * Accessibilité du dashboard admin : analyse axe-core de chaque écran (WCAG 2.1 A et AA).
 * Voir fixtures/a11y.ts pour les violations qui font échouer le test.
 */
import { test, expect } from '../../fixtures/admin.ts'

test('page accessible : connexion', async ({ loginPage, checkA11y }) => {
  await loginPage.goto()
  await expect(loginPage.submit).toBeVisible()
  await checkA11y()
})

test('page accessible : accès refusé', async ({ signIn, forbiddenPage, checkA11y }) => {
  await signIn('player')
  await expect(forbiddenPage.title).toBeVisible()
  await checkA11y()
})

const PAGES = [
  { item: 'Statistiques', heading: 'Piloter Créatura' },
  { item: 'Échanges', heading: 'Échanges' },
  { item: 'Raretés', heading: 'Distribution des raretés' },
  { item: 'Cartes', heading: 'Cartes' },
  { item: 'Réglages booster', heading: 'Réglages du booster' },
  { item: 'Joueurs', heading: 'Joueurs' },
  { item: 'Administrateurs', heading: 'Administrateurs' },
] as const

for (const { item, heading } of PAGES) {
  test(`page accessible : ${item}`, async ({ page, signIn, shell, checkA11y }) => {
    await signIn('admin')
    await shell.open(item)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(page.getByRole('status', { name: /Chargement/ })).toHaveCount(0)
    await checkA11y()
  })
}

test('page accessible : fiche d’un joueur', async ({ page, signIn, shell, playerDetailPage, checkA11y }) => {
  await signIn('admin')
  await shell.open('Joueurs')
  await page.getByRole('link', { name: 'Lina_42', exact: true }).click()
  await expect(playerDetailPage.title).toHaveText('Lina_42')
  await checkA11y()
})

test('page accessible : mon compte', async ({ signIn, shell, accountPage, checkA11y }) => {
  await signIn('admin')
  await shell.account.click()
  await expect(accountPage.title).toBeVisible()
  await checkA11y()
})
