<script setup lang="ts">
/**
 * AS-71 · Joueurs : connexions, cartes, demandes de suppression.
 * La suppression passe par une demande validée par un autre admin (DeletionRequestDialog).
 */
import { computed, ref, watch } from 'vue'
import type { AdminPlayer, AdminPlayerSort } from '@creatura/shared/api/types'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import EmptyState from '@creatura/shared/ui/EmptyState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import { useDebounced } from '@creatura/shared/composables'
import { formatDateTime } from '@creatura/shared/format'

import DeletionRequestDialog from '@/components/DeletionRequestDialog.vue'
import DeletionRequestList from '@/components/DeletionRequestList.vue'
import PeriodPicker from '@/components/PeriodPicker.vue'
import { useAdminPlayers, useDeletionRequests, useRequestsToValidate } from '@/api/queries'
import { usePeriod } from '@/usePeriod'

const PAGE_SIZE = 20
const COLUMNS: { key: AdminPlayerSort; label: string; numeric?: boolean }[] = [
  { key: 'pseudo', label: 'Pseudo' },
  { key: 'createdAt', label: 'Inscription' },
  { key: 'lastLoginAt', label: 'Dernière connexion' },
  { key: 'logins', label: 'Connexions (période)', numeric: true },
  { key: 'totalCards', label: 'Cartes', numeric: true },
]

const { period } = usePeriod()
const search = ref('')
const debounced = useDebounced(search)
const sort = ref<AdminPlayerSort>('pseudo')
const order = ref<'asc' | 'desc'>('asc')
const page = ref(1)
watch([debounced, sort, order, period], () => (page.value = 1))

const query = computed(() => ({
  ...period.value,
  search: debounced.value.trim() || undefined,
  sort: sort.value,
  order: order.value,
  page: page.value,
  pageSize: PAGE_SIZE,
}))
const { data, isPending, error, refetch, isFetching } = useAdminPlayers(query)

function sortBy(key: AdminPlayerSort) {
  if (sort.value === key) order.value = order.value === 'asc' ? 'desc' : 'asc'
  else {
    sort.value = key
    // Les plus actifs ou les mieux fournis d'abord
    order.value = key === 'pseudo' ? 'asc' : 'desc'
  }
}
const ariaSort = (key: AdminPlayerSort) =>
  sort.value === key ? (order.value === 'asc' ? 'ascending' : 'descending') : 'none'

// Sélection pour la demande de suppression (conservée d'une page à l'autre)
const selected = ref(new Map<string, AdminPlayer>())
const selectable = (p: AdminPlayer) => !p.pendingDeletionRequestId
function toggle(p: AdminPlayer) {
  if (selected.value.has(p.id)) selected.value.delete(p.id)
  else selected.value.set(p.id, p)
}
const pageSelectable = computed(() => data.value?.items.filter(selectable) ?? [])
const allOnPage = computed(
  () =>
    pageSelectable.value.length > 0 && pageSelectable.value.every((p) => selected.value.has(p.id)),
)
function toggleAll() {
  const select = !allOnPage.value
  for (const p of pageSelectable.value) {
    if (select) selected.value.set(p.id, p)
    else selected.value.delete(p.id)
  }
}
const dialogOpen = ref(false)
function onCreated() {
  dialogOpen.value = false
  selected.value.clear()
}

const toValidate = useRequestsToValidate()
const historyPage = ref(1)
const history = useDeletionRequests(computed(() => ({ page: historyPage.value, pageSize: 10 })))
</script>

