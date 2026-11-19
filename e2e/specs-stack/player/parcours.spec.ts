/**
 * Parcours joueur sur la vraie API : P-01, P-02, P-04, P-14 à P-17.
 * Chaque test crée ses joueurs par l'API (voir stack/api.ts).
 */
import { test, expect } from '../../fixtures/stack.ts'
import { toast } from '../../pages/forms.ts'
import { LandingPage, NewTradePage, PlayerLoginPage, RegisterPage } from '../../pages/player.ts'
import { ApiError, newPlayer, PASSWORD, signIn, uniquePseudo } from '../../stack/api.ts'

test('P-01, P-02 : s’inscrire, se déconnecter, se reconnecter', { tag: '@smoke' }, async ({ page }) => {
  const pseudo = uniquePseudo('Sacha')
  const account = { pseudo, login: pseudo.toLowerCase(), password: PASSWORD }

  const register = new RegisterPage(page)
  await register.goto()
  await register.register(account)
  await expect(page).toHaveURL(/\/booster$/)

  await page.goto('/profil')
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(new LandingPage(page).title).toHaveText('CREATURA')

  const login = new PlayerLoginPage(page)
  await login.goto()
  await login.signIn({ login: 'sacha-inconnu', password: PASSWORD })
  await expect(login.error).toHaveText('Identifiant ou mot de passe incorrect.')
  await login.signIn(account)
  await expect(page).toHaveURL(/\/accueil$/)
})

test('P-04 : le booster du jour ajoute ses cartes à la collection, une seule fois par jour', async ({
  openPlayer,
}) => {
  const player = await openPlayer(await newPlayer('Boost', { withCards: false }))

  await player.booster.goto()
  await player.booster.openAndReveal()
  await expect(player.booster.cards).toHaveCount(5)

  const total = (await player.account.collection()).reduce((sum, e) => sum + e.quantity, 0)
  expect(total).toBe(5)

  await player.page.reload()
  await expect(player.booster.openButton).toBeHidden()
  await expect(player.booster.nextBooster).toBeVisible()
  await expect(player.account.claimBooster()).rejects.toMatchObject({ status: 409 })
})

test('P-14 : un don offert à l’écran est accepté par le destinataire', async ({ openPlayer }) => {
  const [alice, bob] = await Promise.all([openPlayer(await newPlayer('Alice')), openPlayer(await newPlayer('Bob'))])
  const card = await alice.account.oneCard()
  const bobBefore = await bob.account.quantityOf(card.id)

  const newTrade = new NewTradePage(alice.page)
  await newTrade.goto()
  await newTrade.gift(card.name, bob.account.pseudo)

  await bob.trades.goto()
  await bob.trades.tab('Dons').click()
  const received = bob.trades.gift(`Reçu de ${alice.account.pseudo}`)
  await received.getByRole('button', { name: 'Accepter' }).click()

  await expect(toast(bob.page, `ajoutée(s) à votre collection`)).toBeVisible()
  expect(await bob.account.quantityOf(card.id)).toBe(bobBefore + 1)
})

test('P-15 : un don échoue si la carte est déjà partie chez quelqu’un d’autre', async ({ openPlayer }) => {
  const alice = await newPlayer('Alice')
  const [bob, carl] = await Promise.all([newPlayer('Bob', { withCards: false }), newPlayer('Carl', { withCards: false })])
  const card = await alice.oneCard({ single: true })
  const owned = await alice.quantityOf(card.id)

  // Les mêmes exemplaires offerts à Bob et à Carl ; Bob accepte le premier.
  const toBob = await alice.gift(bob, card.id, owned)
  await alice.gift(carl, card.id, owned)
  await bob.post(`/gifts/${toBob.id}/accept`)

  const carlSession = await openPlayer(carl)
  await carlSession.trades.goto()
  await carlSession.trades.tab('Dons').click()
  const received = carlSession.trades.gift(`Reçu de ${alice.pseudo}`)
  await received.getByRole('button', { name: 'Accepter' }).click()

  await expect(toast(carlSession.page, 'Ce don a échoué : la carte n’est plus disponible.')).toBeVisible()
  await expect(received).toContainText('Échoué')
  expect(await carl.quantityOf(card.id)).toBe(0)
})

test('P-16 : changer son mot de passe déconnecte ses autres sessions', async ({ openPlayer }) => {
  const account = await newPlayer('Mdp', { withCards: false })
  const here = await openPlayer(account)
  const elsewhere = await openPlayer(account)
  // Le serveur révoque les jetons émis AVANT le changement, à la seconde près : une session ouverte
  // dans la même seconde survivrait. On laisse passer cette seconde.
  // eslint-disable-next-line playwright/no-wait-for-timeout -- seconde de révocation du serveur
  await here.page.waitForTimeout(1_100)

  await here.profile.goto()
  await here.profile.password.change(PASSWORD, 'nouveau-mot-de-passe-e2e')
  await expect(toast(here.page, 'Mot de passe changé.')).toBeVisible()

  // L'autre navigateur est renvoyé vers la connexion à sa prochaine action.
  await elsewhere.collection.goto()
  await expect(elsewhere.page).toHaveURL(/\/connexion/)
  await expect(signIn({ login: account.login, password: PASSWORD })).rejects.toBeInstanceOf(ApiError)
  await signIn({ login: account.login, password: 'nouveau-mot-de-passe-e2e' })
})

test('P-17 : un compte supprimé apparaît comme « Joueur supprimé » chez l’autre joueur', async ({
  openPlayer,
}) => {
  const [alice, bob] = await Promise.all([newPlayer('Alice'), newPlayer('Bob')])
  // Un échange terminé entre eux : Bob refuse.
  const trade = await alice.openTrade(bob)
  await bob.post(`/trades/${trade.id}/refuse`)

  const aliceSession = await openPlayer(alice)
  await aliceSession.profile.goto()
  await aliceSession.profile.deletion.deleteWith(PASSWORD)
  await expect(toast(aliceSession.page, 'Votre compte a été supprimé.')).toBeVisible()
  await expect(signIn(alice.credentials)).rejects.toBeInstanceOf(ApiError)

  const bobSession = await openPlayer(bob)
  await bobSession.trades.goto()
  await bobSession.trades.tab('Historique').click()
  await expect(bobSession.trades.trade('Joueur supprimé')).toBeVisible()
})
