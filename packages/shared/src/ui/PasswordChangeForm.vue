<script setup lang="ts">
/**
 * Changer son mot de passe : l'actuel, puis le nouveau deux fois (mêmes règles qu'à l'inscription).
 * Les erreurs du serveur sur un champ (mot de passe actuel incorrect…) s'affichent sous ce champ.
 */
import { reactive, ref } from 'vue'
import { errorMessage, isApiError, type PasswordChangeRequest } from '../api/types'
import FormField from './FormField.vue'

const props = defineProps<{ submit: (body: PasswordChangeRequest) => Promise<void> }>()
const emit = defineEmits<{ done: [] }>()

const MIN_LENGTH = 12
const form = reactive({ current: '', next: '', confirm: '' })
const errors = reactive<{ current?: string; next?: string; confirm?: string }>({})
const formError = ref<string | null>(null)
const submitting = ref(false)

const SERVER_FIELDS: Record<string, keyof typeof errors> = {
  currentPassword: 'current',
  newPassword: 'next',
}

function validate(): boolean {
  errors.current = form.current ? undefined : 'Saisissez votre mot de passe actuel.'
  errors.next =
    form.next.length >= MIN_LENGTH
      ? undefined
      : `Le nouveau mot de passe doit contenir au moins ${MIN_LENGTH} caractères.`
  errors.confirm =
    form.confirm === form.next ? undefined : 'Les deux mots de passe ne correspondent pas.'
  return !errors.current && !errors.next && !errors.confirm
}

async function onSubmit() {
  formError.value = null
  if (!validate()) return
  submitting.value = true
  try {
    await props.submit({ currentPassword: form.current, newPassword: form.next })
    form.current = form.next = form.confirm = ''
    emit('done')
  } catch (e) {
    const fields = isApiError(e) ? (e.problem.errors ?? []) : []
    const mapped = fields.filter((f) => SERVER_FIELDS[f.field])
    for (const f of mapped) errors[SERVER_FIELDS[f.field]!] = f.message
    if (!mapped.length) formError.value = errorMessage(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
    <p
      v-if="formError"
      class="border-2 border-brick bg-salmon px-3 py-2 text-sm font-medium"
      role="alert"
    >
      {{ formError }}
    </p>
    <FormField
      v-model="form.current"
      type="password"
      label="Mot de passe actuel"
      autocomplete="current-password"
      :error="errors.current"
    />
    <FormField
      v-model="form.next"
      type="password"
      label="Nouveau mot de passe"
      autocomplete="new-password"
      :hint="`${MIN_LENGTH} caractères minimum.`"
      :error="errors.next"
    />
    <FormField
      v-model="form.confirm"
      type="password"
      label="Confirmer le nouveau mot de passe"
      autocomplete="new-password"
      :error="errors.confirm"
    />
    <button type="submit" class="btn btn-primary w-full sm:w-auto" :disabled="submitting">
      {{ submitting ? 'Enregistrement…' : 'Changer le mot de passe' }}
    </button>
  </form>
</template>
