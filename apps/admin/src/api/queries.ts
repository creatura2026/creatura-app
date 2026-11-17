import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type {
  AdminAccountInput,
  AdminCreatureInput,
  AdminPlayerQuery,
  AdminPlayersQuery,
  AdminTradesQuery,
  DeletionRequestInput,
  DeletionRequestsQuery,
  Period,
  RarityChangeInput,
  UpdateBoosterSettingsRequest,
} from '@creatura/shared/api/types'

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

export function useBoosterSettings() {
  return useQuery({
    queryKey: ['admin', 'booster-settings'],
    queryFn: () => api.getBoosterSettings(),
  })
}

export function useUpdateBoosterSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateBoosterSettingsRequest) => api.updateBoosterSettings(body),
    onSuccess: (settings) => client.setQueryData(['admin', 'booster-settings'], settings),
  })
}

export function useAdminCreatures() {
  return useQuery({ queryKey: ['admin', 'creatures'], queryFn: () => api.listAdminCreatures() })
}

export function useCreateCreature() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: AdminCreatureInput) => api.createAdminCreature(body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin', 'creatures'] }),
  })
}

export function useScheduleRarityChange() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RarityChangeInput }) =>
      api.scheduleRarityChange(id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin', 'creatures'] }),
  })
}

export function useCancelRarityChange() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.cancelRarityChange(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin', 'creatures'] }),
  })
}

export function useUploadSprite() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file, filename }: { id: string; file: File; filename?: string }) =>
      api.uploadSprite(id, file, filename),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin', 'creatures'] }),
  })
}

// ── Joueurs et admins (AS-71) ────────────────────────────────────────────────

export function useAdminPlayers(query: MaybeRefOrGetter<AdminPlayersQuery>) {
  return useQuery({
    queryKey: computed(() => ['admin', 'player-list', toValue(query)]),
    queryFn: () => api.listAdminPlayers(toValue(query)),
    placeholderData: keepPreviousData,
  })
}

export function useAdminPlayer(
  playerId: MaybeRefOrGetter<string>,
  query: MaybeRefOrGetter<AdminPlayerQuery>,
) {
  return useQuery({
    queryKey: computed(() => ['admin', 'player', toValue(playerId), toValue(query)]),
    queryFn: () => api.getAdminPlayer(toValue(playerId), toValue(query)),
    placeholderData: keepPreviousData,
  })
}

export function useDeletionRequests(query: MaybeRefOrGetter<DeletionRequestsQuery>) {
  return useQuery({
    queryKey: computed(() => ['admin', 'deletion-requests', toValue(query)]),
    queryFn: () => api.listDeletionRequests(toValue(query)),
    placeholderData: keepPreviousData,
  })
}

/** Demandes qui attendent ma décision : compteur de l'onglet « Joueurs ». */
export function useRequestsToValidate() {
  return useQuery({
    queryKey: ['admin', 'deletion-requests', { status: 'PENDING', toValidate: true }],
    queryFn: () => api.listDeletionRequests({ status: 'PENDING', toValidate: true, pageSize: 100 }),
    refetchInterval: 60_000,
  })
}

/** Après une demande ou une décision : joueurs et demandes changent ensemble. */
function useRefreshPlayers() {
  const client = useQueryClient()
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['admin', 'player-list'] }),
      client.invalidateQueries({ queryKey: ['admin', 'player'] }),
      client.invalidateQueries({ queryKey: ['admin', 'deletion-requests'] }),
    ])
}

export function useCreateDeletionRequest() {
  const refresh = useRefreshPlayers()
  return useMutation({
    mutationFn: (body: DeletionRequestInput) => api.createDeletionRequest(body),
    onSuccess: refresh,
  })
}

export function useDecideDeletionRequest() {
  const refresh = useRefreshPlayers()
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' | 'cancel' }) =>
      decision === 'approve'
        ? api.approveDeletionRequest(id)
        : decision === 'reject'
          ? api.rejectDeletionRequest(id)
          : api.cancelDeletionRequest(id),
    onSuccess: refresh,
  })
}

export function useAdmins() {
  return useQuery({ queryKey: ['admin', 'admins'], queryFn: () => api.listAdmins() })
}

export function useCreateAdmin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: AdminAccountInput) => api.createAdmin(body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin', 'admins'] }),
  })
}

export function useDeactivateAdmin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (adminId: string) => api.deactivateAdmin(adminId),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['admin', 'admins'] }),
        // Ses demandes en attente sont annulées
        client.invalidateQueries({ queryKey: ['admin', 'deletion-requests'] }),
        client.invalidateQueries({ queryKey: ['admin', 'player-list'] }),
      ]),
  })
}
