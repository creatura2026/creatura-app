/** P-01 à P-03 : inscription, connexion, déconnexion, inactivité. */
import { players } from '../../fixtures/accounts.ts'
import { test, expect } from '../../fixtures/player.ts'
import { toast } from '../../pages/forms.ts'

test.describe('inscription (P-01)', () => {
  test(
    'un visiteur crée son compte et arrive sur son premier booster',
    { tag: ['@smoke', '@mobile'] },
    async ({ page, landingPage, registerPage, homePage }) => {
      await landingPage.goto()
      await landingPage.signUpLink.click()

      await registerPage.register({
        pseudo: 'Sacha',
        login: 'sacha',
        password: 'un-mot-de-passe-solide',
      })

      await expect(page).toHaveURL(/\/booster$/)
      await expect(toast(page, 'Bienvenue Sacha !')).toBeVisible()
      await homePage.goto()
      await expect(homePage.greeting).toHaveText('Bonjour, Sacha !')
    },
  )

  test('un identifiant déjà utilisé est refusé', async ({ page, registerPage }) => {
    await registerPage.goto()
    await registerPage.register({
      pseudo: 'Nouveau',
      login: players.dresseur.login,
      password: 'un-mot-de-passe-solide',
    })

    await expect(page.getByText('Cet identifiant est déjà utilisé.')).toBeVisible()
    await expect(page).toHaveURL(/\/inscription$/)
  })

  test('un pseudonyme déjà pris est refusé', async ({ page, registerPage }) => {
    await registerPage.goto()
    await registerPage.register({
      pseudo: players.lina.pseudo,
      login: 'autre-login',
      password: 'un-mot-de-passe-solide',
    })

    await expect(page.getByText('Ce pseudonyme est déjà pris.')).toBeVisible()
  })

  test('un mot de passe trop court est signalé avant l’envoi', async ({ page, registerPage }) => {
    await registerPage.goto()
    await registerPage.register({ pseudo: 'Court', login: 'court', password: 'abc' })

    await expect(page.getByText('Au moins 12 caractères.')).toBeVisible()
    await expect(page).toHaveURL(/\/inscription$/)
  })
})

test.describe('connexion et déconnexion (P-02)', () => {
  test(
    'un visiteur découvre Créatura puis se connecte avec le compte de démonstration',
    { tag: ['@smoke', '@mobile'] },
    async ({ page, landingPage, loginPage, homePage }) => {
      await landingPage.goto()
      await expect(landingPage.title).toHaveText('CREATURA')

      await landingPage.signInLink.click()
      await loginPage.demoAccount('Dresseur').click()
      await loginPage.submit.click()

      await expect(page).toHaveURL(/\/accueil$/)
      await expect(homePage.greeting).toContainText('Dresseur')
    },
  )

  test('un mauvais mot de passe affiche une erreur qui ne dit pas quel champ est faux', async ({
    page,
    loginPage,
  }) => {
    await loginPage.goto()
    await loginPage.signIn({ login: players.dresseur.login, password: 'mauvais-mot-de-passe' })

    await expect(loginPage.error).toHaveText('Identifiant ou mot de passe incorrect.')
    await expect(page).toHaveURL(/\/connexion$/)
  })

  test('les champs vides sont signalés', async ({ page, loginPage }) => {
    await loginPage.goto()
    await loginPage.submit.click()

    await expect(page.getByText('Saisissez votre identifiant.')).toBeVisible()
    await expect(page.getByText('Saisissez votre mot de passe.')).toBeVisible()
  })

  test('une page réservée renvoie vers la connexion, puis y ramène', async ({
    page,
    loginPage,
  }) => {
    await page.goto('/collection')
    await expect(page).toHaveURL(/\/connexion\?redirect=/)

    await loginPage.signIn(players.dresseur)

    await expect(page).toHaveURL(/\/collection$/)
  })

  test('un joueur connecté se déconnecte depuis son profil', async ({
    page,
    signIn,
    profilePage,
    landingPage,
  }) => {
    await signIn('lina')

    await profilePage.goto()
    await profilePage.signOutButton.click()

    await expect(page).toHaveURL(/\/$/)
    await expect(landingPage.title).toHaveText('CREATURA')
    await page.goto('/accueil')
    await expect(page).toHaveURL(/\/connexion/)
  })
})

test.describe('inactivité (P-03)', () => {
  test('sans action pendant 20 minutes, le joueur est prévenu puis déconnecté', async ({
    page,
    signIn,
  }) => {
    await page.clock.install()
    await signIn('dresseur')

    // Avertissement 30 s avant l'échéance
    await page.clock.fastForward('19:40')
    const warning = page.getByRole('alertdialog')
    await expect(warning).toBeVisible()

    await page.clock.fastForward('00:30')
    await expect(page).toHaveURL(/\/connexion\?.*expired=idle/)
    await expect(
      page.getByText('Vous avez été déconnecté après 20 min sans activité. Reconnectez-vous.'),
    ).toBeVisible()
  })

  test('« Rester connecté » repousse la déconnexion', async ({ page, signIn }) => {
    await page.clock.install()
    await signIn('dresseur')

    await page.clock.fastForward('19:40')
    await page.getByRole('button', { name: 'Rester connecté' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()

    await page.clock.fastForward('05:00')
    await expect(page).toHaveURL(/\/accueil$/)
  })
})
