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
  BoosterSettings,
  BoosterToday,
  CollectionPage,
  CollectionQuery,
  CreateTradeRequest,
  Creature,
  CreatureOwners,
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
  TradeClientMessage,
  TradePage,
  TradeServerMessage,
  UpdateBoosterSettingsRequest,
  User,
} from './types'

export interface AuthApi {
  register(body: RegisterRequest): Promise<User>
  login(body: LoginRequest): Promise<AuthTokens>
  logout(): Promise<void>
  getMe(): Promise<Me>
}

/**
 * Connexion à une salle d'échange (WebSocket `/trades/{tradeId}/live`).
 * Le serveur répond à chaque action par un message : `trade` pour tout le monde si elle est acceptée,
 * `error` pour son auteur si elle est refusée.
 */
export interface TradeConnection {
  send(message: TradeClientMessage): void
  close(): void
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
  listCreatureOwners(creatureId: string): Promise<CreatureOwners>
  createTrade(body: CreateTradeRequest): Promise<Trade>
  listMyTrades(query?: ListMyTradesQuery): Promise<TradePage>
  getTrade(tradeId: string): Promise<Trade>
  refuseTrade(tradeId: string): Promise<Trade>
  cancelTrade(tradeId: string): Promise<Trade>
  /** Entre dans la salle d'échange ; `onMessage` reçoit `init`, puis chaque événement. */
  joinTrade(tradeId: string, onMessage: (message: TradeServerMessage) => void): TradeConnection
}

export interface AdminApi extends AuthApi {
  listRarities(): Promise<Rarity[]>
  searchPlayers(query: SearchPlayersQuery): Promise<PlayerPage>
  getAdminStats(query?: AdminStatsQuery): Promise<AdminStats>
  listAdminTrades(query?: AdminTradesQuery): Promise<TradePage>
  getRarityDistribution(query?: RarityDistributionQuery): Promise<RarityDistribution>
  getBoosterSettings(): Promise<BoosterSettings>
  updateBoosterSettings(body: UpdateBoosterSettingsRequest): Promise<BoosterSettings>
}
