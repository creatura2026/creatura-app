<script setup lang="ts">
import type { TradeItem } from '../api/types'
import { familyTint } from '../family'

defineProps<{ label: string; items: TradeItem[]; tone?: string }>()
</script>

<template>
  <div class="min-w-0 flex-1 border-2 border-ink p-3" :class="tone ?? 'bg-white'">
    <p class="text-xs font-bold tracking-wider uppercase">{{ label }}</p>
    <ul class="mt-2 flex flex-col gap-2">
      <li v-for="item in items" :key="item.creature.id" class="flex items-center gap-2">
        <span
          class="card-window grid size-11 shrink-0 place-items-center border-2 border-ink"
          :style="{ backgroundColor: familyTint(item.creature.family.code) }"
          aria-hidden="true"
        >
          <img
            :src="item.creature.imageUrl"
            alt=""
            class="pixelated size-full object-contain p-0.5"
          />
        </span>
        <span class="min-w-0">
          <span class="block truncate font-pixel font-bold"
            >{{ item.creature.name }} × {{ item.quantity }}</span
          >
          <span class="block truncate text-xs"
            >{{ item.creature.family.label }} · {{ item.creature.rarity.label }}</span
          >
        </span>
      </li>
    </ul>
  </div>
</template>
