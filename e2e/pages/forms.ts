/** Formulaires et composants communs au site joueur et au dashboard admin (packages/shared/src/ui). */
import type { Locator, Page } from '@playwright/test'

/** Formulaire de connexion. */
export class LoginForm {
  readonly login: Locator
  readonly password: Locator
  readonly submit: Locator
  readonly error: Locator

  constructor(readonly page: Page) {
    this.login = page.getByLabel('Identifiant', { exact: true })
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

/** Changement de mot de passe (`PasswordChangeForm`). */
export class PasswordChangeForm {
  readonly current: Locator
  readonly next: Locator
  readonly confirm: Locator
  readonly submit: Locator

  constructor(readonly page: Page) {
    this.current = page.getByLabel('Mot de passe actuel', { exact: true })
    this.next = page.getByLabel('Nouveau mot de passe', { exact: true })
    this.confirm = page.getByLabel('Confirmer le nouveau mot de passe', { exact: true })
    this.submit = page.getByRole('button', { name: 'Changer le mot de passe' })
  }

  async change(current: string, next: string) {
    await this.current.fill(current)
    await this.next.fill(next)
    await this.confirm.fill(next)
    await this.submit.click()
  }
}

/** Suppression de son propre compte (`AccountDeletePanel`). */
export class AccountDeletePanel {
  readonly start: Locator
  readonly password: Locator
  readonly confirm: Locator

  constructor(readonly page: Page) {
    this.start = page.getByRole('button', { name: 'Supprimer mon compte' })
    this.password = page.getByLabel('Mot de passe, pour confirmer')
    this.confirm = page.getByRole('button', { name: 'Supprimer définitivement' })
  }

  async deleteWith(password: string) {
    await this.start.click()
    await this.password.fill(password)
    await this.confirm.click()
  }
}

/** Notifications éphémères en haut de l'écran (`ToastHost`). */
export function toast(page: Page, text: string | RegExp): Locator {
  return page.getByRole('status').filter({ hasText: text })
}
