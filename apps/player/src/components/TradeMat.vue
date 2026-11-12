<script setup lang="ts">
/**
 * Tapis d'un joueur dans la salle d'échange : les cartes qu'il donne, posées sur le tapis jaune.
 * Le même composant sert des deux côtés ; seul le tapis du joueur connecté est modifiable.
 */
import { computed } from 'vue'
import type { TradeItem } from '@creatura/shared/api/types'
import CreatureCard from '@creatura/shared/ui/CreatureCard.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'

import { cardCount } from '@/composables/tradeSeats'

const props = defineProps<{
  /** Plaque du tapis : « Vous donnez », « Lina_42 donne »… */
  title: string
  cards: TradeItem[]
  /** Joueur à qui ces cartes appartenaient : il identifie chaque carte pendant son trajet final. */
  ownerId: string
  /** Texte du tapis vide. */
  emptyText: string
  /** Les cartes peuvent être retirées (tapis du joueur connecté, tant qu'il n'a pas validé). */
  editable?: boolean
  /** Tampon posé en travers du tapis (« Validé »). */
  stamp?: string
}>()
defineEmits<{ remove: [creatureId: string] }>()

const total = computed(() => cardCount(props.cards))
</script>

<template>
  <section class="card-pixel play-mat relative flex min-h-72 flex-col gap-3 p-4 sm:p-5">
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="border-2 border-ink bg-ink px-2.5 py-1 text-base font-bold text-cream sm:text-lg">
        {{ title }}
      </h2>
      <p class="text-sm font-semibold">{{ total }} carte{{ total > 1 ? 's' : '' }}</p>
    </header>

    <slot name="hint" />

    <TransitionGroup
      v-if="cards.length"
      tag="ul"
      class="mat-cards"
      enter-active-class="animate-pop-in"
      move-class="mat-move"
    >
      <li
        v-for="item in cards"
        :key="item.creature.id"
        class="relative"
        :data-flip="`${ownerId}:${item.creature.id}`"
      >
        <CreatureCard :creature="item.creature" />
        <span
          v-if="item.quantity > 1"
          class="absolute -top-2 -left-2 border-2 border-ink bg-sun px-1.5 font-pixel text-sm font-bold"
          :aria-label="`${item.quantity} exemplaires`"
        >
          × {{ item.quantity }}
        </span>
        <button
          v-if="editable"
          type="button"
          class="absolute -top-2 -right-2 grid size-8 cursor-pointer place-items-center border-2 border-ink bg-white shadow-pixel-xs transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
          :aria-label="`Retirer un exemplaire de ${item.creature.name}`"
          @click="$emit('remove', item.creature.id)"
        >
          <PixelIcon name="close" :size="14" />
        </button>
      </li>
    </TransitionGroup>

    <!-- Tapis vide : des emplacements en pointillés, comme sur le tapis du booster -->
    <div v-else class="flex flex-1 flex-col justify-center gap-3">
      <ul class="mat-cards" aria-hidden="true">
        <li
          v-for="i in 3"
          :key="i"
          class="aspect-[5/8] border-2 border-dashed border-ink/30 bg-white/25"
        />
      </ul>
      <p class="text-center text-sm font-medium">{{ emptyText }}</p>
    </div>

    <p v-if="stamp" class="mat-stamp" aria-hidden="true">{{ stamp }}</p>

    <footer v-if="$slots.footer" class="mt-auto pt-1">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
/* Les cartes posées sont plus petites que dans la collection, au même format 5:8. */
.mat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6.25rem, 7.25rem));
  justify-content: center;
  gap: 1rem 0.75rem;
}
/* Quand une carte arrive ou part, les autres glissent à leur nouvelle place. */
.mat-move {
  transition: transform 260ms cubic-bezier(0.25, 0.85, 0.3, 1);
}

/* Tampon « Validé » : frappé en travers du tapis, sans gêner la lecture des cartes. */
.mat-stamp {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  rotate: -8deg;
  translate: -50% -50%;
  border: 4px solid var(--color-ink);
  background: var(--color-mint);
  padding: 0.15rem 1rem;
  font-family: var(--font-pixel);
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  box-shadow: var(--shadow-pixel-sm);
  pointer-events: none;
  animation: stamp-down 320ms cubic-bezier(0.2, 0.9, 0.3, 1.25) both;
}
@keyframes stamp-down {
  from {
    opacity: 0;
    scale: 1.7;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mat-move {
    transition: none;
  }
  .mat-stamp {
    animation: none;
  }
}
</style>
