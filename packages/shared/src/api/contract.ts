/**
 * Interface des opérations de l'API, une méthode par `operationId` du contrat OpenAPI.
 * Les écrans ne dépendent que de cette interface : on peut brancher l'implémentation simulée
 * (en attendant le back) ou l'implémentation HTTP (openapi-fetch) sans les modifier.
 */
import type {
  AdminStats,
  AdminStatsQuery,
  AdminTradesQuery,
  AuthTokens,
  Booster,
  BoosterToday,
  CollectionPage,
  CollectionQuery,
  CreateTradeRequest,
  Creature,
  CreaturePage,
  Family,
  ListCreaturesQuery,
  ListMyTradesQuery,
  LoginRequest,
  Me,
  PlayerPage,
  Rarity,
  RarityDistribution,
  RarityDistributionQuery,
  RegisterRequest,
  SearchPlayersQuery,
  Trade,
  TradeableCards,
  TradePage,
  User,
} from './types'

export interface AuthApi {
  register(body: RegisterRequest): Promise<User>
  login(body: LoginRequest): Promise<AuthTokens>
  logout(): Promise<void>
  getMe(): Promise<Me>
}

export interface PlayerApi extends AuthApi {
  listFamilies(): Promise<Family[]>
  listRarities(): Promise<Rarity[]>
  listCreatures(query?: ListCreaturesQuery): Promise<CreaturePage>
  getCreature(creatureId: string): Promise<Creature>
  getTodayBooster(): Promise<BoosterToday>
  claimBooster(): Promise<Booster>
  getMyCollection(query?: CollectionQuery): Promise<CollectionPage>
  searchPlayers(query: SearchPlayersQuery): Promise<PlayerPage>
  getTradeableCards(playerId: string): Promise<TradeableCards>
  createTrade(body: CreateTradeRequest): Promise<Trade>
  listMyTrades(query?: ListMyTradesQuery): Promise<TradePage>
  getTrade(tradeId: string): Promise<Trade>
  acceptTrade(tradeId: string): Promise<Trade>
  refuseTrade(tradeId: string): Promise<Trade>
  cancelTrade(tradeId: string): Promise<Trade>
}

export interface AdminApi extends AuthApi {
  listRarities(): Promise<Rarity[]>
  searchPlayers(query: SearchPlayersQuery): Promise<PlayerPage>
  getAdminStats(query?: AdminStatsQuery): Promise<AdminStats>
  listAdminTrades(query?: AdminTradesQuery): Promise<TradePage>
  getRarityDistribution(query?: RarityDistributionQuery): Promise<RarityDistribution>
}
