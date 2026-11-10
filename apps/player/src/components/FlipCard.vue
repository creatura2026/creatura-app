<script setup lang="ts">
/** Carte de booster : dos visible, puis retournée au toucher. */
import type { BoosterCard } from '@creatura/shared/api/types'
import CreatureCard from '@creatura/shared/ui/CreatureCard.vue'

defineProps<{ card: BoosterCard; revealed: boolean; index: number }>()
defineEmits<{ reveal: [] }>()
</script>

<template>
  <div class="animate-pop-in perspective-[900px]" :style="{ animationDelay: `${index * 110}ms` }">
    <button
      type="button"
      class="relative block h-full min-h-60 w-full cursor-pointer transition-transform duration-500 transform-3d"
      :class="revealed ? 'rotate-y-180' : 'hover:-translate-y-1'"
      :aria-label="revealed ? card.creature.name : `Retourner la carte ${index + 1}`"
      :disabled="revealed"
      @click="$emit('reveal')"
    >
      <!-- Dos de carte -->
      <span
        class="card-pixel-sm absolute inset-0 flex flex-col items-center justify-center gap-2 border-ink bg-ink backface-hidden"
        aria-hidden="true"
      >
        <span class="absolute inset-2 border-2 border-cream/80" />
        <span class="absolute top-3 left-3 size-3 border-t-4 border-l-4 border-leaf" />
        <span class="absolute right-3 bottom-3 size-3 border-r-4 border-b-4 border-leaf" />
        <span class="font-pixel text-5xl font-bold text-cream">?</span>
        <span class="font-pixel text-xs tracking-widest text-cream/80">TOUCHER</span>
      </span>
      <!-- Face -->
      <span class="absolute inset-0 rotate-y-180 backface-hidden">
        <CreatureCard :creature="card.creature" :highlight="card.isNew" class="h-full">
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
