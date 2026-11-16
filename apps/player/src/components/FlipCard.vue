<script setup lang="ts">
/**
 * Carte de booster : dos visible, puis retournée au toucher.
 *
 * Dans la pile, seule la carte du dessus se retourne (`interactive`) et seule la prochaine carte à
 * retourner laisse deviner sa rareté (`glow`) : une carte peu commune ou rare scintille alors de la
 * couleur de sa rareté, même face cachée (voir `.rarity-frame` dans theme.css). Les cartes
 * au-dessous restent sobres, pour que leur halo ne dépasse pas de la pile.
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
    /** La carte peut être retournée (carte du dessus de la pile). */
    interactive?: boolean
    /** Le dos affiche l'aura de rareté (prochaine carte à retourner). */
    glow?: boolean
  }>(),
  { intro: true, compact: false, interactive: true, glow: true },
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
      class="group relative block h-full w-full transition-transform duration-500 transform-3d motion-reduce:transition-none"
      :style="{ minHeight: compact ? '190px' : '240px' }"
      :class="[
        revealed ? 'rotate-y-180' : '',
        !revealed && interactive ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default',
      ]"
      :aria-label="
        revealed
          ? card.creature.name
          : interactive
            ? `Retourner la carte ${index + 1}, rareté ${card.creature.rarity.label}`
            : `Carte ${index + 1}, face cachée dans la pile`
      "
      :disabled="revealed || !interactive"
      @click="$emit('reveal')"
    >
      <!-- Dos de carte -->
      <span
        class="card-back card-pixel-sm rarity-frame absolute inset-0 flex flex-col items-center justify-center gap-2 border-ink bg-ink backface-hidden"
        :data-rarity="glow ? card.creature.rarity.code : undefined"
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

<style scoped>
/*
 * L'aura s'allume quand la carte arrive en haut de la pile, puis reprend sa respiration habituelle
 * (`rarity-breathe`, theme.css) exactement là où l'allumage s'arrête.
 */
@media (prefers-reduced-motion: no-preference) {
  .card-back.rarity-frame:is(
      [data-rarity='UNCOMMON'],
      [data-rarity='RARE'],
      [data-rarity='LEGENDARY']
    )::before {
    animation:
      aura-ignite 480ms cubic-bezier(0.2, 0.8, 0.3, 1) backwards,
      rarity-breathe 2.6s ease-in-out 480ms infinite alternate;
  }
}
@keyframes aura-ignite {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
  to {
    opacity: 0.6;
    transform: scale(1);
  }
}
</style>
