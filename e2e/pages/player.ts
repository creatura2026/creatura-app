/** Page objects du site joueur. */
import type { Locator, Page } from '@playwright/test'

import { LoginForm } from './LoginForm.ts'

export class LandingPage {
  readonly title: Locator
  readonly signInLink: Locator
  readonly signUpLink: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { level: 1 })
    this.signInLink = page.getByRole('link', { name: 'J’ai déjà un compte' })
    this.signUpLink = page.getByRole('link', { name: 'Créer un compte' }).first()
  }

  async goto() {
    await this.page.goto('/')
  }
}

export class PlayerLoginPage extends LoginForm {
  async goto() {
    await this.page.goto('/connexion')
  }
}

export class HomePage {
  readonly greeting: Locator

  constructor(readonly page: Page) {
    this.greeting = page.getByRole('heading', { level: 1 })
  }

  async goto() {
    await this.page.goto('/accueil')
  }
}

export class ProfilePage {
  readonly signOutButton: Locator

  constructor(readonly page: Page) {
    this.signOutButton = page.getByRole('button', { name: 'Se déconnecter' })
  }

  async goto() {
    await this.page.goto('/profil')
  }
}
