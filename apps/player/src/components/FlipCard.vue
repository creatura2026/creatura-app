<script setup lang="ts">
/**
 * Carte de booster : dos visible, puis retournée au toucher.
 * Au survol, le liseré de la carte prend la couleur de sa rareté (même face cachée).
 */
import type { BoosterCard } from '@creatura/shared/api/types'
import CreatureCard from '@creatura/shared/ui/CreatureCard.vue'

withDefaults(
  defineProps<{
    card: BoosterCard
    revealed: boolean
    index: number
    /** Petite entrée en fondu ; désactivée quand la carte arrive en jaillissant du sachet. */
    intro?: boolean
  }>(),
  { intro: true },
)
defineEmits<{ reveal: [] }>()

/** Écrans tactiles : pas de survol, on laisse le liseré visible une fois la carte retournée. */
const noHover = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches
</script>

<template>
  <div
    class="perspective-[900px]"
    :class="intro ? 'animate-pop-in' : ''"
    :style="intro ? { animationDelay: `${index * 110}ms` } : undefined"
  >
    <button
      type="button"
      class="group relative block h-full min-h-60 w-full cursor-pointer transition-transform duration-500 transform-3d"
      :class="revealed ? 'rotate-y-180' : 'hover:-translate-y-1'"
      :aria-label="
        revealed
          ? card.creature.name
          : `Retourner la carte ${index + 1}, rareté ${card.creature.rarity.label}`
      "
      :disabled="revealed"
      @click="$emit('reveal')"
    >
      <!-- Dos de carte -->
      <span
        class="card-pixel-sm rarity-frame absolute inset-0 flex flex-col items-center justify-center gap-2 border-ink bg-ink backface-hidden"
        :data-rarity="card.creature.rarity.code"
        aria-hidden="true"
      >
        <span class="absolute inset-2 border-2 border-cream/80" />
        <span class="absolute top-3 left-3 size-3 border-t-4 border-l-4 border-leaf" />
        <span class="absolute right-3 bottom-3 size-3 border-r-4 border-b-4 border-leaf" />
        <span class="font-pixel text-5xl font-bold text-cream">?</span>
        <span
          class="font-pixel text-xs tracking-widest text-cream/80 uppercase group-hover:hidden group-focus-visible:hidden"
        >
          Toucher
        </span>
        <!-- Le nom de la rareté double la couleur (lisible aussi sans distinguer les couleurs) -->
        <span
          class="hidden font-pixel text-xs tracking-widest text-(color:--rarity) uppercase group-hover:inline group-focus-visible:inline"
        >
          {{ card.creature.rarity.label }}
        </span>
      </span>
      <!-- Face -->
      <span class="absolute inset-0 rotate-y-180 backface-hidden">
        <CreatureCard
          :creature="card.creature"
          :highlight="card.isNew"
          :show-rarity="noHover && revealed"
          class="h-full"
        >
          <span
            v-if="card.isNew"
            class="absolute -top-3 -right-2 rotate-6 border-2 border-ink bg-sun px-2 py-0.5 font-pixel text-xs font-bold"
          >
            Nouvelle !
          </span>
        </CreatureCard>
      </span>
    </button>
  </div>
</template>
