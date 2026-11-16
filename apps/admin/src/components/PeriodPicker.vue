<script setup lang="ts">
/** Choix de la période : raccourcis + dates libres, dans une seule ligne au-dessus des graphiques. */
import { computed } from 'vue'
import { formatDay, parisToday } from '@creatura/shared/format'

import { PRESETS, usePeriod } from '@/usePeriod'

const { period, setPeriod, setPreset, activePreset } = usePeriod()
const today = parisToday()

const label = computed(() => `${formatDay(period.value.from)} – ${formatDay(period.value.to)}`)

function onDate(field: 'from' | 'to', value: string) {
  if (!value) return
  const next = { ...period.value, [field]: value }
  if (next.from > next.to) {
    if (field === 'from') next.to = next.from
    else next.from = next.to
  }
  setPeriod(next)
}
</script>

<template>
  <div class="card-pixel-sm mb-6 flex flex-wrap items-end gap-x-4 gap-y-3 bg-white px-4 py-3">
    <p class="w-full text-sm font-bold sm:w-auto sm:self-center">
      Période : <span class="whitespace-nowrap">{{ label }}</span>
    </p>
    <div class="flex gap-2" role="group" aria-label="Raccourcis de période">
      <button
        v-for="p in PRESETS"
        :key="p.days"
        type="button"
        class="chip"
        :aria-pressed="activePreset === p.days"
        @click="setPreset(p.days)"
      >
        {{ p.label }}
      </button>
    </div>
    <div class="flex flex-1 flex-wrap gap-3 sm:justify-end">
      <label class="flex min-w-36 flex-1 flex-col text-xs font-semibold sm:flex-none">
        Du
        <input
          type="date"
          class="field-input !min-h-10 !py-1.5 text-sm"
          :value="period.from"
          :max="today"
          @change="onDate('from', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="flex min-w-36 flex-1 flex-col text-xs font-semibold sm:flex-none">
        Au
        <input
          type="date"
          class="field-input !min-h-10 !py-1.5 text-sm"
          :value="period.to"
          :max="today"
          @change="onDate('to', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
  </div>
</template>
