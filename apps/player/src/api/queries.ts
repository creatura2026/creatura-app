/** Requêtes et mutations TanStack Query autour de l'API. */
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type {
  CollectionQuery,
  CreateTradeRequest,
  ListCreaturesQuery,
  ListMyTradesQuery,
} from '@creatura/shared/api/types'

import { api } from '.'

export const keys = {
  me: ['me'] as const,
  families: ['families'] as const,
  rarities: ['rarities'] as const,
  creatures: (q: ListCreaturesQuery) => ['creatures', q] as const,
  creature: (id: string) => ['creature', id] as const,
  booster: ['booster', 'today'] as const,
  collection: (q: CollectionQuery) => ['collection', q] as const,
  players: (search: string) => ['players', search] as const,
  playerCards: (playerId: string) => ['player-cards', playerId] as const,
  owners: (creatureId: string) => ['owners', creatureId] as const,
  trades: (q: ListMyTradesQuery) => ['trades', q] as const,
  trade: (id: string) => ['trade', id] as const,
}

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.getMe() })
}

export function useFamilies() {
  return useQuery({
    queryKey: keys.families,
    queryFn: () => api.listFamilies(),
    staleTime: Infinity,
  })
}

export function useRarities() {
  return useQuery({
    queryKey: keys.rarities,
    queryFn: () => api.listRarities(),
    staleTime: Infinity,
  })
}

export function useCreatures(query: MaybeRefOrGetter<ListCreaturesQuery>) {
  return useQuery({
    queryKey: computed(() => keys.creatures(toValue(query))),
    queryFn: () => api.listCreatures(toValue(query)),
    placeholderData: keepPreviousData,
  })
}

export function useCreature(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => keys.creature(toValue(id))),
    queryFn: () => api.getCreature(toValue(id)),
  })
}

export function useTodayBooster() {
  return useQuery({ queryKey: keys.booster, queryFn: () => api.getTodayBooster() })
}

export function useCollection(query: MaybeRefOrGetter<CollectionQuery>) {
  return useQuery({
    queryKey: computed(() => keys.collection(toValue(query))),
    queryFn: () => api.getMyCollection(toValue(query)),
    placeholderData: keepPreviousData,
  })
}

export function useSearchPlayers(search: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => keys.players(toValue(search).trim())),
    queryFn: () => api.searchPlayers({ search: toValue(search).trim(), pageSize: 20 }),
    enabled: computed(() => toValue(search).trim().length >= 2),
  })
}

/** Les cartes d'un autre joueur : toutes peuvent être échangées. */
export function usePlayerCards(playerId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => keys.playerCards(toValue(playerId) ?? '')),
    queryFn: () => api.getTradeableCards(toValue(playerId)!),
    enabled: computed(() => !!toValue(playerId)),
  })
}

/** Les joueurs qui possèdent une créature. */
export function useCreatureOwners(creatureId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => keys.owners(toValue(creatureId) ?? '')),
    queryFn: () => api.listCreatureOwners(toValue(creatureId)!),
    enabled: computed(() => !!toValue(creatureId)),
  })
}

export function useMyTrades(query: MaybeRefOrGetter<ListMyTradesQuery>) {
  return useQuery({
    queryKey: computed(() => keys.trades(toValue(query))),
    queryFn: () => api.listMyTrades(toValue(query)),
  })
}

/** Les échanges en cours du joueur (badge de navigation, accueil, liste). */
export function useOpenTrades() {
  return useMyTrades({ status: 'PENDING', pageSize: 100 })
}

export function useTrade(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => keys.trade(toValue(id))),
    queryFn: () => api.getTrade(toValue(id)),
  })
}

/** Après un changement de collection, on rafraîchit tout ce qui en dépend. */
export function useInvalidateCollection() {
  const client = useQueryClient()
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.me }),
      client.invalidateQueries({ queryKey: ['collection'] }),
      client.invalidateQueries({ queryKey: ['trades'] }),
      client.invalidateQueries({ queryKey: ['player-cards'] }),
      client.invalidateQueries({ queryKey: ['owners'] }),
      client.invalidateQueries({ queryKey: keys.booster }),
    ])
}

export function useClaimBooster() {
  const invalidate = useInvalidateCollection()
  return useMutation({ mutationFn: () => api.claimBooster(), onSettled: invalidate })
}

/** Ouvre une salle d'échange avec un joueur (ou rouvre celle qui existe déjà). */
export function useCreateTrade() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateTradeRequest) => api.createTrade(body),
    onSuccess: (trade) => {
      client.setQueryData(keys.trade(trade.id), trade)
      return client.invalidateQueries({ queryKey: ['trades'] })
    },
  })
}

/** Abandonne un échange en cours : le destinataire le refuse, le proposant l'annule. */
export function useLeaveTrade() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, asProposer }: { id: string; asProposer: boolean }) =>
      asProposer ? api.cancelTrade(id) : api.refuseTrade(id),
    onSettled: (_trade, _error, { id }) =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['trades'] }),
        client.invalidateQueries({ queryKey: keys.trade(id) }),
      ]),
  })
}
