/**
 * P-05 et P-06 : catalogue, fiche d'une créature, collection.
 *
 * Données de démonstration : 12 créatures au catalogue. Dresseur en possède 6 différentes
 * (Moussou ×3, Flammille ×2, Quartzou ×2, Glandinet, Nuageon, Lucioline), soit 3 doublons.
 */
import { test, expect } from '../../fixtures/player.ts'
import { creatureCard } from '../../pages/player.ts'

test.describe('catalogue (P-05)', () => {
  test.beforeEach(async ({ signIn }) => {
    await signIn('dresseur')
  })

  test('le catalogue montre toutes les créatures, possédées ou non', { tag: '@mobile' }, async ({
    cataloguePage,
  }) => {
    await cataloguePage.goto()

    await expect(cataloguePage.count).toHaveText('12 créatures')
    await expect(cataloguePage.cards).toHaveCount(12)
  })

  test('la recherche ignore les accents et les majuscules', async ({ page, cataloguePage }) => {
    await cataloguePage.goto()
    await cataloguePage.search.fill('AMETH')

    await expect(cataloguePage.count).toHaveText('1 créature')
    await expect(creatureCard(page, 'Améthine')).toBeVisible()
  })

  test('les filtres famille et rareté se combinent', async ({ page, cataloguePage }) => {
    await cataloguePage.goto()
    await cataloguePage.family.selectOption({ label: 'Cristal' })
    await cataloguePage.rarity.selectOption({ label: 'Commun' })

    await expect(cataloguePage.count).toHaveText('1 créature')
    await expect(creatureCard(page, 'Quartzou')).toBeVisible()
  })

  test('une recherche sans résultat propose d’effacer les filtres', async ({ page, cataloguePage }) => {
    await cataloguePage.goto()
    await cataloguePage.search.fill('licorne')

    await expect(page.getByText('Aucune créature ne correspond à ces critères.')).toBeVisible()
    await page.getByRole('button', { name: 'Effacer les filtres' }).click()
    await expect(cataloguePage.count).toHaveText('12 créatures')
  })

  test('la fiche d’une créature possédée montre sa rareté, ses exemplaires et les autres joueurs qui l’ont', async ({
    page,
    cataloguePage,
    creaturePage,
  }) => {
    await cataloguePage.goto()
    await cataloguePage.open('Moussou')

    await expect(page).toHaveURL(/\/catalogue\/[\w-]+$/)
    await expect(creaturePage.name).toHaveText('Moussou')
    await expect(creaturePage.rarityGems).toHaveAccessibleName('Rareté : Commun')
    await expect(creaturePage.ownership).toHaveText('Possédées : 3')
    await expect(page.getByRole('heading', { name: 'Les autres joueurs qui l’ont' })).toBeVisible()
    await expect(creaturePage.owners).toHaveCount(2)
    await expect(creaturePage.tradeWith('Lina_42')).toBeVisible()
    await expect(creaturePage.tradeWith('Linette')).toBeVisible()
  })

  test('la fiche d’une créature non possédée invite à tenter sa chance', async ({
    page,
    cataloguePage,
    creaturePage,
  }) => {
    await cataloguePage.goto()
    await cataloguePage.open('Brumel')

    await expect(creaturePage.ownership).toHaveText('Non possédée')
    await expect(creaturePage.rarityGems).toHaveAccessibleName('Rareté : Rare')
    await page.getByRole('link', { name: 'Tenter ma chance' }).click()
    await expect(page).toHaveURL(/\/booster$/)
  })
})

test.describe('collection (P-06)', () => {
  test.beforeEach(async ({ signIn }) => {
    await signIn('dresseur')
  })

  test('la collection montre la progression et les cartes possédées', { tag: '@mobile' }, async ({
    page,
    collectionPage,
  }) => {
    await collectionPage.goto()

    await expect(collectionPage.summary).toContainText('6 créatures sur 12')
    await expect(collectionPage.totalCards).toHaveText('10')
    await expect(collectionPage.count).toHaveText('6 résultats affichés')
    await expect(collectionPage.quantityOf('Moussou')).toHaveText('3')
    await expect(creatureCard(page, 'Brumel')).toBeHidden()
  })

  test('les filtres possédées, manquantes, toutes et doublons', async ({ page, collectionPage }) => {
    await collectionPage.goto()

    await collectionPage.ownership('Manquantes').click()
    await expect(collectionPage.count).toHaveText('6 résultats affichés')
    await expect(creatureCard(page, 'Brumel', true)).toBeVisible()

    await collectionPage.ownership('Toutes').click()
    await expect(collectionPage.count).toHaveText('12 résultats affichés')

    await collectionPage.ownership('Possédées').click()
    await collectionPage.duplicates.click()
    await expect(collectionPage.count).toContainText('3 résultats affichés')
    await expect(collectionPage.count).toContainText('filtre actif : doublons')
    for (const name of ['Moussou', 'Flammille', 'Quartzou']) {
      await expect(creatureCard(page, name)).toBeVisible()
    }
  })

  test('une carte de la collection mène à sa fiche', async ({ page, collectionPage, creaturePage }) => {
    await collectionPage.goto()
    await creatureCard(page, 'Lucioline').click()

    await expect(creaturePage.name).toHaveText('Lucioline')
    await expect(creaturePage.ownership).toHaveText('Possédées : 1')
  })
})
