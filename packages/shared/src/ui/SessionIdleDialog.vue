<script setup lang="ts">
/** Avertissement avant l'expiration de la session pour inactivité (voir `idle.ts`). */
import { onMounted, ref } from 'vue'

defineProps<{ secondsLeft: number }>()
const emit = defineEmits<{ stay: []; logout: [] }>()

const stayButton = ref<HTMLButtonElement | null>(null)
onMounted(() => stayButton.value?.focus())
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div
      class="card-pixel-sm w-full max-w-sm bg-white px-5 py-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-idle-title"
      aria-describedby="session-idle-text"
    >
      <h2 id="session-idle-title" class="text-lg font-bold">Votre session va expirer</h2>
      <p id="session-idle-text" class="mt-2 text-sm" aria-live="polite">
        Sans action de votre part, vous serez déconnecté dans
        <strong>{{ secondsLeft }} s</strong>.
      </p>
      <div class="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" class="btn btn-secondary" @click="emit('logout')">
          Me déconnecter
        </button>
        <button ref="stayButton" type="button" class="btn btn-primary" @click="emit('stay')">
          Rester connecté
        </button>
      </div>
    </div>
  </div>
</template>
