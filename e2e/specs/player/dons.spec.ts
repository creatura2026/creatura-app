/**
 * P-14 et P-15 : dons de cartes.
 *
 * Les comptes de démonstration partagent les données simulées du navigateur : on offre avec
 * Dresseur, puis on se reconnecte en Lina (ou Noe) pour accepter ou refuser.
 * Glandinet : Dresseur n'en a qu'un exemplaire, Lina n'en a pas.
 */
import { test, expect } from '../../fixtures/player.ts'
import { toast } from '../../pages/forms.ts'
import { creatureCard } from '../../pages/player.ts'

test.beforeEach(async ({ signIn, newTradePage }) => {
  // Chaque test se reconnecte avec deux ou trois comptes.
  test.slow()
  await signIn('dresseur')
  await newTradePage.goto()
})

test('offrir une carte : le destinataire l’accepte et la reçoit', { tag: '@smoke' }, async ({
  page,
  newTradePage,
  tradesPage,
  collectionPage,
  switchTo,
}) => {
  await newTradePage.gift('Glandinet', 'Lina_42')
  await expect(toast(page, '1 Glandinet offerte(s) à Lina_42. En attente de sa réponse.')).toBeVisible()

  await tradesPage.goto()
  await tradesPage.tab('Dons').click()
  await expect(tradesPage.gift('Offert à Lina_42')).toContainText('Glandinet')

  await switchTo('lina')
  await tradesPage.goto()
  await tradesPage.tab('Dons').click()
  const received = tradesPage.gift('Reçu de Dresseur')
  await expect(received).toContainText('À décider')
  await received.getByRole('button', { name: 'Accepter' }).click()

  await expect(toast(page, '1 Glandinet ajoutée(s) à votre collection.')).toBeVisible()
  await expect(received).toContainText('Conclu')
  await collectionPage.goto()
  await expect(collectionPage.quantityOf('Glandinet')).toHaveText('1')

  await switchTo('dresseur')
  await collectionPage.goto()
  await expect(creatureCard(page, 'Glandinet')).toBeHidden()
})

test('le destinataire refuse : la carte reste au donneur', async ({
  page,
  newTradePage,
  tradesPage,
  collectionPage,
  switchTo,
}) => {
  await newTradePage.gift('Glandinet', 'Lina_42')

  await switchTo('lina')
  await tradesPage.goto()
  await tradesPage.tab('Dons').click()
  const received = tradesPage.gift('Reçu de Dresseur')
  await received.getByRole('button', { name: 'Refuser' }).click()
  await expect(received).toContainText('Refusé')

  await switchTo('dresseur')
  await collectionPage.goto()
  await expect(collectionPage.quantityOf('Glandinet')).toHaveText('1')
  await tradesPage.goto()
  await tradesPage.tab('Dons').click()
  await expect(tradesPage.gift('Offert à Lina_42')).toContainText('Refusé')
  await expect(page.getByRole('button', { name: 'Annuler' })).toBeHidden()
})

test('le donneur annule son don tant qu’il est en attente', async ({
  newTradePage,
  tradesPage,
  switchTo,
}) => {
  await newTradePage.gift('Glandinet', 'Lina_42')

  await tradesPage.goto()
  await tradesPage.tab('Dons').click()
  const sent = tradesPage.gift('Offert à Lina_42')
  await sent.getByRole('button', { name: 'Annuler' }).click()
  await expect(sent).toContainText('Annulé')

  await switchTo('lina')
  await tradesPage.goto()
  await tradesPage.tab('Dons').click()
  await expect(tradesPage.gift('Reçu de Dresseur')).toContainText('Annulé')
  await expect(tradesPage.gift('Reçu de Dresseur').getByRole('button', { name: 'Accepter' })).toBeHidden()
})

test('on ne peut pas offrir une carte que l’on ne possède pas', async ({ page, newTradePage }) => {
  await newTradePage.mode('Par carte').click()
  await newTradePage.chooseCard('Brumel').click()
  await newTradePage.cardAction('Faire un don').click()

  await expect(page.getByText('Vous ne possédez pas Brumel')).toBeVisible()
  await expect(newTradePage.giftSubmit).toBeHidden()
})

test('un don échoue si la carte n’est plus là au moment d’accepter (P-15)', async ({
  page,
  newTradePage,
  tradesPage,
  switchTo,
}) => {
  // Le seul Glandinet de Dresseur est offert à deux joueurs.
  await newTradePage.gift('Glandinet', 'Lina_42')
  await newTradePage.goto()
  await newTradePage.gift('Glandinet', 'Noe')

  await switchTo('lina')
  await tradesPage.goto()
  await tradesPage.tab('Dons').click()
  await tradesPage.gift('Reçu de Dresseur').getByRole('button', { name: 'Accepter' }).click()
  await expect(tradesPage.gift('Reçu de Dresseur')).toContainText('Conclu')

  await switchTo('noe')
  await tradesPage.goto()
  await tradesPage.tab('Dons').click()
  await tradesPage.gift('Reçu de Dresseur').getByRole('button', { name: 'Accepter' }).click()

  await expect(toast(page, 'Ce don a échoué : la carte n’est plus disponible.')).toBeVisible()
  await expect(tradesPage.gift('Reçu de Dresseur')).toContainText('Échoué')
})
