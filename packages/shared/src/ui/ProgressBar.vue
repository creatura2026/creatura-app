<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ value: number; max: number; label: string }>()
const percent = computed(() => (props.max > 0 ? Math.min(100, (props.value / props.max) * 100) : 0))
</script>

<template>
  <div
    class="h-5 w-full border-2 border-ink bg-white p-0.5"
    role="progressbar"
    :aria-valuenow="value"
    :aria-valuemin="0"
    :aria-valuemax="max"
    :aria-label="label"
  >
    <!-- Remplissage en « blocs » pour rester dans l'esprit pixel -->
    <div
      class="h-full bg-leaf transition-[width] duration-700"
      :style="{
        width: `${percent}%`,
        backgroundImage:
          'repeating-linear-gradient(90deg, transparent 0 10px, rgb(37 51 75 / 0.18) 10px 12px)',
      }"
    />
  </div>
</template>
