/**
 * « Base de données » de l'API simulée, persistée dans le localStorage du navigateur.
 * Elle permet de démontrer la persistance entre sessions (preuve qualité 01) sans back.
 */
import type {
  Booster,
  CreatureSummary,
  Role,
  Trade,
  TradeMessage,
} from '@creatura/shared/api/types'
import { problem } from '@creatura/shared/api/mock-utils'
import { CREATURES } from '@creatura/shared/fixtures/catalog'

export interface MockUser {
  id: string
  pseudo: string
  login: string
  password: string
  role: Role
  createdAt: string
}

export interface MockBooster extends Booster {
  userId: string
}

export interface MockDb {
  version: number
  users: MockUser[]
  /** userId → creatureId → quantité */
  collections: Record<string, Record<string, number>>
  boosters: MockBooster[]
  trades: Trade[]
  /** tradeId → discussion de l'échange, du plus ancien message au plus récent */
  messages: Record<string, TradeMessage[]>
  /** jeton → userId */
  sessions: Record<string, string>
}

const STORAGE_KEY = 'creatura.mock-db'
/** À incrémenter quand la forme des données change : les données de démonstration repartent de zéro. */
const VERSION = 2

export const DEMO_PASSWORD = 'creatura-demo'

const c = (name: string) => CREATURES.find((x) => x.name === name)!

const USERS: MockUser[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    pseudo: 'Dresseur',
    login: 'demo',
    password: DEMO_PASSWORD,
    role: 'PLAYER',
    createdAt: '2026-10-01T09:00:00Z',
  },
  {
    id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    pseudo: 'Lina_42',
    login: 'lina',
    password: DEMO_PASSWORD,
    role: 'PLAYER',
    createdAt: '2026-10-03T18:20:00Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    pseudo: 'Noe',
    login: 'noe',
    password: DEMO_PASSWORD,
    role: 'PLAYER',
    createdAt: '2026-10-05T12:00:00Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    pseudo: 'Mina',
    login: 'mina',
    password: DEMO_PASSWORD,
    role: 'PLAYER',
    createdAt: '2026-10-08T07:45:00Z',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    pseudo: 'Linette',
    login: 'linette',
    password: DEMO_PASSWORD,
    role: 'PLAYER',
    createdAt: '2026-10-12T21:10:00Z',
  },
]

function collection(entries: [string, number][]): Record<string, number> {
  return Object.fromEntries(entries.map(([name, qty]) => [c(name).id, qty]))
}

function summary(name: string) {
  const { id, name: n, family, rarity, imageUrl } = c(name)
  return { id, name: n, family, rarity, imageUrl }
}

function player(index: number) {
  const u = USERS[index]!
  return { id: u.id, pseudo: u.pseudo }
}

const TRADE_LINA = 'aaaaaaaa-0001-4000-8000-000000000001'
const TRADE_NOE = 'aaaaaaaa-0002-4000-8000-000000000002'

