<script setup lang="ts">
/** UC-10 · Décider — UC-11 · Historique des échanges. */
import { computed, ref } from 'vue'
import type { ListMyTradesQuery, TradeStatus } from '@creatura/shared/api/types'
import { errorMessage, isApiError } from '@creatura/shared/api/types'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import EmptyState from '@creatura/shared/ui/EmptyState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import { toast } from '@creatura/shared/toast'

import TradeCard from '@/components/TradeCard.vue'
import { useMyTrades, useTradeDecision, type TradeDecision } from '@/api/queries'
import { useAuthStore } from '@/stores/auth'

type Tab = 'received' | 'sent' | 'history'

const TABS: { value: Tab; label: string }[] = [
  { value: 'received', label: 'Reçus' },
  { value: 'sent', label: 'Envoyés' },
  { value: 'history', label: 'Historique' },
]

const STATUSES: { value: TradeStatus | ''; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'ACCEPTED', label: 'Acceptés' },
  { value: 'REFUSED', label: 'Refusés' },
  { value: 'CANCELLED', label: 'Annulés' },
  { value: 'FAILED', label: 'Échoués' },
]

const tab = ref<Tab>('received')
const historyStatus = ref<TradeStatus | ''>('')

const query = computed<ListMyTradesQuery>(() =>
  tab.value === 'history'
    ? { role: 'all', status: historyStatus.value || undefined, pageSize: 100 }
    : { role: tab.value, status: 'PENDING', pageSize: 100 },
)

const { data, isPending, error, refetch } = useMyTrades(query)
const history = computed(() =>
  tab.value === 'history'
    ? (data.value?.items ?? []).filter((t) => t.status !== 'PENDING')
    : (data.value?.items ?? []),
)

const auth = useAuthStore()
const decision = useTradeDecision()
const busy = ref<{ id: string; decision: TradeDecision } | null>(null)

const MESSAGES: Record<TradeDecision, string> = {
  accept: 'Échange accepté : les cartes ont été transférées.',
  refuse: 'Échange refusé. Aucune carte n’a bougé.',
  cancel: 'Proposition annulée.',
}

async function decide(id: string, d: TradeDecision) {
  busy.value = { id, decision: d }
  try {
    await decision.mutateAsync({ id, decision: d })
    toast(MESSAGES[d], d === 'accept' ? 'success' : 'info')
  } catch (e) {
    toast(
      isApiError(e, 'CARDS_UNAVAILABLE') ? `Échec : ${e.message}` : errorMessage(e),
      'error',
      6000,
    )
  } finally {
    busy.value = null
  }
}

const EMPTY: Record<Tab, { title: string; text: string }> = {
  received: {
    title: 'Rien en attente',
    text: 'Aucune proposition reçue ne demande votre réponse.',
  },
  sent: { title: 'Aucune proposition', text: 'Vous n’avez pas de proposition en attente.' },
  history: { title: 'Historique vide', text: 'Vos échanges terminés apparaîtront ici.' },
}
</script>

<template>
  <section>
    <PageHeader eyebrow="Expérience joueur" title="Échanges">
      <template #actions>
        <RouterLink to="/echanges/nouveau" class="btn btn-primary">
          <PixelIcon name="plus" :size="18" /> Proposer un échange
        </RouterLink>
      </template>
    </PageHeader>

    <div
      role="tablist"
      aria-label="Type d’échanges"
      class="mb-5 grid grid-cols-3 border-2 border-ink bg-white sm:inline-grid"
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
      <ul v-if="history.length" class="grid gap-5 lg:grid-cols-2">
        <li v-for="t in history" :key="t.id">
          <TradeCard
            :trade="t"
            :me-id="auth.user?.id ?? ''"
            :busy="busy?.id === t.id ? busy.decision : null"
            @decide="decide(t.id, $event)"
          />
        </li>
      </ul>
      <EmptyState v-else :title="EMPTY[tab].title" :text="EMPTY[tab].text">
        <RouterLink to="/echanges/nouveau" class="btn btn-secondary"
          >Proposer un échange</RouterLink
        >
      </EmptyState>
    </AsyncState>

    <aside class="mt-8 grid gap-4 md:grid-cols-2">
      <div class="card-pixel-sm bg-sky p-4 text-sm">
        <p class="font-bold">Disponibilité</p>
        <p class="mt-1">
          Seules les cartes possédées et disponibles peuvent être échangées. Un exemplaire de chaque
          carte vous reste toujours.
        </p>
      </div>
      <div class="card-pixel-sm bg-salmon p-4 text-sm">
        <p class="font-bold">Transfert</p>
        <p class="mt-1">
          Les deux collections changent ensemble ou aucune : ni perte, ni duplication.
        </p>
      </div>
    </aside>
  </section>
</template>
