/**
 * Dashboard admin sur la vraie API : A-01, A-02, A-03 et A-07, A-06 et X-03.
 * Compte de démonstration : admin / admin (compose.yaml). Les autres admins sont créés par l'API.
 */
import { test, expect } from '../../fixtures/stack.ts'
import { toast } from '../../pages/forms.ts'
import {
  AdminLoginPage,
  AdminsPage,
  ChangePasswordPage,
  DashboardPage,
  DeletionRequestDialog,
  ForbiddenPage,
  SettingsPage,
} from '../../pages/admin.ts'
import { ApiError, newAdmin, newPlayer, signIn, signInAdmin, uniquePseudo } from '../../stack/api.ts'

test('A-01 : un joueur est refusé, un administrateur voit les statistiques', { tag: '@smoke' }, async ({
  page,
  openAdmin,
}) => {
  const player = await newPlayer('Curieux', { withCards: false })
  const login = new AdminLoginPage(page)
  await login.goto()
  await login.signIn(player.credentials)
  await expect(new ForbiddenPage(page).title).toBeVisible()

  const admin = await openAdmin(await signInAdmin())
  const dashboard = new DashboardPage(admin.page)
  await expect(dashboard.title).toBeVisible()
  await expect(dashboard.kpi('Inscrits · total')).toBeVisible()
})

test('A-02 : un 403 sur une action affiche l’erreur sur place, sans « Accès refusé »', async ({
  openAdmin,
}) => {
  const admin = await openAdmin(await signInAdmin())
  // Le serveur refuse l'enregistrement (WAF, quota…) alors que la page se charge normalement.
  await admin.page.route('**/api/v1/admin/settings/booster', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 403,
          contentType: 'application/problem+json',
          json: { type: 'about:blank', title: 'Refusé', status: 403, code: 'FORBIDDEN', detail: 'Action bloquée par le pare-feu.' },
        })
      : route.continue(),
  )
  const settings = new SettingsPage(admin.page)
  await admin.shell.open('Réglages booster')
  await settings.more.click()
  await settings.save.click()

  await expect(toast(admin.page, 'Action bloquée par le pare-feu.')).toBeVisible()
  await expect(settings.title).toBeVisible()
  await expect(admin.page).not.toHaveURL(/acces-refuse/)
})

test('A-03, A-07 : un admin crée un compte ; le nouvel admin choisit son mot de passe', async ({
  page,
  openAdmin,
}) => {
  const admin = await openAdmin(await signInAdmin())
  const admins = new AdminsPage(admin.page)
  const pseudo = uniquePseudo('Zoe')
  await admin.shell.open('Administrateurs')
  await admins.pseudo.fill(pseudo)
  await admins.login.fill(pseudo.toLowerCase())
  await admins.create.click()
  await expect(admins.account(pseudo)).toContainText('par Admin')
  const temporary = (await admins.createdPassword.textContent())!.trim()

  // Première connexion du nouvel admin, dans un autre navigateur.
  const login = new AdminLoginPage(page)
  await login.goto()
  await login.signIn({ login: pseudo.toLowerCase(), password: temporary })
  const change = new ChangePasswordPage(page)
  await expect(change.title).toBeVisible()
  await change.form.change(temporary, 'definitif-e2e-123456')
  await expect(new DashboardPage(page).title).toBeVisible()

  await signIn({ login: pseudo.toLowerCase(), password: 'definitif-e2e-123456' })
})

test(
  'A-06, X-03 : suppression validée par un second admin ; le joueur disparaît partout',
  { tag: '@smoke' },
  async ({ openAdmin, openPlayer }) => {
    const first = await signInAdmin()
    const second = await newAdmin(first)
    const [target, friend] = await Promise.all([newPlayer('Cible'), newPlayer('Ami')])
    // Un échange terminé entre eux, qui doit rester chez l'ami.
    const trade = await target.openTrade(friend)
    await friend.post(`/trades/${trade.id}/refuse`)

    // Le premier admin demande la suppression, le second est le validateur.
    const a = await openAdmin(first)
    await a.shell.open('Joueurs')
    await a.players.search.fill(target.pseudo)
    await a.players.select(target.pseudo).check()
    await a.players.requestDeletion.click()
    const dialog = new DeletionRequestDialog(a.page)
    await dialog.validator.selectOption({ label: second.pseudo })
    await dialog.send.click()
    await expect(a.players.row(target.pseudo)).toContainText('Suppression demandée')

    // Le second admin valide.
    const b = await openAdmin(second)
    await b.shell.open('Joueurs')
    const request = b.players.toValidate.getByRole('listitem').filter({ hasText: target.pseudo })
    await request.getByRole('button', { name: 'Valider', exact: true }).click()
    await request.getByRole('button', { name: 'Oui, supprimer' }).click()
    await expect(request).toBeHidden()

    // Le joueur ne peut plus se connecter ; son ancien partenaire voit « Joueur supprimé ».
    await expect(signIn(target.credentials)).rejects.toBeInstanceOf(ApiError)
    const friendSession = await openPlayer(friend)
    await friendSession.trades.goto()
    await friendSession.trades.tab('Historique').click()
    await expect(friendSession.trades.trade('Joueur supprimé')).toBeVisible()
  },
)

test('un admin ne peut pas se choisir comme validateur', async ({ openAdmin }) => {
  const first = await signInAdmin()
  await newAdmin(first)
  const target = await newPlayer('Cible', { withCards: false })

  const a = await openAdmin(first)
  await a.shell.open('Joueurs')
  await a.players.search.fill(target.pseudo)
  await a.players.select(target.pseudo).check()
  await a.players.requestDeletion.click()

  const options = new DeletionRequestDialog(a.page).validator.getByRole('option')
  await expect(options.filter({ hasText: /^Admin$/ })).toHaveCount(0)
})
