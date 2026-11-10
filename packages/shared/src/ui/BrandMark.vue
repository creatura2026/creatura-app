<script setup lang="ts">
import boosterUrl from '../assets/booster.png'

withDefaults(defineProps<{ tone?: 'light' | 'dark'; suffix?: string }>(), { tone: 'dark' })
</script>

<template>
  <span
    class="inline-flex items-center gap-2"
    :class="tone === 'light' ? 'text-cream' : 'text-ink'"
  >
    <img :src="boosterUrl" alt="" class="pixelated h-8 w-auto" aria-hidden="true" />
    <span class="font-pixel text-xl leading-none font-bold tracking-wide">CREATURA</span>
    <span
      v-if="suffix"
      class="border-2 border-current px-1.5 py-0.5 font-pixel text-[0.65rem] leading-none tracking-widest uppercase"
    >
      {{ suffix }}
    </span>
  </span>
</template>
