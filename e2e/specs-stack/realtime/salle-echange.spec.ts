/**
 * WS-01 à WS-11, P-08, P-09, P-13 : la salle d'échange en temps réel, sur le vrai WebSocket
 * `/api/v1/trades/{id}/live`, entre deux navigateurs (Alice et Bob).
 *
 * Chaque joueur est créé par l'API et a ouvert son booster du jour : il a 5 cartes.
 * WS-08 (redémarrage de l'API) est dans specs-stack/serial : il couperait les autres tests.
 * WS-10 (message invalide) : l'écran n'envoie que des messages valides, la règle est testée par
 * le back (test_trades.py, test_trade_validation).
 */
import { test, expect, type PlayerSession } from '../../fixtures/stack.ts'
import { creatureCard } from '../../pages/player.ts'
import { newPlayer, signIn, type Account, type Trade } from '../../stack/api.ts'
import { recordRoomSocket } from '../../stack/socket.ts'

interface Room {
  alice: PlayerSession
  bob: PlayerSession
  trade: Trade
}

/** Alice ouvre un échange avec Bob ; chacun a son navigateur, aucun n'est encore dans la salle. */
async function setUp(openPlayer: (a: Account) => Promise<PlayerSession>): Promise<Room> {
  const [a, b] = await Promise.all([newPlayer('Alice'), newPlayer('Bob')])
  const trade = await a.openTrade(b)
  const [alice, bob] = await Promise.all([openPlayer(a), openPlayer(b)])
  return { alice, bob, trade }
}

test.describe('présence et premiers messages', () => {
  test('WS-01 : en entrant, Alice reçoit l’état complet de la salle (init)', async ({ openPlayer }) => {
    const { alice, bob, trade } = await setUp(openPlayer)
    const socket = recordRoomSocket(alice.page)

    await alice.enterRoom(trade.id)

    await expect.poll(() => socket.receivedTypes()[0]).toBe('init')
    await expect(alice.room.title).toHaveText(`Échange avec ${bob.account.pseudo}`)
    expect(alice.page.url()).not.toContain('access_token')
  })

  test('WS-02 et WS-06 : Alice voit Bob arriver puis partir', async ({ openPlayer }) => {
    const { alice, bob, trade } = await setUp(openPlayer)
    const socket = recordRoomSocket(alice.page)
    const presence = alice.page.getByRole('region', { name: 'Discussion' })

    await alice.enterRoom(trade.id)
    await expect(presence).toContainText(`${bob.account.pseudo} est absent`)

    await bob.enterRoom(trade.id)
    await expect(presence).toContainText(`${bob.account.pseudo} est là`)
    expect(socket.received).toContainEqual(expect.objectContaining({ type: 'presence', online: true }))

    await bob.page.close()
    await expect(presence).toContainText(`${bob.account.pseudo} est absent`)
  })
})

