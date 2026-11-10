<script setup lang="ts">
import { ref } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { useRoute, useRouter } from 'vue-router'
import { errorMessage } from '@creatura/shared/api/types'
import BrandMark from '@creatura/shared/ui/BrandMark.vue'
import FormField from '@creatura/shared/ui/FormField.vue'
import boosterUrl from '@creatura/shared/assets/booster.png'

import { USE_MOCK_API } from '@/api'
import { DEMO_ACCOUNTS } from '@/api/mock'
import { useAuthStore } from '@/stores/auth'

const schema = toTypedSchema(
  z.object({
    login: z
      .string({ required_error: 'Saisissez votre identifiant.' })
      .trim()
      .min(1, 'Saisissez votre identifiant.'),
    password: z
      .string({ required_error: 'Saisissez votre mot de passe.' })
      .min(1, 'Saisissez votre mot de passe.'),
  }),
)
const { defineField, errors, handleSubmit, isSubmitting, setValues } = useForm({
  validationSchema: schema,
})
const [login, loginAttrs] = defineField('login')
const [password, passwordAttrs] = defineField('password')

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const formError = ref<string | null>(
  route.query.expired ? 'Votre session a expiré, reconnectez-vous.' : null,
)

const onSubmit = handleSubmit(async (values) => {
  formError.value = null
  try {
    const user = await auth.login(values)
    if (user.role !== 'ADMIN') return router.replace({ name: 'forbidden' })
    const redirect =
      typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
        ? route.query.redirect
        : '/'
    await router.replace(redirect)
  } catch (error) {
    formError.value = errorMessage(error)
  }
})
</script>

<template>
  <main class="flex min-h-dvh flex-col bg-ink px-4 py-6 text-cream">
    <BrandMark tone="light" suffix="Admin" />
    <div class="mx-auto my-auto w-full max-w-md py-10">
      <img :src="boosterUrl" alt="" class="pixelated mx-auto mb-6 w-28" aria-hidden="true" />
      <p class="eyebrow text-center !text-sun">Piloter Créatura</p>
      <h1 class="mt-2 mb-6 text-center text-3xl font-bold sm:text-4xl">Dashboard administrateur</h1>

      <form
        class="card-pixel flex flex-col gap-4 border-cream bg-sky p-5 text-ink sm:p-6"
        novalidate
        @submit="onSubmit"
      >
        <p
          v-if="formError"
          class="border-2 border-brick bg-salmon px-3 py-2 text-sm font-medium"
          role="alert"
        >
          {{ formError }}
        </p>
        <FormField
          v-model="login"
          v-bind="loginAttrs"
          label="Identifiant"
          autocomplete="username"
          :error="errors.login"
        />
        <FormField
          v-model="password"
          v-bind="passwordAttrs"
          type="password"
          label="Mot de passe"
          autocomplete="current-password"
          :error="errors.password"
        />
        <button type="submit" class="btn btn-primary mt-2 w-full text-lg" :disabled="isSubmitting">
          {{ isSubmitting ? 'Connexion…' : 'Connexion' }}
        </button>

        <div v-if="USE_MOCK_API" class="border-t-2 border-dashed border-ink/40 pt-4 text-sm">
          <p class="font-semibold">Comptes de démonstration (API simulée)</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button type="button" class="chip" @click="setValues(DEMO_ACCOUNTS.admin)">
              Administrateur
            </button>
            <button type="button" class="chip" @click="setValues(DEMO_ACCOUNTS.player)">
              Joueur (refusé)
            </button>
          </div>
        </div>
      </form>
      <p class="mt-6 text-center text-sm text-cream/80">
        Les informations d’administration sont réservées au rôle administrateur.
      </p>
    </div>
  </main>
</template>
