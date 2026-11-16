<script setup lang="ts">
/** Liste d'échanges : tableau sur grand écran, fiches empilées sur mobile. */
import type { Trade, TradeItem } from '@creatura/shared/api/types'
import TradeStatusBadge from '@creatura/shared/ui/TradeStatusBadge.vue'
import { formatDateTime } from '@creatura/shared/format'

defineProps<{ trades: Trade[]; caption: string }>()

const items = (list: TradeItem[]) =>
  list.map((i) => `${i.creature.name} × ${i.quantity}`).join(', ')
</script>

<template>
  <div>
    <table class="hidden w-full border-collapse text-left text-sm md:table">
      <caption class="sr-only">
        {{
          caption
        }}
      </caption>
      <thead>
        <tr class="border-b-2 border-ink">
          <th scope="col" class="py-2 pr-3 font-semibold">Date</th>
          <th scope="col" class="py-2 pr-3 font-semibold">Comptes</th>
          <th scope="col" class="py-2 pr-3 font-semibold">Proposé</th>
          <th scope="col" class="py-2 pr-3 font-semibold">Demandé</th>
          <th scope="col" class="py-2 font-semibold">État</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in trades" :key="t.id" class="border-b border-line">
          <td class="py-2.5 pr-3 whitespace-nowrap tabular-nums">
            {{ formatDateTime(t.createdAt) }}
          </td>
          <td class="py-2.5 pr-3">
            <span class="font-semibold">{{ t.proposer.pseudo }}</span>
            <span class="px-1 text-brick" aria-label="avec">↔</span>
            <span class="font-semibold">{{ t.recipient.pseudo }}</span>
          </td>
          <td class="py-2.5 pr-3">{{ items(t.offered) }}</td>
          <td class="py-2.5 pr-3">{{ items(t.requested) }}</td>
          <td class="py-2.5"><TradeStatusBadge :status="t.status" /></td>
        </tr>
      </tbody>
    </table>

    <ul class="flex flex-col gap-3 md:hidden" :aria-label="caption">
      <li v-for="t in trades" :key="t.id" class="border-2 border-ink bg-white p-3 text-sm">
        <div class="flex items-center justify-between gap-2">
          <span class="tabular-nums">{{ formatDateTime(t.createdAt) }}</span>
          <TradeStatusBadge :status="t.status" />
        </div>
        <p class="mt-1.5 font-semibold">
          {{ t.proposer.pseudo }} <span class="text-brick" aria-label="avec">↔</span>
          {{ t.recipient.pseudo }}
        </p>
        <p class="mt-1"><span class="text-ink/70">Proposé :</span> {{ items(t.offered) }}</p>
        <p><span class="text-ink/70">Demandé :</span> {{ items(t.requested) }}</p>
      </li>
    </ul>
  </div>
</template>
