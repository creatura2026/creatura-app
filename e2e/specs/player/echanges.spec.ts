/**
 * P-07 à P-12 : échanges, sur l'API simulée.
 *
 * Sans serveur, l'autre joueur est SIMULÉ dans l'onglet (apps/player/src/api/mock/partner.ts) :
 * il pose une carte, répond à la discussion et valide quand il reçoit au moins autant de cartes
 * qu'il en donne. Les échanges entre deux vrais navigateurs (WebSocket) sont testés sur la stack
 * réelle (specs/realtime).
 *
 * Données de démonstration :
 *  - Lina_42 a ouvert un échange avec Dresseur et posé un Brumel (Dresseur est destinataire) ;
 *  - Dresseur a ouvert un échange avec Noe : Quartzou contre Ronceline, Noe a déjà validé.
 */
import { test, expect } from '../../fixtures/player.ts'
import { toast } from '../../pages/forms.ts'
import { creatureCard } from '../../pages/player.ts'

const TRADE_LINA = 'aaaaaaaa-0001-4000-8000-000000000001'

test.beforeEach(async ({ signIn }) => {
  await signIn('dresseur')
})

test.describe('ouvrir un échange (P-07, P-12)', () => {
  test('rechercher un joueur par son pseudonyme puis ouvrir la salle', { tag: '@mobile' }, async ({
    page,
    tradesPage,
    newTradePage,
    tradeRoomPage,
  }) => {
    await tradesPage.goto()
    await tradesPage.newTrade.click()

    await newTradePage.playerSearch.fill('mi')
    await newTradePage.player('Mina').click()
    await expect(page.getByRole('heading', { name: 'Les cartes de Mina' })).toBeVisible()
    await newTradePage.tradeWith('Mina').click()

    await expect(page).toHaveURL(/\/echanges\/[\w-]+$/)
    await expect(tradeRoomPage.title).toHaveText('Échange avec Mina')
  })

  test('une recherche sans résultat le dit', async ({ page, newTradePage }) => {
    await newTradePage.goto()
    await newTradePage.playerSearch.fill('zz')

    await expect(page.getByText('Aucun joueur ne s’appelle « zz… ».')).toBeVisible()
  })

  test('depuis la fiche d’une carte : l’échange retient la carte recherchée', async ({
    page,
    creaturePage,
    cataloguePage,
    tradeRoomPage,
  }) => {
    await cataloguePage.goto()
    await cataloguePage.open('Vapeline')
    await creaturePage.tradeWith('Lina_42').click()

    // Un échange est déjà ouvert avec Lina : on y revient, avec la carte recherchée.
    await expect(page).toHaveURL(new RegExp(`/echanges/${TRADE_LINA}$`))
    await expect(tradeRoomPage.title).toHaveText('Échange avec Lina_42')
  })

  test('un seul échange ouvert entre deux joueurs : « Échanger » rouvre le premier', async ({
    page,
    newTradePage,
  }) => {
    await newTradePage.goto()
    await newTradePage.playerSearch.fill('lin')
    await newTradePage.player('Lina_42').click()
    await newTradePage.tradeWith('Lina_42').click()

    await expect(page).toHaveURL(new RegExp(`/echanges/${TRADE_LINA}$`))
  })
})

