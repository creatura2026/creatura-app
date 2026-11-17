import { test, expect } from '../../fixtures/player.ts'

test(
  'un visiteur découvre Créatura puis se connecte avec le compte de démonstration',
  { tag: '@smoke' },
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
})
