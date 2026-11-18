/** A-01, A-03, A-04, A-07, A-12 : accès au dashboard et comptes administrateur. */
import { admins } from '../../fixtures/accounts.ts'
import { test, expect } from '../../fixtures/admin.ts'
import { toast } from '../../pages/forms.ts'

test.describe('accès (A-01, A-04)', () => {
  test('un joueur se voit refuser l’accès administrateur', async ({
    page,
    loginPage,
    forbiddenPage,
  }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/connexion/)

    await loginPage.demoAccount('Joueur (refusé)').click()
    await loginPage.submit.click()

    await expect(forbiddenPage.title).toBeVisible()
    await expect(page.getByText('Le compte Dresseur est un compte joueur.')).toBeVisible()
  })

  test('un administrateur consulte les statistiques', { tag: '@smoke' }, async ({
    signIn,
    dashboardPage,
  }) => {
    await signIn('admin')

    await expect(dashboardPage.title).toBeVisible()
    for (const label of [
      'Inscrits · total',
      'Inscrits · période',
      'Boosters · période',
      'Échanges finalisés · période',
    ]) {
      await expect(dashboardPage.kpi(label)).toBeVisible()
    }
  })

  test('une page demandée sans être connecté s’ouvre après la connexion', async ({
    page,
    loginPage,
    playersPage,
  }) => {
    await page.goto('/joueurs')
    await expect(page).toHaveURL(/\/connexion\?redirect=/)

    await loginPage.signIn(admins.admin)

    await expect(page).toHaveURL(/\/joueurs/)
    await expect(playersPage.title).toBeVisible()
  })

  test('de mauvais identifiants sont refusés', async ({ loginPage }) => {
    await loginPage.goto()
    await loginPage.signIn({ login: 'admin', password: 'pas-le-bon' })

    await expect(loginPage.error).toBeVisible()
  })
})

test.describe('comptes administrateur (A-03, A-07, A-12)', () => {
  test('un admin crée un compte ; le nouvel admin doit changer son mot de passe provisoire', async ({
    page,
    signIn,
    shell,
    adminsPage,
    switchTo,
    changePasswordPage,
    dashboardPage,
  }) => {
    await signIn('admin')
    await shell.open('Administrateurs')
    await adminsPage.pseudo.fill('Zoe')
    await adminsPage.login.fill('zoe')
    await adminsPage.create.click()

    // Le serveur génère le mot de passe provisoire, affiché une seule fois.
    await expect(adminsPage.createdPassword).toBeVisible()
    const zoe = { login: 'zoe', password: (await adminsPage.createdPassword.textContent())!.trim(), pseudo: 'Zoe' }

    await expect(adminsPage.account('Zoe')).toContainText('Identifiant : zoe')
    await expect(adminsPage.account('Zoe')).toContainText('par Admin')

    await switchTo(zoe)
    await expect(page).toHaveURL(/\/mot-de-passe$/)
    await expect(changePasswordPage.title).toBeVisible()
    await expect(page.getByText('Bonjour Zoe.')).toBeVisible()

    await changePasswordPage.form.change(zoe.password, 'definitif-123456')
    await expect(toast(page, 'Mot de passe enregistré.')).toBeVisible()
    await expect(dashboardPage.title).toBeVisible()
  })

  test('le mot de passe provisoire n’est affiché qu’une fois', async ({ signIn, shell, adminsPage }) => {
    await signIn('admin')
    await shell.open('Administrateurs')
    await adminsPage.pseudo.fill('Court')
    await adminsPage.login.fill('court')
    await adminsPage.create.click()
    await expect(adminsPage.createdPassword).toHaveText(/^\S{12,}$/)

    await adminsPage.hideCreated.click()
    await expect(adminsPage.createdPassword).toHaveCount(0)
    await expect(adminsPage.account('Court')).toContainText('mot de passe provisoire')
  })

  test('un admin change son mot de passe depuis « Mon compte »', async ({
    page,
    signIn,
    shell,
    accountPage,
    switchTo,
    dashboardPage,
  }) => {
    await signIn('admin')
    await shell.account.click()
    await expect(accountPage.title).toBeVisible()

    await accountPage.password.change(admins.admin.password, 'nouveau-mot-de-passe-admin')
    await expect(toast(page, 'Mot de passe changé.')).toBeVisible()

    await switchTo({ ...admins.admin, password: 'nouveau-mot-de-passe-admin' })
    await expect(dashboardPage.title).toBeVisible()
  })
})