test.describe('tapis et validation', () => {
  test(
    'WS-03, WS-04, P-08 : une carte contre une carte, dernier exemplaire compris, vue en direct par les deux',
    { tag: '@smoke' },
    async ({ openPlayer }) => {
      const { alice, bob, trade } = await setUp(openPlayer)
      const fromAlice = await alice.account.oneCard({ single: true })
      const fromBob = await bob.account.oneCard({ except: [fromAlice.id] })
      const before = {
        aliceGets: await alice.account.quantityOf(fromBob.id),
        bobGets: await bob.account.quantityOf(fromAlice.id),
        aliceGives: await alice.account.quantityOf(fromAlice.id),
      }
      const aliceSocket = recordRoomSocket(alice.page)
      await Promise.all([alice.enterRoom(trade.id), bob.enterRoom(trade.id)])

      // Alice pose sa carte : Bob la voit sans recharger la page.
      await alice.room.put(fromAlice.name)
      await expect.poll(() => aliceSocket.sentTypes()).toContain('offer')
      await expect(creatureCard(bob.room.theirMat, fromAlice.name)).toBeVisible()

      await bob.room.put(fromBob.name)
      await expect(creatureCard(alice.room.theirMat, fromBob.name)).toBeVisible()

      await alice.room.ready.click()
      await expect(bob.room.status).toHaveText(`${alice.account.pseudo} a validé. Validez pour conclure l’échange.`)
      await bob.room.ready.click()

      const concluded = 'Échange conclu : les cartes ont changé de collection.'
      await expect(alice.room.status).toHaveText(concluded)
      await expect(bob.room.status).toHaveText(concluded)
      expect(aliceSocket.sentTypes()).toContain('ready')

      // Les collections ont bien changé côté serveur.
      expect(await alice.account.quantityOf(fromAlice.id)).toBe(before.aliceGives - 1)
      expect(await alice.account.quantityOf(fromBob.id)).toBe(before.aliceGets + 1)
      expect(await bob.account.quantityOf(fromAlice.id)).toBe(before.bobGets + 1)
    },
  )

  test('P-09 : plusieurs cartes de chaque côté', async ({ openPlayer }) => {
    const { alice, bob, trade } = await setUp(openPlayer)
    const aliceCards = (await alice.account.collection()).slice(0, 2).map((e) => e.creature)
    const bobCards = (await bob.account.collection()).slice(0, 2).map((e) => e.creature)
    await Promise.all([alice.enterRoom(trade.id), bob.enterRoom(trade.id)])

    for (const card of aliceCards) await alice.room.put(card.name)
    for (const card of bobCards) await bob.room.put(card.name)
    await expect(bob.room.theirMat).toContainText(`${aliceCards.length} cartes`)
    await expect(alice.room.theirMat).toContainText(`${bobCards.length} cartes`)

    await alice.room.ready.click()
    await bob.room.ready.click()

    await expect(alice.room.status).toHaveText('Échange conclu : les cartes ont changé de collection.')
    const bobNow = await bob.account.collection()
    for (const card of aliceCards) expect(bobNow.some((e) => e.creature.id === card.id)).toBe(true)
  })

  test('deux cartes posées coup sur coup restent toutes les deux sur le tapis', async ({ openPlayer }) => {
    // Non-régression : le serveur remplace le tapis par la liste reçue. Un second clic avant sa
    // réponse doit partir du tapis déjà envoyé (TradeRoomView, sentMat), sinon la première carte
    // disparaît.
    const { alice, bob, trade } = await setUp(openPlayer)
    const [first, second] = (await alice.account.collection()).map((e) => e.creature)
    await Promise.all([alice.enterRoom(trade.id), bob.enterRoom(trade.id)])

    await alice.room.put(first!.name)
    await alice.room.put(second!.name)

    await expect(alice.room.myMat).toContainText('2 cartes')
    await expect(bob.room.theirMat).toContainText('2 cartes')
  })

  test('modifier son tapis retire la validation de l’autre, chez les deux joueurs', async ({ openPlayer }) => {
    const { alice, bob, trade } = await setUp(openPlayer)
    const [first, second] = (await alice.account.collection()).map((e) => e.creature)
    const fromBob = await bob.account.oneCard()
    await Promise.all([alice.enterRoom(trade.id), bob.enterRoom(trade.id)])

    await alice.room.put(first!.name)
    await bob.room.put(fromBob.name)
    await bob.room.ready.click()
    await expect(alice.room.status).toHaveText(`${bob.account.pseudo} a validé. Validez pour conclure l’échange.`)

    await alice.room.put(second!.name)

    await expect(alice.room.status).toHaveText('Quand l’échange vous convient, validez-le.')
    await expect(bob.room.ready).not.toBeChecked()
  })

  test('P-13 : une carte donnée ailleurs pendant l’échange est retirée du tapis', async ({ openPlayer }) => {
    const { alice, bob, trade } = await setUp(openPlayer)
    const carl = await newPlayer('Carl', { withCards: false })
    const card = await alice.account.oneCard({ single: true })
    const fromBob = await bob.account.oneCard()
    await Promise.all([alice.enterRoom(trade.id), bob.enterRoom(trade.id)])
    await alice.room.put(card.name)
    await bob.room.put(fromBob.name)
    await expect(creatureCard(bob.room.theirMat, card.name)).toBeVisible()

    // Pendant ce temps, Alice offre cette même carte à Carl, qui l'accepte.
    const owned = await alice.account.quantityOf(card.id)
    const gift = await alice.account.gift(carl, card.id, owned)
    await carl.post(`/gifts/${gift.id}/accept`)

    // À la validation suivante, le serveur revérifie les tapis et retire la carte partie.
    await bob.room.ready.click()
    await expect(creatureCard(bob.room.theirMat, card.name)).toBeHidden()
    await expect(creatureCard(alice.room.myMat, card.name)).toBeHidden()
    await expect(bob.room.ready).not.toBeChecked()
  })
})

