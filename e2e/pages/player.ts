/** Page objects du site joueur (apps/player). */
import { expect, type Locator, type Page } from '@playwright/test'

import { AccountDeletePanel, LoginForm, PasswordChangeForm, toast } from './forms.ts'

export class LandingPage {
  readonly title: Locator
  readonly signInLink: Locator
  readonly signUpLink: Locator
  readonly windowsDownload: Locator
  readonly androidDownload: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { level: 1 })
    this.signInLink = page.getByRole('link', { name: 'J’ai déjà un compte' })
    this.signUpLink = page.getByRole('link', { name: 'Créer un compte' })
    this.windowsDownload = page.getByRole('link', { name: 'Télécharger pour Windows' }).first()
    this.androidDownload = page.getByRole('link', { name: 'Télécharger pour Android' })
  }

  async goto() {
    await this.page.goto('/')
  }
}

export class PlayerLoginPage extends LoginForm {
  async goto(query = '') {
    await this.page.goto(`/connexion${query}`)
  }
}

export class RegisterPage {
  readonly pseudo: Locator
  readonly login: Locator
  readonly password: Locator
  readonly submit: Locator

  constructor(readonly page: Page) {
    this.pseudo = page.getByLabel('Pseudonyme')
    this.login = page.getByLabel('Identifiant de connexion')
    this.password = page.getByLabel('Mot de passe', { exact: true })
    this.submit = page.getByRole('button', { name: 'Créer le compte' })
  }

  async goto() {
    await this.page.goto('/inscription')
  }

  async register(account: { pseudo: string; login: string; password: string }) {
    await this.pseudo.fill(account.pseudo)
    await this.login.fill(account.login)
    await this.password.fill(account.password)
    await this.submit.click()
  }
}

export class HomePage {
  readonly greeting: Locator
  readonly boosterTile: Locator

  constructor(readonly page: Page) {
    this.greeting = page.getByRole('heading', { level: 1 })
    this.boosterTile = page.getByRole('link', { name: /Booster du jour/ })
  }

  async goto() {
    await this.page.goto('/accueil')
  }
}

export class BoosterPage {
  readonly openButton: Locator
  readonly revealAll: Locator
  readonly cards: Locator
  readonly toCollection: Locator
  readonly nextBooster: Locator
  readonly rates: Locator

  constructor(readonly page: Page) {
    this.openButton = page.getByRole('button', { name: 'Ouvrir sans déchirer' })
    this.revealAll = page.getByRole('button', { name: 'Tout révéler' })
    this.cards = page.getByRole('list', { name: 'Cartes du booster' }).getByRole('listitem')
    this.toCollection = page.getByRole('link', { name: 'Voir ma collection' })
    this.nextBooster = page.getByText(/Prochain booster dans /)
    this.rates = page.getByRole('complementary').getByRole('listitem')
  }

  async goto() {
    await this.page.goto('/booster')
  }

  /**
   * Ouvre le booster du jour et révèle toutes ses cartes.
   *
   * Pendant l'ouverture, l'écran montre un instant « Voir ma collection » (les données du jour,
   * rechargées, contiennent déjà le booster), puis la pile à révéler. Seul « Tout révéler » signale
   * que l'ouverture est terminée.
   */
  async openAndReveal() {
    // La mise en page bouge au chargement (probabilités, hauteur du cadre) : on attend qu'elle soit
    // en place, sinon le clic peut tomber à côté du bouton.
    await expect(this.rates).toHaveCount(4)
    await expect(async () => {
      // Pendant une ouverture le bouton est désactivé : on ne reclique que si le clic précédent
      // n'a rien lancé (deux ouvertures simultanées ouvriraient deux boosters dans l'API simulée).
      if ((await this.openButton.isVisible()) && (await this.openButton.isEnabled())) {
        await this.openButton.click({ timeout: 2_000 })
      }
      await expect(this.revealAll).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 20_000 })
    await this.revealAll.click()
    await expect(this.toCollection).toBeVisible()
  }
}

/** Barre de recherche et filtres (`CreatureFilters`), sur le catalogue et la collection. */
class CreatureFilters {
  readonly search: Locator
  readonly family: Locator
  readonly rarity: Locator