test.describe('salle d’échange (P-08, P-10)', () => {
  test(
    'un échange une carte contre une carte, avec le dernier exemplaire, est conclu',
    { tag: '@smoke' },
    async ({ page, tradesPage, tradeRoomPage, collectionPage }) => {
      await tradesPage.goto()
      await tradesPage.trade('Lina_42').click()
      await expect(tradeRoomPage.title).toHaveText('Échange avec Lina_42')
      await expect(creatureCard(tradeRoomPage.theirMat, 'Brumel')).toBeVisible()

      // Lucioline : Dresseur n'en a qu'une, elle reste échangeable.
      await tradeRoomPage.put('Lucioline')
      await expect(creatureCard(tradeRoomPage.myMat, 'Lucioline')).toBeVisible()
      await tradeRoomPage.ready.click()

      await expect(tradeRoomPage.status).toHaveText(
        'Échange conclu : les cartes ont changé de collection.',
      )

      await collectionPage.goto()
      await expect(creatureCard(page, 'Lucioline')).toBeHidden()
      await expect(collectionPage.quantityOf('Brumel')).toHaveText('1')
    },
  )

  test('on ne peut pas valider tant que son tapis est vide', async ({
    newTradePage,
    tradeRoomPage,
  }) => {
    await newTradePage.goto()
    await newTradePage.playerSearch.fill('mina')
    await newTradePage.player('Mina').click()
    await newTradePage.tradeWith('Mina').click()

    await expect(tradeRoomPage.ready).toBeDisabled()
    await expect(tradeRoomPage.page.getByText('Une carte au moins de chaque côté.')).toBeVisible()

    // Mina pose une carte : il manque toujours celle de Dresseur.
    await expect(tradeRoomPage.chat.filter({ hasText: 'Je peux te proposer' })).toBeVisible()
    await expect(tradeRoomPage.ready).toBeDisabled()
  })

  test('modifier son tapis retire la validation de l’autre joueur', async ({
    tradesPage,
    tradeRoomPage,
  }) => {
    await tradesPage.goto()
    await tradesPage.trade('Noe').click()
    await expect(tradeRoomPage.status).toHaveText('Noe a validé. Validez pour conclure l’échange.')

    await tradeRoomPage.put('Moussou')

    await expect(tradeRoomPage.status).toHaveText('Quand l’échange vous convient, validez-le.')
    await expect(tradeRoomPage.ready).not.toBeChecked()
  })

  test('retirer une carte de son tapis', async ({ tradesPage, tradeRoomPage }) => {
    await tradesPage.goto()
    await tradesPage.trade('Noe').click()

    await tradeRoomPage.removeOne('Quartzou')

    await expect(creatureCard(tradeRoomPage.myMat, 'Quartzou')).toBeHidden()
    await expect(tradeRoomPage.status).toHaveText('Posez sur votre tapis les cartes que vous donnez.')
  })

  test('la discussion : l’autre joueur répond, et l’historique reste au retour', async ({
    page,
    tradesPage,
    tradeRoomPage,
  }) => {
    await tradesPage.goto()
    await tradesPage.trade('Lina_42').click()
    await expect(tradeRoomPage.chat.filter({ hasText: 'Ton Moussou m’intéresse' })).toBeVisible()

    await tradeRoomPage.say('Bonjour Lina')
    await expect(tradeRoomPage.chat.filter({ hasText: 'Bonjour Lina' })).toBeVisible()
    await expect(tradeRoomPage.chat.filter({ hasText: 'Salut !' })).toBeVisible()

    await page.reload()
    await expect(tradeRoomPage.chat.filter({ hasText: 'Bonjour Lina' })).toBeVisible()
  })
})

test.describe('abandon (P-11)', () => {
  test('le destinataire refuse : l’échange passe dans l’historique, rien ne bouge', async ({
    page,
    tradesPage,
    tradeRoomPage,
  }) => {
    await tradesPage.goto()
    await tradesPage.trade('Lina_42').click()

    await tradeRoomPage.abandon.click()
    await tradeRoomPage.confirmAbandon.click()

    await expect(toast(page, 'Vous avez abandonné l’échange. Aucune carte n’a bougé.')).toBeVisible()
    await expect(page).toHaveURL(/\/echanges$/)
    await expect(tradesPage.trade('Lina_42')).toBeHidden()

    await tradesPage.tab('Historique').click()
    await tradesPage.historyFilter('Refusés').click()
    await expect(tradesPage.trade('Lina_42').first()).toBeVisible()
  })

  test('le proposant annule son échange', async ({ tradesPage, tradeRoomPage }) => {
    await tradesPage.goto()
    await tradesPage.trade('Noe').click()

    await tradeRoomPage.abandon.click()
    await tradeRoomPage.confirmAbandon.click()

    await tradesPage.tab('Historique').click()
    await tradesPage.historyFilter('Annulés').click()
    await expect(tradesPage.trade('Noe')).toBeVisible()
  })

  test('« Continuer » annule l’abandon', async ({ page, tradesPage, tradeRoomPage }) => {
    await tradesPage.goto()
    await tradesPage.trade('Noe').click()

    await tradeRoomPage.abandon.click()
    await page.getByRole('button', { name: 'Continuer' }).click()

    await expect(tradeRoomPage.abandon).toBeVisible()
    await expect(tradeRoomPage.ready).toBeEnabled()
  })
})