test.describe('discussion', () => {
  test('WS-05 : un message arrive chez l’autre et reste après rechargement', async ({ openPlayer }) => {
    const { alice, bob, trade } = await setUp(openPlayer)
    await Promise.all([alice.enterRoom(trade.id), bob.enterRoom(trade.id)])

    await alice.room.say('Salut, ton échange me va !')
    await expect(bob.room.chat.filter({ hasText: 'Salut, ton échange me va !' })).toBeVisible()

    await bob.page.reload()
    await expect(bob.room.chat.filter({ hasText: 'Salut, ton échange me va !' })).toBeVisible()
  })
})

test.describe('coupures et accès', () => {
  test('WS-07 : après une coupure réseau, Bob se reconnecte et retrouve l’état complet', async ({
    openPlayer,
  }) => {
    const { alice, bob, trade } = await setUp(openPlayer)
    const card = await alice.account.oneCard()

    // Le WebSocket de Bob passe par Playwright, qui peut le couper.
    let cut: (() => Promise<void>) | undefined
    await bob.page.routeWebSocket(/\/trades\/[^/]+\/live/, (ws) => {
      ws.connectToServer()
      cut = () => ws.close()
    })
    const bobSocket = recordRoomSocket(bob.page)
    await Promise.all([alice.enterRoom(trade.id), bob.enterRoom(trade.id)])
    await expect.poll(() => bobSocket.connections).toBe(1)

    await cut!()
    // Alice pose une carte pendant la coupure.
    await alice.room.put(card.name)

    await expect.poll(() => bobSocket.connections, { timeout: 15_000 }).toBeGreaterThan(1)
    await expect(creatureCard(bob.room.theirMat, card.name)).toBeVisible()
  })

  test('WS-09 : un troisième joueur ne peut pas entrer dans la salle', async ({ openPlayer }) => {
    const { trade } = await setUp(openPlayer)
    const carl = await openPlayer(await newPlayer('Carl', { withCards: false }))

    await carl.page.goto(`/echanges/${trade.id}`)

    await expect(carl.page.getByRole('alert')).toContainText('Impossible d’ouvrir cet échange.')
  })

  test('WS-11 : Alice annule l’échange, la salle se ferme aussi chez Bob', async ({ openPlayer }) => {
    const { alice, bob, trade } = await setUp(openPlayer)
    await Promise.all([alice.enterRoom(trade.id), bob.enterRoom(trade.id)])

    // Annulation par l'API REST, pas par la salle.
    const a = await signIn(alice.account.credentials)
    await a.post(`/trades/${trade.id}/cancel`)

    await expect(bob.page.getByText('L’échange est terminé, la discussion est fermée.')).toBeVisible()
    await expect(bob.room.ready).toBeHidden()
    await expect(alice.page.getByText('L’échange est terminé, la discussion est fermée.')).toBeVisible()
  })
})
