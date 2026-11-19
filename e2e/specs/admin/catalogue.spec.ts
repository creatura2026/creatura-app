/** A-08 à A-11 : cartes, raretés, réglages du booster, supervision des échanges. */
import { test, expect } from '../../fixtures/admin.ts'
import { toast } from '../../pages/forms.ts'

/** Un PNG d'un pixel, pour l'image d'une carte. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.beforeEach(async ({ signIn }) => {
  await signIn('admin')
})

test.describe('cartes (A-08)', () => {
  test.beforeEach(async ({ shell }) => {
    await shell.open('Cartes')
  })

  test('créer une carte avec son image : l’aperçu suit la saisie', { tag: '@smoke' }, async ({
    page,
    creaturesPage,
  }) => {
    await creaturesPage.name.fill('Pixelou')
    await creaturesPage.family.selectOption({ label: 'Lueur' })
    await creaturesPage.description.fill('Une petite lueur carrée.')

    // Sans image, l'aperçu est une silhouette
    await expect(creaturesPage.preview).toHaveAccessibleName('Pixelou, non possédée')
    await expect(page.getByText('sprites/pixelou.png')).toBeVisible()

    await creaturesPage.image.setInputFiles({ name: 'pixelou.png', mimeType: 'image/png', buffer: PNG })
    await expect(creaturesPage.preview).toHaveAccessibleName('Pixelou')
    await expect(creaturesPage.preview).toContainText('Une petite lueur carrée.')

    await creaturesPage.add.click()
    await expect(toast(page, /Pixelou sera disponible le .*, à minuit\./)).toBeVisible()
    await expect(creaturesPage.item('Pixelou')).toContainText('disponible le')
  })

  test('une carte légendaire demande un nombre d’exemplaires', async ({ page, creaturesPage }) => {
    await expect(creaturesPage.stock).toHaveCount(0)
    await expect(page.getByText('Illimité').first()).toBeVisible()

    await creaturesPage.rarity.selectOption({ label: 'Légendaire (édition limitée)' })

    await expect(creaturesPage.stock).toBeVisible()
    await expect(creaturesPage.preview.getByRole('img', { name: 'Rareté : Légendaire' })).toBeVisible()
  })

  test('modifier une carte existante', async ({ page, creaturesPage }) => {
    const moussou = creaturesPage.item('Moussou')
    await expect(moussou).toBeVisible()
    const countBefore = await creaturesPage.list.count()
    await moussou.getByRole('button', { name: 'Modifier la créature' }).click()
    await moussou.getByLabel('Nom', { exact: true }).fill('Mousse magique')
    await moussou.getByLabel('Description', { exact: true }).fill('Une boule de mousse très calme.')
    await moussou.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(toast(page, 'Mousse magique mise à jour.')).toBeVisible()
    await expect(creaturesPage.list).toHaveCount(countBefore)
    await expect(
      creaturesPage.list.filter({ has: page.getByText('Moussou', { exact: true }) }),
    ).toHaveCount(0)
    await expect(
      creaturesPage.list.filter({ has: page.getByText('Mousse magique', { exact: true }) }),
    ).toHaveCount(1)
  })
})

test('distribution des raretés (A-09)', async ({ shell, raritiesPage }) => {
  await shell.open('Raretés')

  await expect(raritiesPage.title).toBeVisible()
  const rows = raritiesPage.table.locator('tbody tr')
  await expect(rows).toHaveCount(4)
  for (const label of ['Commun', 'Peu commun', 'Rare', 'Légendaire']) {
    await expect(raritiesPage.table.getByRole('rowheader', { name: label, exact: true })).toBeVisible()
  }
})

test('réglages du booster : une carte de plus à partir du prochain minuit (A-10)', async ({
  page,
  shell,
  settingsPage,
}) => {
  await shell.open('Réglages booster')
  await expect(settingsPage.value).toHaveText('5')
  await expect(settingsPage.save).toBeDisabled()

  await settingsPage.more.click()
  await expect(settingsPage.value).toHaveText('6')
  await settingsPage.save.click()

  await expect(toast(page, /Réglages enregistrés : appliqués à partir du /)).toBeVisible()
  await expect(settingsPage.scheduled).toBeVisible()
  await expect(page.getByText(/6 cartes · poids/)).toBeVisible()
  await expect(page.getByText('En vigueur aujourd’hui : 5 cartes')).toBeVisible()
})

test.describe('supervision des échanges (A-11)', () => {
  test.beforeEach(async ({ shell }) => {
    await shell.open('Échanges')
  })

  test('filtrer par état', async ({ page, tradesPage }) => {
    await expect(tradesPage.count).toBeVisible()
    await tradesPage.status.selectOption({ label: 'Conclus' })

    await expect(page).toHaveURL(/etat=ACCEPTED/)
    await expect(tradesPage.rows.first()).toBeVisible()
  })

  test('filtrer par joueur', async ({ page, tradesPage }) => {
    // Un joueur qui a des échanges sur la période affichée : le proposant du premier.
    const pseudo = (await tradesPage.rows.first().locator('td').nth(1).locator('span').first().textContent())!.trim()

    await tradesPage.player.fill(pseudo.slice(0, 3))
    await page.getByRole('option').getByRole('button', { name: pseudo, exact: true }).click()

    await expect(page.getByRole('button', { name: 'Retirer le filtre joueur' })).toBeVisible()
    await expect(tradesPage.rows.first()).toBeVisible()
    await expect(tradesPage.rows.filter({ hasNotText: pseudo })).toHaveCount(0)
  })
})