  constructor(readonly page: Page) {
    this.search = page.getByRole('searchbox', { name: 'Rechercher une créature' })
    this.family = page.getByLabel('Famille', { exact: true })
    this.rarity = page.getByLabel('Rareté', { exact: true })
  }
}

/** Carte d'une créature (`CreatureCard`), par son nom accessible. */
export function creatureCard(scope: Page | Locator, name: string, missing = false): Locator {
  return scope.getByRole('article', { name: missing ? `${name}, non possédée` : name, exact: true })
}

export class CataloguePage extends CreatureFilters {
  readonly count: Locator
  readonly cards: Locator

  constructor(page: Page) {
    super(page)
    this.count = page.getByText(/^\d+ créatures?$/)
    this.cards = page.getByRole('main').getByRole('listitem').getByRole('article')
  }

  async goto() {
    await this.page.goto('/catalogue')
  }

  async open(name: string) {
    await this.page.getByRole('link', { name: new RegExp(`^${name}\\b`) }).click()
  }
}

export class CreaturePage {
  readonly name: Locator
  readonly rarityGems: Locator
  readonly ownership: Locator
  readonly owners: Locator

  constructor(readonly page: Page) {
    this.name = page.getByRole('heading', { level: 1 })
    this.rarityGems = page.getByRole('main').getByRole('img', { name: /^Rareté : / }).first()
    this.ownership = page.getByText(/^(Possédées : \d+|Non possédée)$/)
    this.owners = page.locator('section[aria-labelledby="owners-title"]').getByRole('listitem')
  }

