<script setup lang="ts">
/** UC-05 · Consulter toutes les créatures, possédées ou non. */
import { computed, ref } from 'vue'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import CreatureCard from '@creatura/shared/ui/CreatureCard.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import EmptyState from '@creatura/shared/ui/EmptyState.vue'
import { useDebounced } from '@creatura/shared/composables'

import CreatureFilters from '@/components/CreatureFilters.vue'
import { useCreatures } from '@/api/queries'

const search = ref('')
const family = ref('')
const rarity = ref('')
const debouncedSearch = useDebounced(search)

const query = computed(() => ({
  search: debouncedSearch.value.trim() || undefined,
  family: family.value || undefined,
  rarity: rarity.value || undefined,
  pageSize: 100,
}))

const { data, isPending, error, refetch, isFetching } = useCreatures(query)

function reset() {
  search.value = ''
  family.value = ''
  rarity.value = ''
}
</script>

<template>
  <section>
    <PageHeader
      title="Le catalogue"
      subtitle="Toutes les créatures de Créatura, possédées ou non."
    />

    <CreatureFilters
      v-model:search="search"
      v-model:family="family"
      v-model:rarity="rarity"
      title="Catalogue"
    />

    <div class="mt-6">
      <AsyncState :loading="isPending" :error="error" @retry="refetch()">
        <template v-if="data">
          <p class="mb-3 text-sm" aria-live="polite" :class="isFetching ? 'opacity-60' : ''">
            {{ data.totalItems }} créature{{ data.totalItems > 1 ? 's' : '' }}
          </p>
          <ul v-if="data.items.length" class="card-grid">
            <li v-for="c in data.items" :key="c.id">
              <RouterLink
                :to="{ name: 'creature', params: { id: c.id } }"
                class="block h-full transition-transform hover:-translate-y-1"
              >
                <CreatureCard :creature="c" :description="c.description" />
              </RouterLink>
            </li>
          </ul>
          <EmptyState
            v-else
            title="Aucune créature"
            text="Aucune créature ne correspond à ces critères."
          >
            <button type="button" class="btn btn-secondary" @click="reset">
              Effacer les filtres
            </button>
          </EmptyState>
        </template>
      </AsyncState>
    </div>
  </section>
</template>
