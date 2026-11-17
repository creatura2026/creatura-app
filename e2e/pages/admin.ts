/** Page objects du dashboard admin. */
import type { Locator, Page } from '@playwright/test'

import { LoginForm } from './LoginForm.ts'

export class AdminLoginPage extends LoginForm {
  async goto() {
    await this.page.goto('/connexion')
  }
}

export class DashboardPage {
  readonly title: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { name: 'Piloter Créatura' })
  }

  /** Tuile de statistique, par son libellé (« Inscrits · total »…). */
  kpi(label: string): Locator {
    return this.page.getByText(label, { exact: true })
  }

  async goto() {
    await this.page.goto('/')
  }
}

export class ForbiddenPage {
  readonly title: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { name: 'Accès refusé' })
  }
}