  /** Bouton « Échanger » à côté d'un joueur qui possède la carte. */
  tradeWith(pseudo: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^Échanger avec ${pseudo} pour obtenir`) })
  }
}

export class CollectionPage extends CreatureFilters {
  readonly summary: Locator
  readonly totalCards: Locator
  readonly count: Locator
  readonly cards: Locator

  constructor(page: Page) {
    super(page)
    this.summary = page.getByText(/créatures sur \d+/)
    this.totalCards = page
      .getByRole('main')
      .locator('p')
      .filter({ hasText: /^\s*\d+\s+cartes\s*$/ })
      .locator('strong')
    this.count = page.getByText(/^\d+ résultats? affichés?/)
    this.cards = page.getByRole('main').getByRole('listitem').getByRole('article')
  }

  async goto() {
    await this.page.goto('/collection')
  }

  /** Filtre de possession : « Possédées », « Manquantes », « Toutes »… */
  ownership(label: string): Locator {
    return this.page.getByRole('group', { name: 'Possession' }).getByRole('button', { name: label })
  }

  get duplicates(): Locator {
    return this.ownership('Doublons')
  }

  /** Nombre d'exemplaires affiché sur la carte d'une créature possédée. */
  quantityOf(name: string): Locator {
    return creatureCard(this.page, name).locator('strong').last()
  }
}

export class TradesPage {
  readonly newTrade: Locator

  constructor(readonly page: Page) {
    this.newTrade = page.getByRole('main').getByRole('link', { name: 'Ouvrir un échange' }).first()
  }

  async goto() {
    await this.page.goto('/echanges')
  }

  tab(label: 'En cours' | 'Dons' | 'Historique'): Locator {
    return this.page.getByRole('tab', { name: label })
  }

  historyFilter(label: string): Locator {
    return this.page.getByRole('button', { name: label, exact: true })
  }

  /** Carte d'un échange de la liste, par le pseudo de l'autre joueur. */
  trade(pseudo: string): Locator {
    return this.page.getByRole('main').getByRole('link').filter({ hasText: pseudo })
  }

  /** Carte d'un don : « Offert à … » ou « Reçu de … ». */
  gift(text: string): Locator {
    return this.page.getByRole('article').filter({ hasText: text })
  }
}

export class NewTradePage {
  readonly playerSearch: Locator
  readonly giftRecipient: Locator
  readonly giftQuantity: Locator
  readonly giftSubmit: Locator

  constructor(readonly page: Page) {
    this.playerSearch = page.getByRole('searchbox', { name: 'Pseudonyme du joueur' })
    this.giftRecipient = page.locator('#gift-recipient')
    this.giftQuantity = page.getByLabel("Nombre d'exemplaires")
    this.giftSubmit = page.getByRole('button', { name: 'Offrir cette carte' })
  }

  async goto() {
    await this.page.goto('/echanges/nouveau')
  }

  mode(label: 'Par joueur' | 'Par carte'): Locator {
    return this.page.getByRole('tablist', { name: 'Chercher un échange' }).getByRole('tab', { name: label })
  }

  /** Résultat de la recherche de joueur. */
  player(pseudo: string): Locator {
    return this.page.getByRole('button', { name: pseudo, exact: true })
  }

  tradeWith(pseudo: string): Locator {
    return this.page.getByRole('button', { name: `Échanger avec ${pseudo}`, exact: true })
  }

  /** En mode « Par carte » : choisir la carte cherchée. */
  chooseCard(name: string): Locator {
    return this.page.getByRole('button', { name: `Trouver les joueurs qui possèdent ${name}` })
  }

  cardAction(label: 'Échanger' | 'Faire un don'): Locator {
    return this.page.getByRole('tablist', { name: 'Que faire avec cette carte ?' }).getByRole('tab', { name: label })
  }

  /** Offre une carte (mode « Par carte » → « Faire un don »). */
  async gift(card: string, recipient: string, quantity = 1) {
    await this.mode('Par carte').click()
    await this.chooseCard(card).click()
    await this.cardAction('Faire un don').click()
    await this.giftRecipient.fill(recipient.slice(0, 3))
    await this.player(recipient).click()
    await this.giftQuantity.fill(String(quantity))
    await this.giftSubmit.click()
    await toast(this.page, `${quantity} ${card} offerte(s) à ${recipient}.`).waitFor()
  }
}

export class TradeRoomPage {
  readonly title: Locator
  readonly status: Locator
  readonly ready: Locator
  readonly abandon: Locator
  readonly confirmAbandon: Locator
  readonly myMat: Locator
  readonly theirMat: Locator
  readonly chatInput: Locator
  readonly chatSend: Locator
  readonly chat: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { level: 1 })
    this.status = page.locator('header p[aria-live="polite"]')
    this.ready = page.getByRole('switch')
    this.abandon = page.getByRole('button', { name: 'Abandonner l’échange' })
    this.confirmAbandon = page.getByRole('button', { name: 'Abandonner', exact: true })
    this.myMat = page.locator('[data-mat]').first()
    this.theirMat = page.locator('[data-mat]').last()
    this.chatInput = page.getByRole('textbox', { name: /^Message à / })
    this.chatSend = page.getByRole('button', { name: 'Envoyer le message' })
    this.chat = page.getByRole('region', { name: 'Discussion' }).getByRole('listitem')
  }

  /** Pose un exemplaire d'une carte de sa collection sur son tapis. */
  async put(name: string) {
    await this.page.getByRole('button', { name: new RegExp(`^Poser ${name} sur mon tapis`) }).click()
  }

  async removeOne(name: string) {
    await this.page.getByRole('button', { name: `Retirer un exemplaire de ${name}` }).click()
  }

  async say(text: string) {
    await this.chatInput.fill(text)
    await this.chatSend.click()
  }
}

export class ProfilePage {
  readonly signOutButton: Locator
  readonly password: PasswordChangeForm
  readonly deletion: AccountDeletePanel
  readonly resetBooster: Locator

  constructor(readonly page: Page) {
    this.signOutButton = page.getByRole('button', { name: 'Se déconnecter' })
    this.password = new PasswordChangeForm(page)
    this.deletion = new AccountDeletePanel(page)
    this.resetBooster = page.getByRole('button', { name: 'Rendre le booster disponible' })
  }

  async goto() {
    await this.page.goto('/profil')
  }
}

export class NotFoundPage {
  readonly title: Locator
  readonly home: Locator

  constructor(readonly page: Page) {
    this.title = page.getByRole('heading', { name: 'Perdu dans la brume' })
    this.home = page.getByRole('link', { name: 'Retour à l’accueil' })
  }
}
