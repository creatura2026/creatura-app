<script setup lang="ts">
import { dismissToast, toasts } from '../toast'
import PixelIcon from './PixelIcon.vue'

const TONES = { success: 'bg-mint', error: 'bg-salmon', info: 'bg-sky' } as const
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4"
    aria-live="polite"
    role="status"
  >
    <TransitionGroup
      enter-from-class="opacity-0 -translate-y-3"
      leave-to-class="opacity-0"
      enter-active-class="transition duration-200"
      leave-active-class="transition duration-150"
    >
      <div
        v-for="t in toasts"
        :key="t.id"
        class="card-pixel-sm pointer-events-auto flex w-full max-w-md items-start gap-3 px-4 py-3"
        :class="TONES[t.tone]"
      >
        <p class="flex-1 text-sm font-medium">{{ t.message }}</p>
        <button
          type="button"
          class="-m-2 cursor-pointer p-2"
          aria-label="Fermer la notification"
          @click="dismissToast(t.id)"
        >
          <PixelIcon name="close" :size="16" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
