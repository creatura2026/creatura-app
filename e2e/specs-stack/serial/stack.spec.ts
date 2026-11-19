/**
 * Tests qui touchent TOUTE la stack : X-01, X-02, X-04 (site ↔ dashboard), WS-08 (redémarrage de
 * l'API). Le projet stack-serial les lance après les autres, un à la fois (un seul fichier : deux
 * fichiers d'un même projet pourraient tourner en parallèle).
 */
import { test, expect } from '../../fixtures/stack.ts'
import { toast } from '../../pages/forms.ts'
import { AdminTradesPage, SettingsPage } from '../../pages/admin.ts'
import { CataloguePage, creatureCard } from '../../pages/player.ts'
import { concludeTrade, newPlayer, signInAdmin, uniquePseudo } from '../../stack/api.ts'
import { passMidnight, restartApi } from '../../stack/docker.ts'
import { recordRoomSocket } from '../../stack/socket.ts'

test.describe.configure({ mode: 'serial' })

test('X-01 : le nombre de cartes réglé dans le dashboard s’applique au booster après minuit', async ({
  openAdmin,
}) => {
  const adminAccount = await signInAdmin()
  try {
    const admin = await openAdmin(adminAccount)
    const settings = new SettingsPage(admin.page)
    await admin.shell.open('Réglages booster')
    await expect(settings.value).toHaveText('5')
    await settings.more.click()
    await settings.save.click()
    await expect(toast(admin.page, /Réglages enregistrés/)).toBeVisible()

    // Avant minuit : toujours 5 cartes.
    const before = await newPlayer('Avant', { withCards: false })
    expect(await before.claimBooster()).toHaveLength(5)

    passMidnight()
    const after = await newPlayer('Apres', { withCards: false })
    expect(await after.claimBooster()).toHaveLength(6)
  } finally {
    // Retour au réglage par défaut pour les lancements suivants.
    await adminAccount.put('/admin/settings/booster', { cardsPerBooster: 5 })
    passMidnight()
  }
})

test('X-02 : une carte créée dans le dashboard apparaît au catalogue du joueur après minuit', async ({
  openPlayer,
}) => {
  const admin = await signInAdmin()
  const name = uniquePseudo('Carte')
  await admin.post('/admin/creatures', {
    name,
    family: 'NATURE',
    rarity: 'COMMON',
    description: 'Carte créée par les tests de bout en bout.',
    image: `sprites/${name.toLowerCase()}.png`,
  })

  const player = await openPlayer(await newPlayer('Lecteur', { withCards: false }))
  const catalogue = new CataloguePage(player.page)
  await catalogue.goto()
  await catalogue.search.fill(name)
  await expect(player.page.getByText('Aucune créature ne correspond à ces critères.')).toBeVisible()

  passMidnight()
  await player.page.reload()
  await catalogue.search.fill(name)
  await expect(creatureCard(player.page, name)).toBeVisible()
})

test('X-04 : un échange conclu entre deux joueurs apparaît dans la supervision', async ({ openAdmin }) => {
  const [alice, bob] = await Promise.all([newPlayer('Alice'), newPlayer('Bob')])
  await concludeTrade(alice, bob)

  const admin = await openAdmin(await signInAdmin())
  const trades = new AdminTradesPage(admin.page)
  await admin.shell.open('Échanges')
  await trades.player.fill(alice.pseudo)
  await admin.page.getByRole('option').getByRole('button', { name: alice.pseudo, exact: true }).click()

  await expect(trades.rows).toHaveCount(1)
  await expect(trades.rows.first()).toContainText(bob.pseudo)
  await expect(trades.rows.first()).toContainText('Conclu')
})

test('WS-08 : après un redémarrage de l’API, les deux joueurs se reconnectent à la salle', async ({
  openPlayer,
}) => {
  test.slow()
  const [a, b] = await Promise.all([newPlayer('Alice'), newPlayer('Bob')])
  const trade = await a.openTrade(b)
  const card = await a.oneCard()
  const [alice, bob] = await Promise.all([openPlayer(a), openPlayer(b)])
  const sockets = { alice: recordRoomSocket(alice.page), bob: recordRoomSocket(bob.page) }
  await Promise.all([alice.enterRoom(trade.id), bob.enterRoom(trade.id)])

  restartApi()

  // Les deux navigateurs se reconnectent d'eux-mêmes (attente croissante, 15 s au plus). La
  // reconnexion est terminée au nouvel état complet (init) : un clic pendant la reconnexion serait
  // perdu (http.ts n'envoie que sur une connexion ouverte).
  for (const socket of Object.values(sockets)) {
    await expect.poll(() => socket.inits(), { timeout: 45_000 }).toBeGreaterThan(1)
  }
  // … et la salle fonctionne de nouveau : une carte posée par Alice arrive chez Bob.
  await alice.room.put(card.name)
  await expect(creatureCard(bob.room.theirMat, card.name)).toBeVisible()
})
