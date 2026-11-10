<script setup lang="ts">
defineProps<{ title: string; text?: string; image?: string }>()
</script>

<template>
  <div
    class="flex flex-col items-center gap-3 border-2 border-dashed border-ink bg-white/60 px-6 py-10 text-center"
  >
    <img
      v-if="image"
      :src="image"
      alt=""
      class="pixelated h-20 w-auto opacity-80"
      aria-hidden="true"
    />
    <p class="font-pixel text-xl font-bold">{{ title }}</p>
    <p v-if="text" class="max-w-sm text-sm text-ink/80">{{ text }}</p>
    <slot />
  </div>
</template>
