<script setup lang="ts">
import { computed } from 'vue'
import type { CreatureSummary } from '../api/types'

const props = withDefaults(
  defineProps<{
    creature: CreatureSummary
    /** Carte non possédée : fond hachuré et point d'interrogation, comme dans le document. */
    missing?: boolean
    /** Quantité possédée à afficher sous la carte. */
    quantity?: number
    description?: string
    size?: 'sm' | 'md'
    /** Mise en avant (carte nouvelle, sélection). */
    highlight?: boolean
  }>(),
  { missing: false, size: 'md', highlight: false },
)

const RARITY_PIPS: Record<string, number> = { COMMON: 1, UNCOMMON: 2, RARE: 3 }
const pips = computed(() => RARITY_PIPS[props.creature.rarity.code] ?? 1)
const isEgg = computed(() => props.creature.imageUrl.startsWith('data:'))
</script>

<template>
  <article
    class="relative flex h-full flex-col items-center bg-white text-center text-ink"
    :class="[
      missing ? 'border-2 border-dashed border-ink' : 'card-pixel-sm',
      size === 'sm' ? 'gap-1 px-2 pt-3 pb-2' : 'gap-1.5 px-3 pt-5 pb-3',
      highlight && !missing ? 'ring-4 ring-sun ring-offset-2 ring-offset-cream' : '',
    ]"
    :aria-label="missing ? `${creature.name}, non possédée` : creature.name"
  >
    <div
      class="flex w-full items-center justify-center"
      :class="[size === 'sm' ? 'h-16' : 'h-24 sm:h-28', missing ? 'hatched' : '']"
    >
      <span v-if="missing" class="font-pixel text-4xl font-bold" aria-hidden="true">?</span>
      <img
        v-else
        :src="creature.imageUrl"
        :alt="`Illustration de ${creature.name}`"
        class="pixelated h-full w-auto object-contain"
        :class="isEgg ? 'p-2' : ''"
        loading="lazy"
        draggable="false"
      />
    </div>

    <h3
      class="mt-1 leading-tight font-bold"
      :class="size === 'sm' ? 'text-sm' : 'text-base sm:text-lg'"
    >
      {{ creature.name }}
    </h3>
    <p class="text-xs text-ink/80 sm:text-sm">
      {{ creature.family.label }} · {{ creature.rarity.label }}
    </p>
    <p class="flex gap-0.5" :aria-label="`Rareté : ${creature.rarity.label}`">
      <span
        v-for="i in 3"
        :key="i"
        class="size-2 border border-ink"
        :class="i <= pips ? 'bg-sun' : 'bg-white'"
        aria-hidden="true"
      />
    </p>
    <p v-if="description" class="text-xs text-ink/80 sm:text-sm">{{ description }}</p>
    <p v-if="missing" class="text-xs font-semibold">Non possédée</p>
    <p v-else-if="quantity !== undefined" class="text-xs sm:text-sm">
      Possédées : <strong>{{ quantity }}</strong>
    </p>
    <slot />
  </article>
</template>
