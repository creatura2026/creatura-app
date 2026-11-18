/**
 * Page objects du dashboard admin (apps/admin).
 *
 * L'API simulée de l'admin garde ses données EN MÉMOIRE : un rechargement (`page.goto`) remet les
 * comptes créés et les demandes de suppression à zéro. Dans un parcours qui modifie des données,
 * on navigue donc par le menu (`AdminShell.open`) plutôt que par l'adresse.
 */
import type { Locator, Page } from '@playwright/test'

import { AccountDeletePanel, LoginForm, PasswordChangeForm } from './forms.ts'

export class AdminLoginPage extends LoginForm {
  async goto() {
    await this.page.goto('/connexion')
  }
}

type NavItem =
  | 'Statistiques'
  | 'Échanges'
  | 'Raretés'
  | 'Cartes'
  | 'Réglages booster'
  | 'Joueurs'
  | 'Administrateurs'

/** Menu latéral et pied du menu (compte, déconnexion). */
export class AdminShell {
  readonly nav: Locator
  readonly signOut: Locator
  readonly account: Locator

  constructor(readonly page: Page) {
    this.nav = page.getByRole('navigation', { name: 'Navigation du dashboard' })
    this.signOut = page.getByRole('button', { name: 'Se déconnecter' })
    this.account = page.getByRole('link', { name: 'Mon compte' })
  }

  async open(item: NavItem) {
    await this.nav.getByRole('link', { name: new RegExp(`^${item}`) }).click()
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

export class ChangePasswordPage {
  readonly title: Locator
  readonly form: PasswordChangeForm

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { name: 'Choisissez votre mot de passe' })
    this.form = new PasswordChangeForm(page)
  }
}

export class PlayersPage {
  readonly title: Locator
  readonly search: Locator
  readonly requestDeletion: Locator
  readonly rows: Locator
  readonly toValidate: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { name: 'Joueurs', exact: true })
    this.search = page.getByRole('searchbox', { name: 'Rechercher un joueur' })
    this.requestDeletion = page.getByRole('main').getByRole('button', { name: /^Demander la suppression/ })
    this.rows = page.getByRole('table').getByRole('row')
    this.toValidate = page.getByRole('list', { name: 'Demandes de suppression qui attendent ma décision' })
  }

  row(pseudo: string): Locator {
    return this.rows.filter({ has: this.page.getByRole('link', { name: pseudo, exact: true }) })
  }

  select(pseudo: string): Locator {
    return this.page.getByRole('checkbox', { name: `Sélectionner ${pseudo}` })
  }
}

export class PlayerDetailPage {
  readonly title: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { level: 1 })
  }

  kpi(label: string): Locator {
    return this.page.getByText(label, { exact: true })
  }
}

/** Fenêtre « Demander la suppression » (`DeletionRequestDialog`). */
export class DeletionRequestDialog {
  readonly dialog: Locator
  readonly validator: Locator
  readonly reason: Locator
  readonly send: Locator

  constructor(readonly page: Page) {
    this.dialog = page.getByRole('dialog', { name: 'Demander la suppression' })
    this.validator = this.dialog.getByLabel('Administrateur qui valide')
    this.reason = this.dialog.getByLabel('Motif (facultatif)')
    this.send = this.dialog.getByRole('button', { name: 'Envoyer la demande' })
  }
}

export class AdminsPage {
  readonly title: Locator
  readonly accounts: Locator
  readonly pseudo: Locator
  readonly login: Locator
  readonly create: Locator
  /** Mot de passe provisoire généré par le serveur, affiché une seule fois après la création. */
  readonly createdPassword: Locator
  readonly hideCreated: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { name: 'Administrateurs', exact: true })
    this.accounts = page.getByRole('list', { name: 'Comptes administrateur' }).getByRole('listitem')
    const form = page.getByRole('form', { name: 'Créer un administrateur' })
    this.pseudo = form.getByLabel('Pseudonyme')
    this.login = form.getByLabel('Identifiant de connexion')
    this.create = form.getByRole('button', { name: 'Créer le compte' })
    this.createdPassword = form.getByRole('status').locator('code')
    this.hideCreated = form.getByRole('button', { name: /J.ai transmis le mot de passe/ })
  }

  account(pseudo: string): Locator {
    return this.accounts.filter({ hasText: pseudo })
  }
}

export class CreaturesPage {
  readonly title: Locator
  readonly name: Locator
  readonly family: Locator
  readonly rarity: Locator
  readonly stock: Locator
  readonly description: Locator
  readonly image: Locator
  readonly preview: Locator
  readonly add: Locator
  readonly search: Locator
  readonly list: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { name: 'Cartes', exact: true })
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Ajouter une carte' }) })
    // Les étiquettes entourent leur champ : le nom d'une liste déroulante inclut ses options.
    this.name = form.getByRole('textbox', { name: 'Nom', exact: true })
    this.family = form.getByRole('combobox', { name: /^Famille/ })
    this.rarity = form.getByRole('combobox', { name: /^Rareté/ })
    this.stock = form.getByRole('spinbutton', { name: /^Nombre d'exemplaires/ })
    this.description = form.getByRole('textbox', { name: 'Description', exact: true })
    this.image = form.locator('input[type="file"]')
    this.preview = form.getByRole('article')
    this.add = form.getByRole('button', { name: 'Ajouter au prochain minuit' })
    this.search = page.getByRole('searchbox').and(page.getByPlaceholder('Rechercher'))
    this.list = page.getByRole('main').locator('ul > li')
  }

  item(name: string): Locator {
    return this.list.filter({ has: this.page.locator('p.font-bold', { hasText: name }) })
  }
}

export class SettingsPage {
  readonly title: Locator
  readonly value: Locator
  readonly more: Locator
  readonly less: Locator
  readonly save: Locator
  readonly scheduled: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { name: 'Réglages du booster' })
    this.value = page.locator('output[for="cards-range"]')
    this.more = page.getByRole('button', { name: 'Une carte de plus' })
    this.less = page.getByRole('button', { name: 'Une carte de moins' })
    this.save = page.getByRole('button', { name: 'Enregistrer' })
    this.scheduled = page.getByText(/Prévu le .*, minuit/)
  }

  weight(label: string): Locator {
    return this.page.getByRole('group', { name: 'Poids des raretés' }).getByLabel(label)
  }
}

export class RaritiesPage {
  readonly title: Locator
  readonly table: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { name: 'Distribution des raretés' })
    this.table = page.getByRole('table', { name: 'Détail par rareté' })
  }
}

export class AdminTradesPage {
  readonly title: Locator
  readonly status: Locator
  readonly player: Locator
  readonly count: Locator
  readonly rows: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { name: 'Échanges', exact: true })
    this.status = page.getByLabel('État')
    this.player = page.getByRole('combobox', { name: 'Joueur (proposant ou destinataire)' })
    this.count = page.getByText(/échanges? correspondants?$/)
    this.rows = page.getByRole('table').locator('tbody tr')
  }
}

export class AccountPage {
  readonly title: Locator
  readonly password: PasswordChangeForm
  readonly deletion: AccountDeletePanel

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { name: 'Mon compte' })
    this.password = new PasswordChangeForm(page)
    this.deletion = new AccountDeletePanel(page)
  }
}
