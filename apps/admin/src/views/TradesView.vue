<script setup lang="ts">
/** UC-13 · Filtrer les échanges (période, état, joueur). */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { PlayerSummary, TradeStatus } from '@creatura/shared/api/types'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import EmptyState from '@creatura/shared/ui/EmptyState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import { useDebounced } from '@creatura/shared/composables'

import PeriodPicker from '@/components/PeriodPicker.vue'
import TradeTable from '@/components/TradeTable.vue'
import { useAdminPlayerSearch, useAdminTrades } from '@/api/queries'
import { usePeriod } from '@/usePeriod'

const STATUSES: { value: TradeStatus | ''; label: string }[] = [
  { value: '', label: 'Tous les états' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'ACCEPTED', label: 'Acceptés' },
  { value: 'REFUSED', label: 'Refusés' },
  { value: 'CANCELLED', label: 'Annulés' },
  { value: 'FAILED', label: 'Échoués' },
]
const PAGE_SIZE = 20

const route = useRoute()
const router = useRouter()
const { period } = usePeriod()

const status = computed<TradeStatus | ''>(() => {
  const s = route.query.etat
  return STATUSES.some((x) => x.value === s) ? (s as TradeStatus) : ''
})
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const player = ref<PlayerSummary | null>(null)

function setQuery(patch: Record<string, string | undefined>) {
  router.replace({ query: { ...route.query, ...patch } })
}

const query = computed(() => ({
  ...period.value,
  status: status.value || undefined,
  playerId: player.value?.id,
  page: page.value,
  pageSize: PAGE_SIZE,
}))
const { data, isPending, error, refetch, isFetching } = useAdminTrades(query)

// Recherche d'un joueur pour filtrer
const search = ref('')
const debounced = useDebounced(search)
const players = useAdminPlayerSearch(debounced)
const suggestionsOpen = ref(false)
watch(debounced, (v) => (suggestionsOpen.value = v.trim().length >= 2))

function choosePlayer(p: PlayerSummary | null) {
  player.value = p
  search.value = ''
  suggestionsOpen.value = false
  setQuery({ page: undefined })
}
</script>

<template>
  <section>
    <PageHeader eyebrow="UC-13 · Filtrer les échanges" title="Échanges" />
    <PeriodPicker />

    <div class="card-pixel-sm mb-6 grid gap-4 bg-white px-4 py-3 md:grid-cols-2">
      <div>
        <label for="status" class="field-label !text-xs">État</label>
        <select
          id="status"
          class="field-input !min-h-10 !py-1.5 text-sm"
          :value="status"
          @change="
            setQuery({
              etat: ($event.target as HTMLSelectElement).value || undefined,
              page: undefined,
            })
          "
        >
          <option v-for="s in STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </div>
      <div class="relative">
        <label for="player" class="field-label !text-xs">Joueur (proposant ou destinataire)</label>
        <div
          v-if="player"
          class="flex min-h-10 items-center justify-between gap-2 border-2 border-ink bg-sky px-3"
        >
          <span class="font-semibold">{{ player.pseudo }}</span>
          <button
            type="button"
            class="-mr-2 cursor-pointer p-2"
            aria-label="Retirer le filtre joueur"
            @click="choosePlayer(null)"
          >
            <PixelIcon name="close" :size="16" />
          </button>
        </div>
        <template v-else>
          <input
            id="player"
            v-model="search"
            type="search"
            class="field-input !min-h-10 !py-1.5 text-sm"
            placeholder="Pseudonyme (2 lettres min.)"
            autocomplete="off"
            role="combobox"
            :aria-expanded="suggestionsOpen"
            aria-controls="player-suggestions"
            @keydown.escape="suggestionsOpen = false"
          />
          <ul
            v-if="suggestionsOpen"
            id="player-suggestions"
            role="listbox"
            class="card-pixel-sm absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto bg-white"
          >
            <li v-if="players.isPending.value" class="px-3 py-2 text-sm">Recherche…</li>
            <li v-else-if="!players.data.value?.items.length" class="px-3 py-2 text-sm">
              Aucun joueur trouvé.
            </li>
            <li
              v-for="p in players.data.value?.items"
              :key="p.id"
              role="option"
              :aria-selected="false"
            >
              <button
                type="button"
                class="block min-h-11 w-full cursor-pointer px-3 text-left font-semibold hover:bg-mist"
                @click="choosePlayer(p)"
              >
                {{ p.pseudo }}
              </button>
            </li>
          </ul>
        </template>
      </div>
    </div>

    <AsyncState :loading="isPending" :error="error" @retry="refetch()">
      <div
        v-if="data"
        class="card-pixel-sm bg-white p-4 sm:p-5"
        :class="isFetching ? 'opacity-70' : ''"
      >
        <p class="mb-3 text-sm" aria-live="polite">
          <strong>{{ data.totalItems }}</strong> échange{{
            data.totalItems > 1 ? 's' : ''
          }}
          correspondant{{ data.totalItems > 1 ? 's' : '' }}
        </p>
        <TradeTable
          v-if="data.items.length"
          :trades="data.items"
          caption="Échanges correspondant aux filtres"
        />
        <EmptyState v-else title="Aucun échange" text="Modifiez la période ou les filtres." />

        <nav
          v-if="data.totalPages > 1"
          class="mt-4 flex items-center justify-between gap-3"
          aria-label="Pagination"
        >
          <button
            type="button"
            class="btn btn-secondary min-h-10 px-3"
            :disabled="page <= 1"
            @click="setQuery({ page: String(page - 1) })"
          >
            <PixelIcon name="arrow-left" :size="16" />
            <span class="hidden sm:inline">Précédent</span>
          </button>
          <span class="text-sm font-semibold">Page {{ data.page }} / {{ data.totalPages }}</span>
          <button
            type="button"
            class="btn btn-secondary min-h-10 px-3"
            :disabled="page >= data.totalPages"
            @click="setQuery({ page: String(page + 1) })"
          >
            <span class="hidden sm:inline">Suivant</span>
            <PixelIcon name="arrow-right" :size="16" />
          </button>
        </nav>
      </div>
    </AsyncState>
  </section>
</template>
