/**
 * A-05 et A-06 : suivi des joueurs, suppression validée par un second administrateur.
 *
 * Admin (« Admin ») et admin2 (« Noa ») sont les deux comptes administrateur de démonstration.
 * Les données de l'API simulée admin vivent en mémoire : on change de compte avec `switchTo`
 * et on navigue par le menu, sans recharger la page.
 */
import { test, expect } from '../../fixtures/admin.ts'
import { toast } from '../../pages/forms.ts'

test.beforeEach(async ({ signIn, shell }) => {
  await signIn('admin')
  await shell.open('Joueurs')
})

test('rechercher un joueur et ouvrir sa fiche de suivi (A-05)', async ({
  page,
  playersPage,
  playerDetailPage,
}) => {
  await playersPage.search.fill('lin')

  await expect(playersPage.row('Lina_42')).toBeVisible()
  await expect(playersPage.row('Linette')).toBeVisible()
  await expect(playersPage.row('Dresseur')).toHaveCount(0)

  await page.getByRole('link', { name: 'Lina_42', exact: true }).click()
  await expect(playerDetailPage.title).toHaveText('Lina_42')
  await expect(playerDetailPage.kpi('Cartes possédées')).toBeVisible()
  await expect(playerDetailPage.kpi('Dernière connexion')).toBeVisible()
  await expect(page.getByRole('table', { name: 'Cartes possédées par rareté' })).toBeVisible()
})

test(
  'une suppression demandée par un admin est validée par le second (A-06)',
  { tag: '@smoke' },
  async ({ page, playersPage, deletionDialog, switchTo, shell }) => {
    await playersPage.search.fill('mina')
    await playersPage.select('Mina').check()
    await playersPage.requestDeletion.click()

    await expect(deletionDialog.dialog).toContainText('1 joueur : Mina')
    await deletionDialog.validator.selectOption({ label: 'Noa' })
    await deletionDialog.reason.fill('Compte de test')
    await deletionDialog.send.click()

    await expect(toast(page, 'Demande envoyée à Noa.')).toBeVisible()
    await expect(playersPage.row('Mina')).toContainText('Suppression demandée')
    // Celui qui demande ne peut pas valider : il peut seulement annuler sa demande.
    await expect(page.getByRole('button', { name: 'Annuler ma demande' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Valider', exact: true })).toHaveCount(0)

    await switchTo('admin2')
    await shell.open('Joueurs')
    const request = playersPage.toValidate.getByRole('listitem').filter({ hasText: 'Mina' })
    await expect(request).toContainText('Demandée par Admin')
    await request.getByRole('button', { name: 'Valider', exact: true }).click()
    await request.getByRole('button', { name: 'Oui, supprimer' }).click()

    await playersPage.search.fill('mina')
    await expect(page.getByText('Aucun joueur')).toBeVisible()
  },
)

test('le second admin peut refuser la demande : le joueur reste', async ({
  playersPage,
  deletionDialog,
  switchTo,
  shell,
}) => {
  await playersPage.search.fill('yanis')
  await playersPage.select('Yanis').check()
  await playersPage.requestDeletion.click()
  await deletionDialog.validator.selectOption({ label: 'Noa' })
  await deletionDialog.send.click()
  await expect(playersPage.row('Yanis')).toContainText('Suppression demandée')

  await switchTo('admin2')
  await shell.open('Joueurs')
  const request = playersPage.toValidate.getByRole('listitem').filter({ hasText: 'Yanis' })
  await request.getByRole('button', { name: 'Refuser' }).click()

  await playersPage.search.fill('yanis')
  await expect(playersPage.row('Yanis')).toBeVisible()
  await expect(playersPage.row('Yanis')).not.toContainText('Suppression demandée')
})

test('on ne peut pas se désigner soi-même comme validateur', async ({
  playersPage,
  deletionDialog,
}) => {
  await playersPage.search.fill('tom')
  await playersPage.select('Tom-77').check()
  await playersPage.requestDeletion.click()

  const options = deletionDialog.validator.getByRole('option')
  await expect(options.filter({ hasText: 'Noa' })).toHaveCount(1)
  await expect(options.filter({ hasText: /^Admin$/ })).toHaveCount(0)
})
