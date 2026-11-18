/**
 * Alias lisibles sur les types générés depuis `creatura-api.openapi.yaml`.
 * Régénérer `schema.d.ts` avec `pnpm --filter @creatura/shared generate:api` quand le contrat change.
 */
import type { components, operations } from './schema'

type Schemas = components['schemas']
type Query<Op extends keyof operations> = NonNullable<operations[Op]['parameters']['query']>

/** Paramètres de requête, tels que définis par le contrat. */
export type ListCreaturesQuery = Query<'listCreatures'>
export type CollectionQuery = Query<'getMyCollection'>
export type SearchPlayersQuery = Query<'searchPlayers'>
export type ListMyTradesQuery = Query<'listMyTrades'>
export type AdminStatsQuery = Query<'getAdminStats'>
export type AdminTradesQuery = Query<'listAdminTrades'>
export type RarityDistributionQuery = Query<'getRarityDistribution'>

export type Problem = Schemas['Problem']
export type ErrorCode = Schemas['ErrorCode']
export type PageMeta = Schemas['PageMeta']

export type RegisterRequest = Schemas['RegisterRequest']
export type LoginRequest = Schemas['LoginRequest']
export type PasswordChangeRequest = Schemas['PasswordChangeRequest']
export type AccountDeleteRequest = Schemas['AccountDeleteRequest']
export type AuthTokens = Schemas['AuthTokens']
export type Role = Schemas['Role']
export type User = Schemas['User']
export type Me = Schemas['Me']
export type CollectionProgress = Schemas['CollectionProgress']

export type Family = Schemas['Family']
export type RaritySummary = Schemas['RaritySummary']
export type Rarity = Schemas['Rarity']
export type CreatureSummary = Schemas['CreatureSummary']
export type Creature = Schemas['Creature']
export type CreaturePage = Schemas['CreaturePage']

export type BoosterCard = Schemas['BoosterCard']
export type Booster = Schemas['Booster']
export type BoosterToday = Schemas['BoosterToday']

export type CollectionEntry = Schemas['CollectionEntry']
export type CollectionPage = Schemas['CollectionPage']

export type PlayerSummary = Schemas['PlayerSummary']
export type PlayerPage = Schemas['PlayerPage']
export type TradeableCards = Schemas['TradeableCards']
export type CreatureOwners = Schemas['CreatureOwners']
export type TradeItemInput = Schemas['TradeItemInput']
export type CreateTradeRequest = Schemas['CreateTradeRequest']
export type TradeStatus = Schemas['TradeStatus']
export type TradeItem = Schemas['TradeItem']
export type Trade = Schemas['Trade']
export type TradePage = Schemas['TradePage']

/** Salle d'échange (WebSocket) : discussion, messages du client et du serveur. */
export type TradeMessage = Schemas['TradeMessage']
export type TradeClientMessage = Schemas['TradeClientMessage']
export type TradeServerMessage = Schemas['TradeServerMessage']

export type Period = Schemas['Period']
export type DailyCount = Schemas['DailyCount']
export type AdminStats = Schemas['AdminStats']
export type RarityDistribution = Schemas['RarityDistribution']
export type BoosterSettings = Schemas['BoosterSettings']
export type UpdateBoosterSettingsRequest = Schemas['UpdateBoosterSettingsRequest']
export type ScheduledBoosterSettings = Schemas['ScheduledBoosterSettings']
export type RarityWeights = Schemas['RarityWeights']
export type AdminCreature = Schemas['AdminCreature']
export type AdminCreatureInput = Schemas['AdminCreatureInput']
export type RarityChangeInput = Schemas['RarityChangeInput']

/** Joueurs, demandes de suppression et comptes admin (AS-71). */
export type Granularity = Schemas['Granularity']
export type AdminSummary = Schemas['AdminSummary']
export type AdminPlayer = Schemas['AdminPlayer']
export type AdminPlayerPage = Schemas['AdminPlayerPage']
export type AdminPlayerDetail = Schemas['AdminPlayerDetail']
export type DeletionRequestStatus = Schemas['DeletionRequestStatus']
export type DeletionRequest = Schemas['DeletionRequest']
export type DeletionRequestPage = Schemas['DeletionRequestPage']
export type DeletionRequestInput = Schemas['DeletionRequestInput']
export type AdminAccount = Schemas['AdminAccount']
export type AdminAccountInput = Schemas['AdminAccountInput']
export type AdminAccountCreated = Schemas['AdminAccountCreated']

/** Lien de réinitialisation du mot de passe (AS-75). */
export type PasswordResetLink = Schemas['PasswordResetLink']
export type PasswordResetRequest = Schemas['PasswordResetRequest']

export type AdminPlayerSort = 'pseudo' | 'createdAt' | 'lastLoginAt' | 'logins' | 'totalCards'

export interface AdminPlayersQuery {
  from?: string
  to?: string
  /** Partie du pseudonyme */
  search?: string
  sort?: AdminPlayerSort
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface AdminPlayerQuery {
  from?: string
  to?: string
  granularity?: Granularity
}

export interface DeletionRequestsQuery {
  status?: DeletionRequestStatus
  /** Seulement les demandes dont l'admin connecté est le validateur */
  toValidate?: boolean
  page?: number
  pageSize?: number
}

/** Erreur levée par les clients API (réelle ou simulée), porteuse du Problem Details du serveur. */
export class ApiError extends Error {
  readonly problem: Problem

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiError'
    this.problem = problem
  }

  get code(): ErrorCode {
    return this.problem.code
  }

  get status(): number {
    return this.problem.status
  }
}

export function isApiError(error: unknown, code?: ErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code)
}

/** Message affichable pour n'importe quelle erreur. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Une erreur inattendue est survenue.'
}

// ── Dons de carte (contrat « Gift ») ─────────────────────────────────────────
// Types écrits à la main en attendant la régénération du contrat (openapi-typescript).
export type GiftStatus = TradeStatus // mêmes états que l'échange
export type GiftRole = 'all' | 'sent' | 'received'

export interface Gift {
  id: string
  status: GiftStatus
  giver: PlayerSummary
  recipient: PlayerSummary
  creature: CreatureSummary
  quantity: number
  createdAt: string
  decidedAt: string | null
  failureReason?: string | null
}

export type GiftPage = PageMeta & { items: Gift[] }

export interface CreateGiftRequest {
  recipientId: string
  /** Identifiant de la carte dans le catalogue */
  creatureId: string
  quantity?: number
}

export interface ListMyGiftsQuery {
  role?: GiftRole
  status?: GiftStatus
  page?: number
  pageSize?: number
}

/**
 * Mise à jour d'une carte par l'admin ; champs omis inchangés.
 * Nom, description, famille et rareté s'appliquent tout de suite ; le nombre d'exemplaires
 * d'une édition limitée (légendaire) est différé au prochain minuit et ne peut qu'augmenter.
 */
export interface AdminCreatureUpdate {
  name?: string
  description?: string
  family?: string
  rarity?: string
  stock?: number | null
}
