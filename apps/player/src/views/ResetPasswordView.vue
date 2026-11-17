<script setup lang="ts">
/**
 * AS-75 · Réinitialiser son mot de passe avec le lien envoyé par un administrateur
 * (`/reinitialiser?jeton=…`, valable 5 minutes, usage unique). Aucune session n'est nécessaire.
 */
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { errorMessage, isApiError } from '@creatura/shared/api/types'
import FormField from '@creatura/shared/ui/FormField.vue'

import AuthLayout from '@/layouts/AuthLayout.vue'
import { api } from '@/api'
import { useAuthStore } from '@/stores/auth'

const MIN_LENGTH = 12

const route = useRoute()
const auth = useAuthStore()
const token = computed(() => (typeof route.query.jeton === 'string' ? route.query.jeton : ''))

const password = ref('')
const confirm = ref('')
const errors = ref<{ password?: string; confirm?: string }>({})
const formError = ref<string | null>(
  token.value ? null : 'Ce lien est incomplet. Demandez-en un nouveau à un administrateur.',
)
const submitting = ref(false)
const done = ref(false)

async function onSubmit() {
  formError.value = null
  errors.value = {
    password:
      password.value.length >= MIN_LENGTH
        ? undefined
        : `Le mot de passe doit contenir au moins ${MIN_LENGTH} caractères.`,
    confirm:
      confirm.value === password.value ? undefined : 'Les deux mots de passe ne correspondent pas.',
  }
  if (errors.value.password || errors.value.confirm || !token.value) return
  submitting.value = true
  try {
    await api.resetPassword({ token: token.value, newPassword: password.value })
    // Les sessions ouvertes sont fermées côté serveur : on oublie aussi celle de cet appareil.
    auth.clearSession()
    done.value = true
  } catch (e) {
    const field = isApiError(e)
      ? e.problem.errors?.find((f) => f.field === 'newPassword')
      : undefined
    if (field) errors.value = { password: field.message }
    else formError.value = errorMessage(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthLayout
    eyebrow="Mot de passe oublié"
    title="Nouveau mot de passe"
    creature="Moussou"
    tone="sky"
  >
    <div v-if="done" class="flex flex-col gap-4" role="status">
      <p class="border-2 border-ink bg-mint px-3 py-2 font-medium">
        Votre mot de passe a été changé. Connectez-vous avec le nouveau.
      </p>
      <RouterLink to="/connexion" class="btn btn-primary w-full text-lg">Se connecter</RouterLink>
    </div>

    <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
      <p
        v-if="formError"
        class="border-2 border-brick bg-salmon px-3 py-2 text-sm font-medium"
        role="alert"
      >
        {{ formError }}
      </p>
      <p class="text-sm">
        Choisissez un nouveau mot de passe. Ce lien ne fonctionne qu’une fois et expire 5 minutes
        après avoir été créé.
      </p>
      <FormField
        v-model="password"
        type="password"
        label="Nouveau mot de passe"
        autocomplete="new-password"
        :hint="`${MIN_LENGTH} caractères minimum.`"
        :error="errors.password"
      />
      <FormField
        v-model="confirm"
        type="password"
        label="Confirmer le nouveau mot de passe"
        autocomplete="new-password"
        :error="errors.confirm"
      />
      <button
        type="submit"
        class="btn btn-primary mt-2 w-full text-lg"
        :disabled="submitting || !token"
      >
        {{ submitting ? 'Enregistrement…' : 'Enregistrer' }}
      </button>
    </form>

    <template #footer>
      <RouterLink to="/connexion" class="font-semibold underline underline-offset-2"
        >Retour à la connexion</RouterLink
      >
    </template>
  </AuthLayout>
</template>
