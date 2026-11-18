/**
 * Accessibilité du site joueur : analyse axe-core de chaque écran (WCAG 2.1 A et AA).
 * Voir fixtures/a11y.ts pour les violations qui font échouer le test.
 */
import { test, expect } from '../../fixtures/player.ts'

const PUBLIC_PAGES = [
  { name: 'accueil du site', path: '/' },
  { name: 'connexion', path: '/connexion' },
  { name: 'inscription', path: '/inscription' },
  { name: 'page introuvable', path: '/page-inconnue' },
]

const PLAYER_PAGES = [
  { name: 'accueil du joueur', path: '/accueil' },
  { name: 'booster', path: '/booster' },
  { name: 'catalogue', path: '/catalogue' },
  { name: 'collection', path: '/collection' },
  { name: 'échanges', path: '/echanges' },
  { name: 'nouvel échange', path: '/echanges/nouveau' },
  { name: 'salle d’échange', path: '/echanges/aaaaaaaa-0001-4000-8000-000000000001' },
  { name: 'profil', path: '/profil' },
]

for (const { name, path } of PUBLIC_PAGES) {
  test(`page accessible : ${name}`, async ({ page, checkA11y }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await checkA11y()
  })
}

for (const { name, path } of PLAYER_PAGES) {
  test(`page accessible : ${name}`, async ({ page, signIn, checkA11y }) => {
    await signIn('dresseur')
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Laisse les listes chargées par l'API simulée s'afficher.
    await expect(page.getByRole('status', { name: /Chargement/ })).toHaveCount(0)
    await checkA11y()
  })
}

test('page accessible : fiche d’une créature', async ({ page, signIn, cataloguePage, checkA11y }) => {
  await signIn('dresseur')
  await cataloguePage.goto()
  await cataloguePage.open('Moussou')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Moussou')
  await checkA11y()
})
