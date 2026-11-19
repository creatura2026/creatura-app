/**
 * D-01 à D-08 : l'application Windows (Electron), non empaquetée, sur la stack réelle.
 *
 * Ce que l'exe ajoute au site, et que les tests du site ne couvrent pas (apps/desktop/main.cjs) :
 * le serveur local 127.0.0.1 qui sert le site et RELAIE /api et le WebSocket vers le backend,
 * l'adresse du backend (variable, creatura.json, build), les liens externes, les erreurs.
 *
 * Une seule application ouverte à la fois (verrou d'instance unique) : tests en série.
 * creatura.json (à côté de l'exe) n'est lu que par l'exe empaqueté : voir specs-desktop/exe.
 */
import { test, expect } from '../../fixtures/stack.ts'
import { LoginForm } from '../../pages/forms.ts'
import { BoosterPage, LandingPage, TradeRoomPage, creatureCard } from '../../pages/player.ts'
import { API_ORIGIN, newPlayer } from '../../stack/api.ts'
import {
  DEAD_API,
  launchApp,
  prepareApp,
  recordExternalLinks,
  type AppVariant,
  type RunningApp,
} from '../../desktop/app.ts'

test.describe.configure({ mode: 'serial' })

let demo: AppVariant
let connected: AppVariant
let app: RunningApp | undefined

test.beforeAll(() => {
  // Deux builds du site joueur : une minute environ.
  test.setTimeout(240_000)
  demo = prepareApp('demo', { demo: true, apiUrl: null })
  connected = prepareApp('stack', { demo: false, apiUrl: API_ORIGIN })
})

test.afterEach(async () => {
  await app?.close()
  app = undefined
})

async function signIn(window: RunningApp['window'], credentials: { login: string; password: string }) {
  await window.goto(`${new URL(window.url()).origin}/connexion`)
  await new LoginForm(window).signIn(credentials)
}

test('D-01 : l’application démarre et affiche l’accueil, servi par son serveur local', async () => {
  app = await launchApp(demo)

  await expect(new LandingPage(app.window).title).toHaveText('CREATURA')
  expect(app.window.url()).toBe(`${app.origin}/`)
  // Données de l'application dans le dossier du test, pas dans %APPDATA%.
  const userData = await app.electron.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
  expect(userData).toBe(app.userData)
})

test('D-02 : version démo, sans serveur : connexion de démonstration et booster', async () => {
  app = await launchApp(demo)
  const login = new LoginForm(app.window)
  await app.window.goto(`${app.origin}/connexion`)
  await login.demoAccount('Dresseur').click()
  await login.submit.click()
  await expect(app.window).toHaveURL(/\/accueil$/)

  const booster = new BoosterPage(app.window)
  await app.window.goto(`${app.origin}/booster`)
  await booster.openAndReveal()
  await expect(booster.cards).toHaveCount(5)
})

test(
  'D-03 : branchée sur la stack, l’app passe par son proxy local pour parler à l’API',
  { tag: '@smoke' },
  async () => {
    const player = await newPlayer('Bureau', { withCards: false })
    app = await launchApp(connected)
    const apiCalls: string[] = []
    app.window.on('request', (request) => {
      if (request.url().includes('/api/')) apiCalls.push(request.url())
    })

    await signIn(app.window, player.credentials)
    await expect(app.window).toHaveURL(/\/accueil$/)
    const booster = new BoosterPage(app.window)
    await app.window.goto(`${app.origin}/booster`)
    await booster.openAndReveal()

    // Toutes les requêtes de l'app visent son serveur local, qui relaie vers l'API.
    expect(apiCalls.length).toBeGreaterThan(0)
    for (const url of apiCalls) expect(url.startsWith(`${app.origin}/api/`)).toBe(true)
    expect((await player.collection()).reduce((sum, e) => sum + e.quantity, 0)).toBe(5)
  },
)

test('D-04 : salle d’échange à travers le proxy : Alice dans l’app, Bob dans un navigateur', async ({
  openPlayer,
}) => {
  const [alice, bobAccount] = await Promise.all([newPlayer('Alice'), newPlayer('Bob')])
  const trade = await alice.openTrade(bobAccount)
  const fromAlice = await alice.oneCard()
  const fromBob = await bobAccount.oneCard({ except: [fromAlice.id] })

  app = await launchApp(connected)
  await signIn(app.window, alice.credentials)
  await expect(app.window).toHaveURL(/\/accueil$/)
  await app.window.goto(`${app.origin}/echanges/${trade.id}`)
  const aliceRoom = new TradeRoomPage(app.window)
  const bob = await openPlayer(bobAccount)
  await bob.enterRoom(trade.id)

  // Le WebSocket de l'app passe par son serveur local.
  await aliceRoom.put(fromAlice.name)
  await expect(creatureCard(bob.room.theirMat, fromAlice.name)).toBeVisible()
  await bob.room.put(fromBob.name)
  await expect(creatureCard(aliceRoom.theirMat, fromBob.name)).toBeVisible()

  await aliceRoom.ready.click()
  await bob.room.ready.click()
  const concluded = 'Échange conclu : les cartes ont changé de collection.'
  await expect(aliceRoom.status).toHaveText(concluded)
  await expect(bob.room.status).toHaveText(concluded)
})

test('D-05, D-06 : CREATURA_API_URL l’emporte sur l’adresse du build ; serveur injoignable signalé', async () => {
  const player = await newPlayer('Bureau', { withCards: false })
  // Adresse du build : la stack. Variable : un serveur éteint. C'est la variable qui compte.
  app = await launchApp(connected, { CREATURA_API_URL: DEAD_API })

  await expect(new LandingPage(app.window).title).toHaveText('CREATURA')
  await signIn(app.window, player.credentials)

  await expect(app.window.getByText(`Le serveur Créatura (${DEAD_API}) ne répond pas.`)).toBeVisible()
  await expect(app.window).toHaveURL(/\/connexion$/)
})

test('D-07 : un lien vers un autre site s’ouvre dans le navigateur du système', async () => {
  app = await launchApp(demo)
  const opened = await recordExternalLinks(app)
  await expect(new LandingPage(app.window).title).toBeVisible()

  await app.window.evaluate(() => {
    window.location.href = 'https://example.org/'
  })
  await app.window.evaluate(() => window.open('https://example.com/page'))

  await expect.poll(opened).toEqual(['https://example.org/', 'https://example.com/page'])
  expect(app.window.url()).toBe(`${app.origin}/`)
  expect(app.electron.windows()).toHaveLength(1)
})

test('D-08 : le serveur local sert les routes de l’app, sans service worker ni fichiers hors du site', async () => {
  app = await launchApp(demo)
  await expect(new LandingPage(app.window).title).toBeVisible()

  // Une adresse de l'app ouverte directement : le site répond (puis demande la connexion).
  await app.window.goto(`${app.origin}/collection`)
  await expect(app.window).toHaveURL(/\/connexion\?redirect=/)

  const sw = await fetch(`${app.origin}/registerSW.js`)
  expect(sw.status).toBe(200)
  expect(await sw.text()).toBe('')

  const outside = await fetch(`${app.origin}/%2e%2e/main.cjs`)
  expect([403, 404]).toContain(outside.status)
  expect(await outside.text()).not.toContain('BrowserWindow')

  expect((await fetch(`${app.origin}/assets/inexistant.js`)).status).toBe(404)
})
