<script setup lang="ts">
/** Un échange, vu du joueur connecté (UC-10 décider, UC-11 historique). */
import { computed } from 'vue'
import type { Trade } from '@creatura/shared/api/types'
import TradeStatusBadge from '@creatura/shared/ui/TradeStatusBadge.vue'
import TradeItems from '@creatura/shared/ui/TradeItems.vue'
import { formatDateTime } from '@creatura/shared/format'

import type { TradeDecision } from '@/api/queries'

const props = defineProps<{ trade: Trade; meId: string; busy?: TradeDecision | null }>()
defineEmits<{ decide: [decision: TradeDecision] }>()

const received = computed(() => props.trade.recipient.id === props.meId)
const other = computed(() => (received.value ? props.trade.proposer : props.trade.recipient))
const gives = computed(() => (received.value ? props.trade.requested : props.trade.offered))
const gets = computed(() => (received.value ? props.trade.offered : props.trade.requested))
const pending = computed(() => props.trade.status === 'PENDING')
</script>

<template>
  <article class="card-pixel-sm bg-white">
    <header
      class="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink px-4 py-2.5"
    >
      <p class="font-semibold">
        <template v-if="received">
          <span class="font-pixel">{{ other.pseudo }}</span> vous propose
        </template>
        <template v-else>
          Proposé à <span class="font-pixel">{{ other.pseudo }}</span>
        </template>
      </p>
      <div class="flex items-center gap-2">
        <time class="text-xs text-ink/75" :datetime="trade.decidedAt ?? trade.createdAt">
          {{ formatDateTime(trade.decidedAt ?? trade.createdAt) }}
        </time>
        <TradeStatusBadge :status="trade.status" />
      </div>
    </header>

    <div class="flex flex-col items-stretch gap-2 p-4 sm:flex-row sm:items-center sm:gap-3">
      <TradeItems label="Vous donnez" :items="gives" tone="bg-sky" />
      <span
        class="self-center font-pixel text-3xl leading-none font-bold text-brick"
        aria-hidden="true"
      >
        <span class="sm:hidden">⇅</span><span class="hidden sm:inline">⇄</span>
      </span>
      <TradeItems label="Vous recevez" :items="gets" tone="bg-mint" />
    </div>

    <p
      v-if="trade.status === 'FAILED'"
      class="mx-4 mb-4 border-2 border-brick bg-salmon/50 px-3 py-2 text-sm"
    >
      Une carte n’était plus disponible au moment de l’acceptation : aucun transfert n’a eu lieu.
    </p>

    <footer
      v-if="pending"
      class="flex flex-wrap justify-end gap-3 border-t-2 border-dashed border-ink/30 px-4 py-3"
    >
      <template v-if="received">
        <button
          type="button"
          class="btn btn-danger flex-1 sm:flex-none"
          :disabled="!!busy"
          @click="$emit('decide', 'refuse')"
        >
          {{ busy === 'refuse' ? 'Refus…' : 'Refuser' }}
        </button>
        <button
          type="button"
          class="btn btn-success flex-1 sm:flex-none"
          :disabled="!!busy"
          @click="$emit('decide', 'accept')"
        >
          {{ busy === 'accept' ? 'Transfert…' : 'Accepter' }}
        </button>
      </template>
      <button
        v-else
        type="button"
        class="btn btn-secondary"
        :disabled="!!busy"
        @click="$emit('decide', 'cancel')"
      >
        {{ busy === 'cancel' ? 'Annulation…' : 'Annuler ma proposition' }}
      </button>
    </footer>
  </article>
</template>
