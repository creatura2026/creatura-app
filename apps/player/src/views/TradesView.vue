<script setup lang="ts">
/** UC-10 · UC-11 — Échanges en cours et historique. */
import { computed, ref } from 'vue'
import type { ListMyTradesQuery, TradeStatus } from '@creatura/shared/api/types'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import EmptyState from '@creatura/shared/ui/EmptyState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'

import TradeCard from '@/components/TradeCard.vue'
import { useMyTrades } from '@/api/queries'
import { awaitsMe } from '@/composables/tradeSeats'
import { useAuthStore } from '@/stores/auth'

type Tab = 'open' | 'history'

const TABS: { value: Tab; label: string }[] = [
  { value: 'open', label: 'En cours' },
  { value: 'history', label: 'Historique' },
]

const STATUSES: { value: TradeStatus | ''; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'ACCEPTED', label: 'Conclus' },
  { value: 'REFUSED', label: 'Refusés' },
  { value: 'CANCELLED', label: 'Annulés' },
  { value: 'FAILED', label: 'Échoués' },
]

const tab = ref<Tab>('open')
const historyStatus = ref<TradeStatus | ''>('')

const query = computed<ListMyTradesQuery>(() =>
  tab.value === 'history'
    ? { role: 'all', status: historyStatus.value || undefined, pageSize: 100 }
    : { role: 'all', status: 'PENDING', pageSize: 100 },
)

const auth = useAuthStore()
const meId = computed(() => auth.user?.id ?? '')
const { data, isPending, error, refetch } = useMyTrades(query)

/** En cours : ceux qui attendent le joueur d'abord. Historique : tout sauf ce qui est en cours. */
const trades = computed(() => {
  const items = data.value?.items ?? []
  if (tab.value === 'history') return items.filter((t) => t.status !== 'PENDING')
  return [...items].sort(
    (a, b) => Number(awaitsMe(b, meId.value)) - Number(awaitsMe(a, meId.value)),
  )
})

const EMPTY: Record<Tab, { title: string; text: string }> = {
  open: {
    title: 'Aucun échange en cours',
    text: 'Ouvrez un échange avec un joueur, ou cherchez une carte qui vous manque.',
  },
  history: { title: 'Historique vide', text: 'Vos échanges terminés apparaîtront ici.' },
}
</script>

<template>
  <section>
    <PageHeader title="Échanges">
      <template #actions>
        <RouterLink to="/echanges/nouveau" class="btn btn-primary">
          <PixelIcon name="plus" :size="18" /> Ouvrir un échange
        </RouterLink>
      </template>
    </PageHeader>

    <div
      role="tablist"
      aria-label="Échanges"
      class="mb-5 grid grid-cols-2 border-2 border-ink bg-white sm:inline-grid"
    >
      <button
        v-for="t in TABS"
        :key="t.value"
        type="button"
        role="tab"
        class="min-h-11 cursor-pointer px-4 font-semibold not-last:border-r-2 not-last:border-ink sm:px-6"
        :class="tab === t.value ? 'bg-ink text-cream' : 'hover:bg-mist'"
        :aria-selected="tab === t.value"
        @click="tab = t.value"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="tab === 'history'" class="mb-5 flex flex-wrap gap-2">
      <button
        v-for="s in STATUSES"
        :key="s.value"
        type="button"
        class="chip"
        :aria-pressed="historyStatus === s.value"
        @click="historyStatus = s.value"
      >
        {{ s.label }}
      </button>
    </div>

    <AsyncState :loading="isPending" :error="error" @retry="refetch()">
      <ul v-if="trades.length" class="grid gap-5 lg:grid-cols-2">
        <li v-for="t in trades" :key="t.id">
          <TradeCard :trade="t" :me-id="meId" />
        </li>
      </ul>
      <EmptyState v-else :title="EMPTY[tab].title" :text="EMPTY[tab].text">
        <RouterLink to="/echanges/nouveau" class="btn btn-secondary">Ouvrir un échange</RouterLink>
      </EmptyState>
    </AsyncState>
  </section>
</template>
