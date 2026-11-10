<script setup lang="ts">
defineProps<{ eyebrow?: string; title: string; subtitle?: string }>()
</script>

<template>
  <header class="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
    <div class="min-w-0">
      <p v-if="eyebrow" class="eyebrow mb-1">{{ eyebrow }}</p>
      <h1 class="text-3xl leading-tight font-bold sm:text-4xl">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-base text-ink/80 sm:text-lg">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
