<script setup lang="ts">
/**
 * Carte de booster : dos visible, puis retournée au toucher.
 * Les cartes peu communes et rares scintillent légèrement de la couleur de leur rareté, même face
 * cachée (voir `.rarity-frame` dans theme.css).
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
    /** Version compacte (petite illustration), quand la place manque. */
    compact?: boolean
  }>(),
  { intro: true, compact: false },
)
defineEmits<{ reveal: [] }>()
</script>

<template>
  <div
    class="perspective-[900px]"
    :class="intro ? 'animate-pop-in' : ''"
    :style="intro ? { animationDelay: `${index * 110}ms` } : undefined"
  >
    <button
      type="button"
      class="group relative block h-full w-full cursor-pointer transition-transform duration-500 transform-3d"
      :style="{ minHeight: compact ? '190px' : '240px' }"
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
        <span class="font-pixel font-bold text-cream" :class="compact ? 'text-4xl' : 'text-5xl'"
          >?</span
        >
        <span class="font-pixel text-xs tracking-widest text-cream/80 uppercase">Toucher</span>
      </span>
      <!-- Face -->
      <span class="absolute inset-0 rotate-y-180 backface-hidden">
        <CreatureCard
          :creature="card.creature"
          :highlight="card.isNew"
          :size="compact ? 'sm' : 'md'"
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
