/**
 * Test de charge de l'API (k6) : workflow de nuit, ou à la main contre la stack des tests.
 *
 *   docker compose -f e2e/compose.yaml up -d --wait
 *   docker run --rm -i -e BASE_URL=http://host.docker.internal:58000/api/v1 \
 *     -v "$PWD/e2e/load:/load" grafana/k6 run /load/charge.js
 *
 * Deux scénarios en parallèle :
 *  - « joueurs » : connexion, accueil, catalogue, collection, booster du jour (un seul par jour :
 *    les suivants répondent 409, attendu) ;
 *  - « salles » : deux joueurs ouvrent un échange, entrent dans la salle (WebSocket) et discutent.
 *
 * Seuils (le test échoue au-delà) : moins de 1 % d'erreurs, 95 % des requêtes en moins de 500 ms,
 * connexion à une salle en moins d'une seconde.
 */
import http from 'k6/http'
import ws from 'k6/ws'
import { check, sleep } from 'k6'
import { Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:58000/api/v1'
const PLAYERS = Number(__ENV.PLAYERS || 20)
const DURATION = __ENV.DURATION || '1m'
const PASSWORD = 'mot-de-passe-charge-1234'

const roomJoin = new Trend('salle_entree', true)

// 409 : booster déjà ouvert aujourd'hui, réponse normale.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 409))

export const options = {
  scenarios: {
    joueurs: { executor: 'constant-vus', vus: PLAYERS, duration: DURATION, exec: 'player' },
    salles: {
      executor: 'constant-vus',
      vus: Math.max(1, Math.floor(PLAYERS / 4)),
      duration: DURATION,
      exec: 'room',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    salle_entree: ['p(95)<1000'],
    checks: ['rate>0.99'],
  },
}

const json = { headers: { 'content-type': 'application/json' } }
const auth = (token) => ({ headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } })

function register(prefix, n) {
  const pseudo = `${prefix}${n}x${Date.now().toString(36)}`.slice(0, 20)
  const login = pseudo.toLowerCase()
  const created = http.post(`${BASE_URL}/auth/register`, JSON.stringify({ pseudo, login, password: PASSWORD }), json)
  check(created, { 'inscription : 201': (r) => r.status === 201 })
  return { login, id: created.json('id') }
}

function signIn(login) {
  const r = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ login, password: PASSWORD }), json)
  check(r, { 'connexion : 200': (res) => res.status === 200 })
  return r.json('accessToken')
}

/** Comptes créés une fois, avant la charge : un par joueur, deux par salle. */
export function setup() {
  const players = Array.from({ length: PLAYERS }, (_, i) => register('Charge', i))
  const pairs = Array.from({ length: Math.max(1, Math.floor(PLAYERS / 4)) }, (_, i) => [
    register('SalleA', i),
    register('SalleB', i),
  ])
  return { players, pairs }
}

export function player(data) {
  const me = data.players[(__VU - 1) % data.players.length]
  const token = signIn(me.login)
  const params = auth(token)

  check(http.get(`${BASE_URL}/me`, params), { 'accueil : 200': (r) => r.status === 200 })
  check(http.get(`${BASE_URL}/creatures?pageSize=20`, params), { 'catalogue : 200': (r) => r.status === 200 })
  check(http.get(`${BASE_URL}/me/collection?pageSize=50`, params), { 'collection : 200': (r) => r.status === 200 })
  check(http.post(`${BASE_URL}/me/boosters`, null, params), {
    'booster : ouvert ou déjà ouvert': (r) => r.status === 201 || r.status === 409,
  })
  sleep(1)
}

export function room(data) {
  const [a, b] = data.pairs[(__VU - 1) % data.pairs.length]
  const tokenA = signIn(a.login)
  const tokenB = signIn(b.login)
  // Ouvre l'échange (ou retrouve celui déjà ouvert entre eux).
  const trade = http.post(`${BASE_URL}/trades`, JSON.stringify({ recipientId: b.id }), auth(tokenA))
  check(trade, { 'échange : ouvert': (r) => r.status === 200 || r.status === 201 })
  const tradeId = trade.json('id')
  const wsBase = BASE_URL.replace(/^http/, 'ws')

  const started = Date.now()
  const res = ws.connect(`${wsBase}/trades/${tradeId}/live?access_token=${tokenB}`, null, (socket) => {
    socket.on('message', (raw) => {
      const message = JSON.parse(raw)
      if (message.type === 'init') {
        roomJoin.add(Date.now() - started)
        socket.send(JSON.stringify({ type: 'chat', text: 'Bonjour, test de charge' }))
      }
      if (message.type === 'chat') socket.close()
    })
    socket.setTimeout(() => socket.close(), 5000)
  })
  check(res, { 'salle : WebSocket ouvert (101)': (r) => r && r.status === 101 })
  // L'autre joueur consulte l'échange pendant ce temps.
  check(http.get(`${BASE_URL}/trades/${tradeId}`, auth(tokenA)), { 'échange : lu': (r) => r.status === 200 })
  sleep(1)
}
