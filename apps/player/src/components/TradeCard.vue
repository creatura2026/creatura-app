<script setup lang="ts">
/** Un échange dans la liste « Mes échanges », vu du joueur connecté. Toute la carte mène à la salle. */
import { computed } from 'vue'
import type { Trade } from '@creatura/shared/api/types'
import TradeStatusBadge from '@creatura/shared/ui/TradeStatusBadge.vue'
import TradeItems from '@creatura/shared/ui/TradeItems.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import { formatDateTime } from '@creatura/shared/format'

import { awaitsMe, seatsOf } from '@/composables/tradeSeats'

const props = defineProps<{ trade: Trade; meId: string }>()

const seats = computed(() => seatsOf(props.trade, props.meId))
const pending = computed(() => props.trade.status === 'PENDING')
const myTurn = computed(() => awaitsMe(props.trade, props.meId))

const progress = computed(() => {
  const { mine, theirs } = seats.value
  if (mine.ready) return `Vous avez validé, en attente de ${theirs.player.pseudo}`
  if (theirs.ready) return `${theirs.player.pseudo} a validé`
  return 'Personne n’a encore validé'
})
</script>

<template>
  <RouterLink
    :to="{ name: 'trade', params: { id: trade.id } }"
    class="card-pixel-sm block bg-white transition-transform hover:-translate-y-0.5"
  >
    <header
      class="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink px-4 py-2.5"
    >
      <p class="flex items-center gap-2 font-semibold">
        <PixelIcon name="user" :size="18" />
        <span class="font-pixel">{{ seats.theirs.player.pseudo }}</span>
      </p>
      <div class="flex items-center gap-2">
        <time class="text-xs text-ink/75" :datetime="trade.decidedAt ?? trade.createdAt">
          {{ formatDateTime(trade.decidedAt ?? trade.createdAt) }}
        </time>
        <span
          v-if="myTurn"
          class="inline-flex items-center border-2 border-ink bg-sun px-2 py-0.5 text-xs font-bold whitespace-nowrap"
        >
          À vous de jouer
        </span>
        <TradeStatusBadge v-else :status="trade.status" />
      </div>
    </header>

    <div class="flex flex-col items-stretch gap-2 p-4 sm:flex-row sm:items-center sm:gap-3">
      <TradeItems
        :label="pending ? 'Vous donnez' : 'Vous avez donné'"
        :items="seats.mine.cards"
        tone="bg-sky"
        empty-text="Aucune carte"
      />
      <span
        class="self-center font-pixel text-3xl leading-none font-bold text-brick"
        aria-hidden="true"
      >
        <span class="sm:hidden">⇅</span><span class="hidden sm:inline">⇄</span>
      </span>
      <TradeItems
        :label="pending ? 'Vous recevez' : 'Vous avez reçu'"
        :items="seats.theirs.cards"
        tone="bg-mint"
        empty-text="Aucune carte"
      />
    </div>

    <footer
      v-if="pending"
      class="flex flex-wrap items-center justify-between gap-2 border-t-2 border-dashed border-ink/30 px-4 py-3 text-sm"
    >
      <span>{{ progress }}</span>
      <span class="inline-flex items-center gap-1.5 font-semibold">
        Entrer dans l’échange <PixelIcon name="arrow-right" :size="16" />
      </span>
    </footer>
  </RouterLink>
</template>
