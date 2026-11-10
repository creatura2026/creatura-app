import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import type { AdminTradesQuery, Period } from '@creatura/shared/api/types'

import { api } from '.'

export function useAdminStats(period: MaybeRefOrGetter<Period>) {
  return useQuery({
    queryKey: computed(() => ['admin', 'stats', toValue(period)]),
    queryFn: () => api.getAdminStats(toValue(period)),
    placeholderData: keepPreviousData,
  })
}

export function useAdminTrades(query: MaybeRefOrGetter<AdminTradesQuery>) {
  return useQuery({
    queryKey: computed(() => ['admin', 'trades', toValue(query)]),
    queryFn: () => api.listAdminTrades(toValue(query)),
    placeholderData: keepPreviousData,
  })
}

export function useRarityDistribution(period: MaybeRefOrGetter<Period>) {
  return useQuery({
    queryKey: computed(() => ['admin', 'rarities', toValue(period)]),
    queryFn: () => api.getRarityDistribution(toValue(period)),
    placeholderData: keepPreviousData,
  })
}

export function useAdminPlayerSearch(search: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => ['admin', 'players', toValue(search).trim()]),
    queryFn: () => api.searchPlayers({ search: toValue(search).trim(), pageSize: 8 }),
    enabled: computed(() => toValue(search).trim().length >= 2),
  })
}
