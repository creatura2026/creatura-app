<script setup lang="ts">
defineProps<{ label: string; value: number | string; detail?: string; tone: string }>()
</script>

<template>
  <div class="card-pixel-sm px-4 py-3" :class="tone">
    <p class="text-sm font-bold">{{ label }}</p>
    <p class="mt-1 font-pixel text-4xl leading-tight font-bold tabular-nums">{{ value }}</p>
    <p v-if="detail" class="text-sm">{{ detail }}</p>
  </div>
</template>
