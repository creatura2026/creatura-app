<script setup lang="ts">
/** Affiche le chargement, l'erreur ou le contenu d'une requête. */
import { errorMessage } from '../api/types'
import PixelIcon from './PixelIcon.vue'

defineProps<{ loading: boolean; error?: unknown; loadingLabel?: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="loading" class="flex flex-col items-center gap-3 py-12" role="status">
    <span class="flex gap-1.5" aria-hidden="true">
      <span
        v-for="i in 3"
        :key="i"
        class="size-3 animate-bounce bg-ink"
        :style="{ animationDelay: `${i * 120}ms` }"
      />
    </span>
    <span class="text-sm font-medium">{{ loadingLabel ?? 'Chargement…' }}</span>
  </div>
  <div
    v-else-if="error"
    class="card-pixel-sm flex flex-col items-start gap-3 bg-salmon p-5"
    role="alert"
  >
    <p class="font-bold">Oups, quelque chose s’est mal passé.</p>
    <p class="text-sm">{{ errorMessage(error) }}</p>
    <button type="button" class="btn btn-secondary" @click="$emit('retry')">
      <PixelIcon name="refresh" :size="18" /> Réessayer
    </button>
  </div>
  <slot v-else />
</template>
