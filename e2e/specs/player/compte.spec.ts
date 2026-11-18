/** P-16 à P-18 : mot de passe, suppression du compte, page introuvable. */
import { players } from '../../fixtures/accounts.ts'
import { test, expect } from '../../fixtures/player.ts'
import { toast } from '../../pages/forms.ts'

const NEW_PASSWORD = 'mon-nouveau-mot-de-passe'

test.describe('mot de passe (P-16)', () => {
  test('changer son mot de passe puis se reconnecter avec le nouveau', async ({
    page,
    signIn,
    signOut,
    profilePage,
    loginPage,
  }) => {
    await signIn('dresseur')
    await profilePage.goto()
    await profilePage.password.change(players.dresseur.password, NEW_PASSWORD)
    await expect(toast(page, 'Mot de passe changé.')).toBeVisible()

    await signOut()
    await loginPage.goto()
    await loginPage.signIn(players.dresseur)
    await expect(loginPage.error).toHaveText('Identifiant ou mot de passe incorrect.')

    await loginPage.signIn({ login: players.dresseur.login, password: NEW_PASSWORD })
    await expect(page).toHaveURL(/\/accueil$/)
  })

  test('un mot de passe actuel erroné est refusé', async ({ page, signIn, profilePage }) => {
    await signIn('dresseur')
    await profilePage.goto()
    await profilePage.password.change('pas-le-bon-mot-de-passe', NEW_PASSWORD)

    await expect(page.getByText('Mot de passe incorrect.')).toBeVisible()
  })
})

test.describe('suppression du compte (P-17)', () => {
  test('le joueur supprime son compte et ne peut plus se connecter', async ({
    page,
    signIn,
    profilePage,
    loginPage,
  }) => {
    await signIn('noe')
    await profilePage.goto()
    await profilePage.deletion.deleteWith(players.noe.password)

    await expect(toast(page, 'Votre compte a été supprimé.')).toBeVisible()
    await expect(page).toHaveURL(/\/$/)

    await loginPage.goto()
    await loginPage.signIn(players.noe)
    await expect(loginPage.error).toHaveText('Identifiant ou mot de passe incorrect.')
  })

  test('la suppression demande le bon mot de passe', async ({ page, signIn, profilePage }) => {
    await signIn('noe')
    await profilePage.goto()
    await profilePage.deletion.deleteWith('pas-le-bon-mot-de-passe')

    await expect(page.getByText('Mot de passe incorrect.')).toBeVisible()
    await expect(page).toHaveURL(/\/profil$/)
  })
})

test('une adresse inconnue affiche la page introuvable (P-18)', async ({ page, notFoundPage }) => {
  await page.goto('/cette-page-n-existe-pas')

  await expect(notFoundPage.title).toBeVisible()
  await notFoundPage.home.click()
  await expect(page).toHaveURL(/\/$/)
})
