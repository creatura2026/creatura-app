import type { Locator, Page } from '@playwright/test'

/** Formulaire de connexion, le même sur le site joueur et sur le dashboard admin. */
export class LoginForm {
  readonly login: Locator
  readonly password: Locator
  readonly submit: Locator
  readonly error: Locator

  constructor(readonly page: Page) {
    this.login = page.getByLabel('Identifiant')
    this.password = page.getByLabel('Mot de passe', { exact: true })
    this.submit = page.getByRole('button', { name: 'Connexion', exact: true })
    this.error = page.getByRole('alert')
  }

  /** Bouton de l'encart « Comptes de démonstration » (API simulée seulement). */
  demoAccount(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true })
  }

  async signIn(credentials: { login: string; password: string }) {
    await this.login.fill(credentials.login)
    await this.password.fill(credentials.password)
    await this.submit.click()
  }
}
