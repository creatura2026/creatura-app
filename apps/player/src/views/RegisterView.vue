<script setup lang="ts">
/** UC-01 · Créer un compte (pseudonyme, identifiant, mot de passe). */
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { useRouter } from 'vue-router'
import { errorMessage, isApiError } from '@creatura/shared/api/types'
import FormField from '@creatura/shared/ui/FormField.vue'
import { toast } from '@creatura/shared/toast'

import AuthLayout from '@/layouts/AuthLayout.vue'
import { useAuthStore } from '@/stores/auth'

// Règles reprises du contrat OpenAPI (RegisterRequest).
const schema = toTypedSchema(
  z.object({
    pseudo: z
      .string({ required_error: 'Choisissez un pseudonyme.' })
      .trim()
      .min(3, 'Au moins 3 caractères.')
      .max(20, '20 caractères au maximum.')
      .regex(/^[A-Za-z0-9_-]+$/, 'Lettres sans accent, chiffres, « _ » et « - » uniquement.'),
    login: z
      .string({ required_error: 'Choisissez un identifiant.' })
      .trim()
      .min(3, 'Au moins 3 caractères.')
      .max(50, '50 caractères au maximum.'),
    password: z
      .string({ required_error: 'Choisissez un mot de passe.' })
      .min(12, 'Au moins 12 caractères.')
      .max(128, '128 caractères au maximum.'),
  }),
)

const { defineField, errors, handleSubmit, isSubmitting, setFieldError } = useForm({
  validationSchema: schema,
})
const [pseudo, pseudoAttrs] = defineField('pseudo')
const [login, loginAttrs] = defineField('login')
const [password, passwordAttrs] = defineField('password')

const auth = useAuthStore()
const router = useRouter()

const onSubmit = handleSubmit(async (values) => {
  try {
    const user = await auth.register(values)
    toast(`Bienvenue ${user.pseudo} ! Votre premier booster vous attend.`, 'success')
    await router.push({ name: 'booster' })
  } catch (error) {
    if (isApiError(error, 'LOGIN_ALREADY_USED')) setFieldError('login', error.message)
    else if (isApiError(error, 'PSEUDO_ALREADY_USED')) setFieldError('pseudo', error.message)
    else toast(errorMessage(error), 'error')
  }
})
</script>

<template>
  <AuthLayout
    eyebrow="Rejoindre l’aventure"
    title="Créer un compte"
    creature="Flammille"
    tone="sky"
  >
    <form class="flex flex-col gap-4" novalidate @submit="onSubmit">
      <FormField
        v-model="pseudo"
        v-bind="pseudoAttrs"
        label="Pseudonyme"
        hint="Visible par les autres joueurs."
        autocomplete="nickname"
        :error="errors.pseudo"
      />
      <FormField
        v-model="login"
        v-bind="loginAttrs"
        label="Identifiant de connexion"
        hint="Privé : il ne sert qu’à vous connecter."
        autocomplete="username"
        :error="errors.login"
      />
      <FormField
        v-model="password"
        v-bind="passwordAttrs"
        type="password"
        label="Mot de passe"
        hint="12 caractères minimum."
        autocomplete="new-password"
        :error="errors.password"
      />
      <button type="submit" class="btn btn-primary mt-2 w-full text-lg" :disabled="isSubmitting">
        {{ isSubmitting ? 'Création…' : 'Créer le compte' }}
      </button>
    </form>
    <template #footer>
      Déjà inscrit ?
      <RouterLink to="/connexion" class="font-semibold underline underline-offset-2"
        >Se connecter</RouterLink
      >
    </template>
  </AuthLayout>
</template>