function seed(): MockDb {
  const [demo, lina, noe, mina, linette] = USERS.map((u) => u.id) as [
    string,
    string,
    string,
    string,
    string,
  ]
  return {
    version: VERSION,
    users: structuredClone(USERS),
    collections: {
      [demo]: collection([
        ['Moussou', 3],
        ['Flammille', 2],
        ['Glandinet', 1],
        ['Quartzou', 2],
        ['Nuageon', 1],
        ['Lucioline', 1],
      ]),
      [lina]: collection([
        ['Brumel', 2],
        ['Moussou', 1],
        ['Cristille', 1],
        ['Vapeline', 3],
        ['Lucioline', 2],
      ]),
      [noe]: collection([
        ['Cristille', 2],
        ['Ronceline', 2],
        ['Quartzou', 1],
        ['Améthine', 2],
      ]),
      [mina]: collection([
        ['Braisard', 2],
        ['Glandinet', 3],
        ['Nuageon', 2],
        ['Flammille', 1],
      ]),
      [linette]: collection([
        ['Moussou', 2],
        ['Améthine', 1],
      ]),
    },
    boosters: [],
    trades: [
      // Lina a ouvert un échange et posé une carte : à Dresseur de poser les siennes.
      {
        id: TRADE_LINA,
        status: 'PENDING',
        proposer: player(1),
        recipient: player(0),
        offered: [{ creature: summary('Brumel'), quantity: 1 }],
        requested: [],
        proposerReady: false,
        recipientReady: false,
        wanted: summary('Moussou'),
        createdAt: '2026-11-09T17:32:00Z',
        decidedAt: null,
      },
      // Noe a déjà validé : il ne manque que la validation de Dresseur.
      {
        id: TRADE_NOE,
        status: 'PENDING',
        proposer: player(0),
        recipient: player(2),
        offered: [{ creature: summary('Quartzou'), quantity: 1 }],
        requested: [{ creature: summary('Ronceline'), quantity: 1 }],
        proposerReady: false,
        recipientReady: true,
        wanted: summary('Ronceline'),
        createdAt: '2026-11-08T10:05:00Z',
        decidedAt: null,
      },
      {
        id: 'aaaaaaaa-0003-4000-8000-000000000003',
        status: 'ACCEPTED',
        proposer: player(3),
        recipient: player(0),
        offered: [{ creature: summary('Nuageon'), quantity: 1 }],
        requested: [{ creature: summary('Flammille'), quantity: 1 }],
        proposerReady: true,
        recipientReady: true,
        wanted: null,
        createdAt: '2026-11-02T14:00:00Z',
        decidedAt: '2026-11-02T18:41:00Z',
      },
      {
        id: 'aaaaaaaa-0004-4000-8000-000000000004',
        status: 'REFUSED',
        proposer: player(0),
        recipient: player(1),
        offered: [{ creature: summary('Moussou'), quantity: 1 }],
        requested: [],
        proposerReady: false,
        recipientReady: false,
        wanted: summary('Vapeline'),
        createdAt: '2026-10-28T08:10:00Z',
        decidedAt: '2026-10-28T20:02:00Z',
      },
    ],
    messages: {
      [TRADE_LINA]: [
        {
          id: 'bbbbbbbb-0001-4000-8000-000000000001',
          author: player(1),
          text: 'Salut ! Ton Moussou m’intéresse. Je pose un Brumel, ça te va ?',
          sentAt: '2026-11-09T17:33:00Z',
        },
      ],
      [TRADE_NOE]: [
        {
          id: 'bbbbbbbb-0002-4000-8000-000000000001',
          author: player(0),
          text: 'Bonjour Noe, un Quartzou contre ta Ronceline ?',
          sentAt: '2026-11-08T10:06:00Z',
        },
        {
          id: 'bbbbbbbb-0002-4000-8000-000000000002',
          author: player(2),
          text: 'Ça marche, j’ai validé de mon côté.',
          sentAt: '2026-11-08T12:40:00Z',
        },
      ],
    },
    sessions: {},
  }
}

let cache: MockDb | null = null

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Les comptes de démonstration existent toujours après une remise à zéro : on garde leurs sessions. */
function keepDemoSessions(db: MockDb, sessions: Record<string, string>): void {
  const ids = new Set(db.users.map((u) => u.id))
  db.sessions = Object.fromEntries(Object.entries(sessions).filter(([, id]) => ids.has(id)))
}

export function loadDb(): MockDb {
  if (cache) return cache
  const raw = storage()?.getItem(STORAGE_KEY)
  let sessions: Record<string, string> = {}
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MockDb
      if (parsed.version === VERSION) {
        cache = parsed
        return cache
      }
      // Ancienne forme des données : on repart de zéro, sans déconnecter le joueur.
      sessions = parsed.sessions ?? {}
    } catch {
      // Données illisibles : on repart de zéro.
    }
  }
  cache = seed()
  keepDemoSessions(cache, sessions)
  saveDb()
  return cache
}

export function saveDb(): void {
  if (!cache) return
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Stockage indisponible (navigation privée) : les données restent en mémoire.
  }
}

/** Remet les données de démonstration à leur état initial. */
export function resetDb(): void {
  const sessions = cache?.sessions ?? {}
  cache = seed()
  keepDemoSessions(cache, sessions)
  saveDb()
}

// ── Accès aux cartes, communs à l'API simulée et à la salle d'échange ────────

export function toSummary(creatureId: string): CreatureSummary {
  const creature = CREATURES.find((x) => x.id === creatureId)
  if (!creature) throw problem('NOT_FOUND', 'Créature inconnue.')
  const { id, name, family, rarity, imageUrl } = creature
  return { id, name, family, rarity, imageUrl }
}

export function quantityOf(userId: string, creatureId: string): number {
  return loadDb().collections[userId]?.[creatureId] ?? 0
}

export function addCards(userId: string, creatureId: string, delta: number): void {
  const col = (loadDb().collections[userId] ??= {})
  col[creatureId] = (col[creatureId] ?? 0) + delta
  if (col[creatureId] <= 0) delete col[creatureId]
}

/** Pour les tests : oublie le cache mémoire. */
export function clearDbCache(): void {
  cache = null
}
