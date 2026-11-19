<script setup lang="ts">
/** Un don dans la liste « Dons », vu du joueur connecté (reçu ou envoyé). */
import { computed } from 'vue'
import type { Gift } from '@creatura/shared/api/types'
import { errorMessage } from '@creatura/shared/api/types'
import TradeStatusBadge from '@creatura/shared/ui/TradeStatusBadge.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import { formatDateTime } from '@creatura/shared/format'
import { toast } from '@creatura/shared/toast'

import { useDecideGift } from '@/api/queries'

const props = defineProps<{ gift: Gift; meId: string }>()

const received = computed(() => props.gift.recipient.id === props.meId)
const other = computed(() => (received.value ? props.gift.giver : props.gift.recipient))
const pending = computed(() => props.gift.status === 'PENDING')

const decide = useDecideGift()

async function act(decision: 'accept' | 'refuse' | 'cancel') {
  try {
    const result = await decide.mutateAsync({ id: props.gift.id, decision })
    if (decision === 'accept') {
      toast(
        result.status === 'ACCEPTED'
          ? `${result.quantity} ${result.creature.name} ajoutée(s) à votre collection.`
          : 'Ce don a échoué : la carte n’est plus disponible.',
        result.status === 'ACCEPTED' ? 'success' : 'error',
      )
    }
  } catch (e) {
    toast(errorMessage(e), 'error')
  }
}
</script>

<template>
  <article class="card-pixel-sm bg-white">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink px-4 py-2.5">
      <p class="flex items-center gap-2 font-semibold">
        <PixelIcon name="user" :size="18" />
        <span class="font-pixel">{{ received ? `Reçu de ${other.pseudo}` : `Offert à ${other.pseudo}` }}</span>
      </p>
      <div class="flex items-center gap-2">
        <time class="text-xs text-ink/80" :datetime="gift.decidedAt ?? gift.createdAt">
          {{ formatDateTime(gift.decidedAt ?? gift.createdAt) }}
        </time>
        <span
          v-if="received && pending"
          class="inline-flex items-center border-2 border-ink bg-sun px-2 py-0.5 text-xs font-bold whitespace-nowrap"
        >
          À décider
        </span>
        <TradeStatusBadge v-else :status="gift.status" />
      </div>
    </header>

    <div class="flex items-center gap-3 p-4">
      <img :src="gift.creature.imageUrl" alt="" class="pixelated size-12 shrink-0" />
      <p class="min-w-0 flex-1 font-semibold">
        {{ gift.creature.name }}
        <span class="text-ink/80">× {{ gift.quantity }}</span>
      </p>

      <div v-if="pending" class="flex shrink-0 flex-wrap justify-end gap-2">
        <template v-if="received">
          <button
            type="button"
            class="btn btn-primary !min-h-10 !px-3 text-sm"
            :disabled="decide.isPending.value"
            @click="act('accept')"
          >
            <PixelIcon name="check" :size="16" /> Accepter
          </button>
          <button
            type="button"
            class="btn btn-secondary !min-h-10 !px-3 text-sm"
            :disabled="decide.isPending.value"
            @click="act('refuse')"
          >
            Refuser
          </button>
        </template>
        <button
          v-else
          type="button"
          class="btn btn-secondary !min-h-10 !px-3 text-sm"
          :disabled="decide.isPending.value"
          @click="act('cancel')"
        >
          Annuler
        </button>
      </div>
    </div>
  </article>
</template>
