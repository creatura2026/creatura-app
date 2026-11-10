<script setup lang="ts">
/** UC-06 · Voir sa progression — UC-07 · Rechercher et filtrer sa collection. */
import { computed, ref } from 'vue'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import CreatureCard from '@creatura/shared/ui/CreatureCard.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import EmptyState from '@creatura/shared/ui/EmptyState.vue'
import ProgressBar from '@creatura/shared/ui/ProgressBar.vue'
import { useDebounced } from '@creatura/shared/composables'
import { formatPercent } from '@creatura/shared/format'
import boosterUrl from '@creatura/shared/assets/booster.png'

import CreatureFilters from '@/components/CreatureFilters.vue'
import { useCollection } from '@/api/queries'

type Ownership = 'all' | 'owned' | 'missing'

const search = ref('')
const family = ref('')
const rarity = ref('')
const ownership = ref<Ownership>('all')
const duplicatesOnly = ref(false)
const debouncedSearch = useDebounced(search)

const query = computed(() => ({
  search: debouncedSearch.value.trim() || undefined,
  family: family.value || undefined,
  rarity: rarity.value || undefined,
  ownership: ownership.value,
  duplicatesOnly: duplicatesOnly.value || undefined,
  pageSize: 100,
}))

const { data, isPending, error, refetch, isFetching } = useCollection(query)

const OWNERSHIP: { value: Ownership; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'owned', label: 'Possédées' },
  { value: 'missing', label: 'Manquantes' },
]

const hasFilters = computed(
  () =>
    !!(
      search.value ||
      family.value ||
      rarity.value ||
      ownership.value !== 'all' ||
      duplicatesOnly.value
    ),
)

function reset() {
  search.value = ''
  family.value = ''
  rarity.value = ''
  ownership.value = 'all'
  duplicatesOnly.value = false
}

function toggleDuplicates() {
  duplicatesOnly.value = !duplicatesOnly.value
  if (duplicatesOnly.value && ownership.value === 'missing') ownership.value = 'all'
}
</script>

<template>
  <section>
    <PageHeader eyebrow="Expérience joueur" title="Ma collection" />

    <!-- UC-06 · Progression -->
    <div
      v-if="data"
      class="card-pixel mb-6 grid gap-4 bg-mint p-5 sm:grid-cols-[1fr_auto] sm:items-center"
    >
      <div>
        <p class="font-bold">
          {{ data.progress.ownedCreatures }} créatures sur {{ data.progress.totalCreatures }} ·
          {{ formatPercent(data.progress.completionPercent) }}
        </p>
        <div class="mt-2">
          <ProgressBar
            :value="data.progress.ownedCreatures"
            :max="data.progress.totalCreatures"
            label="Progression de la collection"
          />
        </div>
      </div>
      <p class="font-pixel text-lg sm:text-right">
        <strong class="text-3xl">{{ data.progress.totalCards }}</strong> cartes
      </p>
    </div>

    <!-- UC-07 · Recherche et filtres -->
    <CreatureFilters
      v-model:search="search"
      v-model:family="family"
      v-model:rarity="rarity"
      title="Ma collection"
    >
      <fieldset class="flex flex-wrap gap-2">
        <legend class="sr-only">Possession</legend>
        <button
          v-for="o in OWNERSHIP"
          :key="o.value"
          type="button"
          class="chip"
          :aria-pressed="ownership === o.value"
          @click="ownership = o.value"
        >
          {{ o.label }}
        </button>
        <button type="button" class="chip" :aria-pressed="duplicatesOnly" @click="toggleDuplicates">
          Doublons
        </button>
      </fieldset>
    </CreatureFilters>

    <div class="mt-6">
      <AsyncState :loading="isPending" :error="error" @retry="refetch()">
        <template v-if="data">
          <p class="mb-3 text-sm" aria-live="polite" :class="isFetching ? 'opacity-60' : ''">
            {{ data.totalItems }} résultat{{ data.totalItems > 1 ? 's' : '' }} affiché{{
              data.totalItems > 1 ? 's' : ''
            }}
            <template v-if="duplicatesOnly"> · filtre actif : <strong>doublons</strong></template>
          </p>
          <ul
            v-if="data.items.length"
            class="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4"
          >
            <li v-for="e in data.items" :key="e.creature.id">
              <RouterLink
                :to="{ name: 'creature', params: { id: e.creature.id } }"
                class="block h-full transition-transform hover:-translate-y-1"
              >
                <CreatureCard
                  :creature="e.creature"
                  :missing="e.quantity === 0"
                  :quantity="e.quantity"
                />
              </RouterLink>
            </li>
          </ul>
          <EmptyState
            v-else-if="hasFilters"
            title="Aucun résultat"
            text="Aucune carte de votre collection ne correspond à ces critères."
          >
            <button type="button" class="btn btn-secondary" @click="reset">
              Effacer les filtres
            </button>
          </EmptyState>
          <EmptyState
            v-else
            :image="boosterUrl"
            title="Collection vide"
            text="Ouvrez votre premier booster pour commencer."
          >
            <RouterLink to="/booster" class="btn btn-primary">Ouvrir mon booster</RouterLink>
          </EmptyState>
        </template>
      </AsyncState>
    </div>
  </section>
</template>
