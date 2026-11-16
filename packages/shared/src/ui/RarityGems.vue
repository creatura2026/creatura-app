<script setup lang="ts">
/** 1 à 4 gemmes pixel de la couleur de la rareté (4 : légendaire). Le libellé est porté par l'aria-label. */
import { computed } from 'vue'
import { rarityColor } from '../rarity'

const props = withDefaults(defineProps<{ code: string; label: string; size?: number }>(), {
  size: 16,
})

const RARITY_GEMS: Record<string, number> = { COMMON: 1, UNCOMMON: 2, RARE: 3, LEGENDARY: 4 }
const count = computed(() => RARITY_GEMS[props.code] ?? 1)
// Trois emplacements d'ordinaire ; un quatrième seulement pour une carte légendaire.
const slots = computed(() => Math.max(3, count.value))
const color = computed(() => rarityColor(props.code))
</script>

<template>
  <p class="flex gap-1" role="img" :aria-label="`Rareté : ${label}`">
    <svg
      v-for="i in slots"
      :key="i"
      viewBox="0 0 8 8"
      :width="size"
      :height="size"
      shape-rendering="crispEdges"
      aria-hidden="true"
    >
      <path
        d="M3 0h2v1h1v1h1v1h1v2H7v1H6v1H5v1H3V7H2V6H1V5H0V3h1V2h1V1h1z"
        fill="var(--color-ink)"
      />
      <path
        d="M3 1h2v1h1v1h1v2H6v1H5v1H3V6H2V5H1V3h1V2h1z"
        :fill="i <= count ? color : '#ffffff'"
      />
      <path v-if="i <= count" d="M3 2h1v1H3zM2 3h1v1H2z" fill="#ffffff" fill-opacity="0.8" />
    </svg>
  </p>
</template>
