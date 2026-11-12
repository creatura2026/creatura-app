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