<template>
  <section>
    <PageHeader eyebrow="AS-71 · Suivi des joueurs" title="Joueurs">
      <template #actions>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="selected.size === 0"
          @click="dialogOpen = true"
        >
          Demander la suppression{{ selected.size ? ` (${selected.size})` : '' }}
        </button>
      </template>
    </PageHeader>

    <div
      v-if="toValidate.data.value?.items.length"
      class="card-pixel-sm mb-6 bg-butter p-4 sm:p-5"
      aria-labelledby="to-validate-title"
      role="region"
    >
      <h2 id="to-validate-title" class="mb-3 font-sans text-lg font-bold">
        Demandes de suppression à valider ({{ toValidate.data.value.totalItems }})
      </h2>
      <DeletionRequestList
        :requests="toValidate.data.value.items"
        caption="Demandes de suppression qui attendent ma décision"
      />
    </div>

    <PeriodPicker />

    <div class="card-pixel-sm mb-6 bg-white px-4 py-3">
      <label for="player-search" class="field-label !text-xs">Rechercher un joueur</label>
      <input
        id="player-search"
        v-model="search"
        type="search"
        class="field-input !min-h-10 !py-1.5 text-sm"
        placeholder="Partie du pseudonyme"
        autocomplete="off"
      />
    </div>

    <AsyncState :loading="isPending" :error="error" @retry="refetch()">
      <div
        v-if="data"
        class="card-pixel-sm bg-white p-4 sm:p-5"
        :class="isFetching ? 'opacity-70' : ''"
      >
        <p class="mb-3 text-sm" aria-live="polite">
          <strong>{{ data.totalItems }}</strong> joueur{{ data.totalItems > 1 ? 's' : '' }}
          <template v-if="selected.size">
            · <strong>{{ selected.size }}</strong> sélectionné{{ selected.size > 1 ? 's' : '' }}
            <button
              type="button"
              class="ml-1 underline underline-offset-2"
              @click="selected.clear()"
            >
              Tout désélectionner
            </button>
          </template>
        </p>

        <div v-if="data.items.length" class="overflow-x-auto">
          <table class="w-full min-w-[44rem] border-collapse text-left text-sm">
            <caption class="sr-only">
              Joueurs, connexions sur la période et cartes possédées
            </caption>
            <thead>
              <tr class="border-b-2 border-ink">
                <th scope="col" class="w-10 py-2 pr-2">
                  <input
                    type="checkbox"
                    class="size-5 cursor-pointer"
                    :checked="allOnPage"
                    :disabled="!pageSelectable.length"
                    aria-label="Sélectionner tous les joueurs de la page"
                    @change="toggleAll"
                  />
                </th>
                <th
                  v-for="c in COLUMNS"
                  :key="c.key"
                  scope="col"
                  class="py-2 pr-3 font-semibold"
                  :class="c.numeric ? 'text-right' : ''"
                  :aria-sort="ariaSort(c.key)"
                >
                  <button
                    type="button"
                    class="inline-flex min-h-10 cursor-pointer items-center gap-1 font-semibold"
                    @click="sortBy(c.key)"
                  >
                    {{ c.label }}
                    <span aria-hidden="true">{{
                      sort === c.key ? (order === 'asc' ? '▲' : '▼') : ''
                    }}</span>
                  </button>
                </th>
                <th scope="col" class="py-2 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in data.items" :key="p.id" class="border-b border-line">
                <td class="py-2.5 pr-2">
                  <input
                    type="checkbox"
                    class="size-5 cursor-pointer"
                    :checked="selected.has(p.id)"
                    :disabled="!selectable(p)"
                    :aria-label="`Sélectionner ${p.pseudo}`"
                    @change="toggle(p)"
                  />
                </td>
                <td class="py-2.5 pr-3">
                  <RouterLink
                    :to="{
                      name: 'player',
                      params: { playerId: p.id },
                      query: { du: period.from, au: period.to },
                    }"
                    class="font-semibold underline underline-offset-2"
                  >
                    {{ p.pseudo }}
                  </RouterLink>
                  <span class="block text-xs text-ink/80">{{ p.login }}</span>
                </td>
                <td class="py-2.5 pr-3 whitespace-nowrap tabular-nums">
                  {{ formatDateTime(p.createdAt) }}
                </td>
                <td class="py-2.5 pr-3 whitespace-nowrap tabular-nums">
                  {{ p.lastLoginAt ? formatDateTime(p.lastLoginAt) : 'Jamais' }}
                </td>
                <td class="py-2.5 pr-3 text-right tabular-nums">{{ p.loginsInPeriod }}</td>
                <td class="py-2.5 pr-3 text-right tabular-nums">{{ p.totalCards }}</td>
                <td class="py-2.5">
                  <span
                    v-if="p.pendingDeletionRequestId"
                    class="border-2 border-ink bg-butter px-1.5 text-xs font-bold whitespace-nowrap"
                  >
                    Suppression demandée
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <EmptyState v-else title="Aucun joueur" text="Modifiez la recherche." />

        <nav
          v-if="data.totalPages > 1"
          class="mt-4 flex items-center justify-between gap-3"
          aria-label="Pagination des joueurs"
        >
          <button
            type="button"
            class="btn btn-secondary min-h-10 px-3"
            :disabled="page <= 1"
            @click="page--"
          >
            <PixelIcon name="arrow-left" :size="16" />
            <span class="hidden sm:inline">Précédent</span>
          </button>
          <span class="text-sm font-semibold">Page {{ data.page }} / {{ data.totalPages }}</span>
          <button
            type="button"
            class="btn btn-secondary min-h-10 px-3"
            :disabled="page >= data.totalPages"
            @click="page++"
          >
            <span class="hidden sm:inline">Suivant</span>
            <PixelIcon name="arrow-right" :size="16" />
          </button>
        </nav>
      </div>
    </AsyncState>

    <div class="card-pixel-sm mt-6 bg-white p-4 sm:p-5">
      <h2 class="mb-3 font-sans text-lg font-bold">Journal des demandes de suppression</h2>
      <template v-if="history.data.value?.items.length">
        <DeletionRequestList
          :requests="history.data.value.items"
          caption="Toutes les demandes de suppression"
        />
        <nav
          v-if="history.data.value.totalPages > 1"
          class="mt-4 flex items-center justify-between gap-3"
          aria-label="Pagination du journal"
        >
          <button
            type="button"
            class="btn btn-secondary min-h-10 px-3"
            :disabled="historyPage <= 1"
            @click="historyPage--"
          >
            <PixelIcon name="arrow-left" :size="16" />
          </button>
          <span class="text-sm font-semibold">
            Page {{ history.data.value.page }} / {{ history.data.value.totalPages }}
          </span>
          <button
            type="button"
            class="btn btn-secondary min-h-10 px-3"
            :disabled="historyPage >= history.data.value.totalPages"
            @click="historyPage++"
          >
            <PixelIcon name="arrow-right" :size="16" />
          </button>
        </nav>
      </template>
      <p v-else class="text-sm">Aucune demande pour l’instant.</p>
    </div>

    <DeletionRequestDialog
      v-if="dialogOpen"
      :players="[...selected.values()]"
      @close="dialogOpen = false"
      @created="onCreated"
    />
  </section>
</template>
