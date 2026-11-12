<script setup lang="ts">
import type { TradeStatus } from '../api/types'

defineProps<{ status: TradeStatus }>()

const STATUS: Record<TradeStatus, { label: string; cls: string }> = {
  PENDING: { label: 'En attente', cls: 'bg-butter' },
  ACCEPTED: { label: 'Conclu', cls: 'bg-mint' },
  REFUSED: { label: 'Refusé', cls: 'bg-salmon' },
  CANCELLED: { label: 'Annulé', cls: 'bg-mist' },
  FAILED: { label: 'Échoué', cls: 'bg-salmon' },
}
</script>

<template>
  <span
    class="inline-flex items-center border-2 border-ink px-2 py-0.5 text-xs font-bold whitespace-nowrap"
    :class="STATUS[status].cls"
  >
    {{ STATUS[status].label }}
  </span>
</template>
