import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'

/**
 * Contrôle automatique d'accessibilité (axe-core, règles WCAG 2.1 A/AA, base du RGAA 4.1) sur les
 * pages principales. Échoue sur toute violation « serious » ou « critical ».
 *
 * À lancer avec l'API simulée (connexion par le compte de démonstration) :
 *   pnpm dev:mock          # dans un terminal, http://localhost:5173
 *   pnpm test:e2e e2e/a11y.spec.ts --project=chromium
 *
 * axe ne remplace pas l'audit manuel : il ne juge ni la pertinence des textes, ni l'ordre de
 * lecture, ni l'usage au clavier.
 */

const PUBLIC_PAGES = [
  { path: '/', name: 'accueil public' },
  { path: '/connexion', name: 'connexion' },
  { path: '/inscription', name: 'inscription' },
]

const PLAYER_PAGES = [
  { path: '/accueil', name: 'accueil joueur' },
  { path: '/booster', name: 'booster' },
  { path: '/collection', name: 'collection' },
  { path: '/catalogue', name: 'catalogue' },
  { path: '/echanges', name: 'échanges' },
  { path: '/profil', name: 'profil' },
]

async function expectNoSeriousViolations(page: Page) {
  // Les animations d'apparition (opacité) faussent le calcul des contrastes.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForLoadState('load')
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      règle: v.id,
      impact: v.impact,
      aide: v.help,
      éléments: v.nodes.map((n) => n.target.join(' ')),
    }))
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
}

async function loginAsDemo(page: Page) {
  await page.goto('/connexion')
  await page.getByRole('button', { name: 'Dresseur' }).click()
  await page.getByRole('button', { name: 'Connexion', exact: true }).click()
  await expect(page).toHaveURL(/\/accueil$/)
}

for (const { path, name } of PUBLIC_PAGES) {
  test(`accessibilité : ${name}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('main')).toBeVisible()
    await expectNoSeriousViolations(page)
  })
}

for (const { path, name } of PLAYER_PAGES) {
  test(`accessibilité : ${name}`, async ({ page }) => {
    await loginAsDemo(page)
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoSeriousViolations(page)
  })
}
