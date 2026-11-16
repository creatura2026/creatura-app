<script setup lang="ts">
/**
 * Supprimer son compte, en deux temps : le bouton ouvre une confirmation qui explique ce qui
 * disparaît et demande le mot de passe. Placé à l'écart des actions courantes (zone sensible).
 */
import { ref } from 'vue'
import { errorMessage, isApiError } from '../api/types'
import FormField from './FormField.vue'

const props = defineProps<{
  submit: (password: string) => Promise<void>
  /** Ce que la suppression entraîne, affiché dans la confirmation. */
  consequences: string[]
}>()

const confirming = ref(false)
const password = ref('')
const fieldError = ref<string | undefined>()
const formError = ref<string | null>(null)
const submitting = ref(false)

function cancel() {
  confirming.value = false
  password.value = ''
  fieldError.value = undefined
  formError.value = null
}

async function onSubmit() {
  formError.value = null
  fieldError.value = password.value ? undefined : 'Saisissez votre mot de passe pour confirmer.'
  if (fieldError.value) return
  submitting.value = true
  try {
    await props.submit(password.value)
  } catch (e) {
    const field = isApiError(e) ? e.problem.errors?.find((f) => f.field === 'password') : undefined
    if (field) fieldError.value = field.message
    else formError.value = errorMessage(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <button
      v-if="!confirming"
      type="button"
      class="btn btn-danger w-full sm:w-auto"
      @click="confirming = true"
    >
      Supprimer mon compte
    </button>

    <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
      <div class="border-2 border-brick bg-white px-4 py-3 text-sm" role="alert">
        <p class="font-bold">Cette action est définitive.</p>
        <ul class="mt-2 list-disc pl-5">
          <li v-for="item in consequences" :key="item">{{ item }}</li>
        </ul>
      </div>
      <p
        v-if="formError"
        class="border-2 border-brick bg-salmon px-3 py-2 text-sm font-medium"
        role="alert"
      >
        {{ formError }}
      </p>
      <FormField
        v-model="password"
        type="password"
        label="Mot de passe, pour confirmer"
        autocomplete="current-password"
        :error="fieldError"
      />
      <div class="flex flex-wrap gap-3">
        <button type="submit" class="btn btn-danger" :disabled="submitting">
          {{ submitting ? 'Suppression…' : 'Supprimer définitivement' }}
        </button>
        <button type="button" class="btn btn-secondary" :disabled="submitting" @click="cancel">
          Annuler
        </button>
      </div>
    </form>
  </div>
</template>
