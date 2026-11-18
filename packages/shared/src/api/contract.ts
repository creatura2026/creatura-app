/**
 * Interface des opérations de l'API, une méthode par `operationId` du contrat OpenAPI.
 * Les écrans ne dépendent que de cette interface : on peut brancher l'implémentation simulée
 * (en attendant le back) ou l'implémentation HTTP (openapi-fetch) sans les modifier.
 */
import type {
  AccountDeleteRequest,
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
  CreateGiftRequest,
  Gift,
  GiftPage,
  ListMyGiftsQuery,
  Creature,
  CreatureOwners,
  CreaturePage,
  Family,
  ListCreaturesQuery,
  ListMyTradesQuery,
  LoginRequest,
  Me,
  PasswordChangeRequest,
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
  AdminCreature,
  AdminCreatureInput,
  AdminCreatureUpdate,
  AdminAccount,
  AdminAccountInput,
  AdminAccountCreated,
  PasswordResetLink,
  PasswordResetRequest,
  AdminPlayerDetail,
  AdminPlayerPage,
  AdminPlayerQuery,
  AdminPlayersQuery,
  DeletionRequest,
  DeletionRequestInput,
  DeletionRequestPage,
  DeletionRequestsQuery,
} from './types'

export interface AuthApi {
  register(body: RegisterRequest): Promise<User>
  login(body: LoginRequest): Promise<AuthTokens>
  logout(): Promise<void>
  getMe(): Promise<Me>
  /**
   * L'utilisateur agit : les jetons sont renouvelés, ce qui repousse l'expiration de la session
   * côté serveur. Sans effet si la session a déjà expiré (la requête suivante renverra 401).
   */
  keepAlive(): Promise<void>
  /** Change le mot de passe ; renvoie les nouveaux jetons de cette session (les autres sont fermées). */
  changePassword(body: PasswordChangeRequest): Promise<AuthTokens>
  /** Supprime (anonymise) le compte ; le client oublie ensuite ses jetons. */
  deleteAccount(body: AccountDeleteRequest): Promise<void>
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
  /** Offre une carte possédée à un autre joueur ; en attente de sa décision. */
  createGift(body: CreateGiftRequest): Promise<Gift>
  /** Mes dons reçus et/ou envoyés (`role`), du plus récent au plus ancien. */
  listMyGifts(query?: ListMyGiftsQuery): Promise<GiftPage>
  /** Le destinataire accepte : les cartes passent dans sa collection. */
  acceptGift(giftId: string): Promise<Gift>
  refuseGift(giftId: string): Promise<Gift>
  /** Le donneur annule son don tant qu'il est en attente. */
  cancelGift(giftId: string): Promise<Gift>
  /** AS-75 (sans session) : nouveau mot de passe avec le jeton d'un lien généré par un admin. */
  resetPassword(body: PasswordResetRequest): Promise<void>
}

export interface AdminApi extends AuthApi {
  listRarities(): Promise<Rarity[]>
  searchPlayers(query: SearchPlayersQuery): Promise<PlayerPage>
  getAdminStats(query?: AdminStatsQuery): Promise<AdminStats>
  listAdminTrades(query?: AdminTradesQuery): Promise<TradePage>
  getRarityDistribution(query?: RarityDistributionQuery): Promise<RarityDistribution>
  getBoosterSettings(): Promise<BoosterSettings>
  /** Appliqué au prochain minuit (heure de Paris), voir `scheduled` dans la réponse. */
  updateBoosterSettings(body: UpdateBoosterSettingsRequest): Promise<BoosterSettings>
  /** Toutes les cartes, y compris celles qui n'apparaissent qu'au prochain minuit. */
  listAdminCreatures(): Promise<AdminCreature[]>
  /** Nouvelle carte, visible et tirable au prochain minuit. */
  createAdminCreature(body: AdminCreatureInput): Promise<AdminCreature>
  /**
   * Met à jour une carte existante. Nom, description, famille et rareté s'appliquent tout de suite ;
   * le nombre d'exemplaires d'une édition limitée est différé au prochain minuit et ne peut
   * qu'augmenter (champs omis inchangés).
   */
  updateCreature(creatureId: string, body: AdminCreatureUpdate): Promise<AdminCreature>
  /** Annule la hausse d'exemplaires prévue au prochain minuit. */
  cancelRarityChange(creatureId: string): Promise<AdminCreature>
  /**
   * Upload un sprite PNG pour une carte et met à jour creature.image.
   * `filename` (sans extension) impose la clé S3 `sprites/<filename>.png` ; sans lui, le nom
   * du fichier choisi est utilisé. Doit être en snake_case minuscules (validé côté serveur).
   */
  uploadSprite(creatureId: string, file: File, filename?: string): Promise<AdminCreature>

  // ── Joueurs et admins (AS-71) ──
  listAdminPlayers(query?: AdminPlayersQuery): Promise<AdminPlayerPage>
  getAdminPlayer(playerId: string, query?: AdminPlayerQuery): Promise<AdminPlayerDetail>
  listDeletionRequests(query?: DeletionRequestsQuery): Promise<DeletionRequestPage>
  /** Seul l'admin choisi (`validatorId`) pourra valider ou refuser. */
  createDeletionRequest(body: DeletionRequestInput): Promise<DeletionRequest>
  /** Par le validateur : les joueurs sont supprimés tout de suite. */
  approveDeletionRequest(requestId: string): Promise<DeletionRequest>
  rejectDeletionRequest(requestId: string): Promise<DeletionRequest>
  /** Par l'admin qui a fait la demande, tant qu'elle est en attente. */
  cancelDeletionRequest(requestId: string): Promise<DeletionRequest>
  listAdmins(): Promise<AdminAccount[]>
  /** Nouvel admin ; le serveur génère son mot de passe provisoire et le renvoie cette seule fois. */
  createAdmin(body: AdminAccountInput): Promise<AdminAccountCreated>
  /** Jamais son propre compte ; ses demandes en attente sont annulées. */
  deactivateAdmin(adminId: string): Promise<AdminAccount>
  /** AS-75 : lien de réinitialisation du mot de passe d'un joueur, 5 minutes, usage unique. */
  createPasswordResetLink(playerId: string): Promise<PasswordResetLink>
}
