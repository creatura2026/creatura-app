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
  tradeable: (playerId: string) => ['tradeable', playerId] as const,
  trades: (q: ListMyTradesQuery) => ['trades', q] as const,
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

export function useTradeableCards(playerId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => keys.tradeable(toValue(playerId) ?? '')),
    queryFn: () => api.getTradeableCards(toValue(playerId)!),
    enabled: computed(() => !!toValue(playerId)),
  })
}

export function useMyTrades(query: MaybeRefOrGetter<ListMyTradesQuery>) {
  return useQuery({
    queryKey: computed(() => keys.trades(toValue(query))),
    queryFn: () => api.listMyTrades(toValue(query)),
  })
}

/** Après un changement de collection, on rafraîchit tout ce qui en dépend. */
function useInvalidateCollection() {
  const client = useQueryClient()
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.me }),
      client.invalidateQueries({ queryKey: ['collection'] }),
      client.invalidateQueries({ queryKey: ['trades'] }),
      client.invalidateQueries({ queryKey: ['tradeable'] }),
      client.invalidateQueries({ queryKey: keys.booster }),
    ])
}

export function useClaimBooster() {
  const invalidate = useInvalidateCollection()
  return useMutation({ mutationFn: () => api.claimBooster(), onSettled: invalidate })
}

export function useCreateTrade() {
  const invalidate = useInvalidateCollection()
  return useMutation({
    mutationFn: (body: CreateTradeRequest) => api.createTrade(body),
    onSuccess: invalidate,
  })
}

export type TradeDecision = 'accept' | 'refuse' | 'cancel'

export function useTradeDecision() {
  const invalidate = useInvalidateCollection()
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: TradeDecision }) =>
      decision === 'accept'
        ? api.acceptTrade(id)
        : decision === 'refuse'
          ? api.refuseTrade(id)
          : api.cancelTrade(id),
    // Même en cas d'échec (carte indisponible → FAILED), l'état a changé côté serveur.
    onSettled: invalidate,
  })
}
