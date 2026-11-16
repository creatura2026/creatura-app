<script setup lang="ts">
/**
 * Collection du joueur, sous son tapis : toucher une carte en pose un exemplaire sur le tapis.
 * Toutes les cartes possédées peuvent être données, pas seulement les doublons.
 */
import { computed, ref, useId } from 'vue'
import type { TradeItem } from '@creatura/shared/api/types'
import CreatureCard from '@creatura/shared/ui/CreatureCard.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import { normalize } from '@creatura/shared/api/mock-utils'

import { useCollection } from '@/api/queries'

const props = defineProps<{
  /** Cartes déjà posées sur le tapis du joueur. */
  onMat: TradeItem[]
  /** On ne pose plus de carte (validation donnée, échange terminé, tapis plein). */
  locked?: boolean
  /** Carte que l'autre joueur cherche : elle est mise en avant. */
  wantedId?: string | null
}>()
defineEmits<{ add: [creatureId: string] }>()

const { data, isPending, error, refetch } = useCollection({ ownership: 'owned', pageSize: 100 })
const id = useId()
const search = ref('')

const placed = computed(
  () => new Map(props.onMat.map((item) => [item.creature.id, item.quantity] as const)),
)
const cards = computed(() => {
  const term = normalize(search.value.trim())
  return (data.value?.items ?? [])
    .filter((e) => e.quantity > 0 && (!term || normalize(e.creature.name).includes(term)))
    .map((e) => ({ ...e, left: e.quantity - (placed.value.get(e.creature.id) ?? 0) }))
    .sort(
      (a, b) => Number(b.creature.id === props.wantedId) - Number(a.creature.id === props.wantedId),
    )
})
</script>

<template>
  <section class="card-pixel-sm bg-white" aria-labelledby="picker-title">
    <header
      class="flex flex-col gap-2 border-b-2 border-ink px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <h2 id="picker-title" class="font-bold">Ma collection</h2>
      <div class="relative sm:w-64">
        <label :for="id" class="sr-only">Chercher dans ma collection</label>
        <PixelIcon
          name="search"
          :size="16"
          class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
        />
        <input
          :id="id"
          v-model="search"
          type="search"
          class="field-input !min-h-10 !py-1.5 pl-8 text-sm"
          placeholder="Chercher une carte…"
          autocomplete="off"
        />
      </div>
    </header>

    <div class="p-4">
      <AsyncState :loading="isPending" :error="error" @retry="refetch()">
        <p v-if="!cards.length" class="py-6 text-center text-sm">
          {{
            search
              ? 'Aucune carte de votre collection ne correspond.'
              : 'Votre collection est vide : ouvrez un booster pour obtenir des cartes.'
          }}
        </p>
        <ul v-else class="picker-grid">
          <li v-for="e in cards" :key="e.creature.id" class="relative">
            <button
              type="button"
              class="block w-full cursor-pointer text-left transition-transform enabled:hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="locked || e.left < 1"
              :aria-label="`Poser ${e.creature.name} sur mon tapis, ${e.left} disponible${e.left > 1 ? 's' : ''}`"
              :data-flip="`pick:${e.creature.id}`"
              @click="$emit('add', e.creature.id)"
            >
              <CreatureCard :creature="e.creature" :highlight="e.creature.id === wantedId" />
            </button>
            <span
              class="pointer-events-none absolute -top-2 -left-2 border-2 border-ink px-1.5 font-pixel text-sm font-bold"
              :class="e.left ? 'bg-white' : 'bg-mist'"
              aria-hidden="true"
            >
              {{ e.left }}
            </span>
            <span
              v-if="e.creature.id === wantedId"
              class="pointer-events-none absolute -top-3 -right-2 rotate-6 border-2 border-ink bg-sun px-2 py-0.5 font-pixel text-xs font-bold"
            >
              Recherchée
            </span>
          </li>
        </ul>
      </AsyncState>
    </div>
  </section>
</template>

<style scoped>
.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
  gap: 1rem 0.75rem;
}
@media (min-width: 40rem) {
  .picker-grid {
    grid-template-columns: repeat(auto-fill, minmax(7.25rem, 1fr));
  }
}
</style>
