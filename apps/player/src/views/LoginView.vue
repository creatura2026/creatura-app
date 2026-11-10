<script setup lang="ts">
/** UC-02 · Se connecter et retrouver son profil. */
import { ref } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { useRoute, useRouter } from 'vue-router'
import { errorMessage } from '@creatura/shared/api/types'
import FormField from '@creatura/shared/ui/FormField.vue'

import AuthLayout from '@/layouts/AuthLayout.vue'
import { USE_MOCK_API } from '@/api'
import { DEMO_PASSWORD } from '@/api/mock/db'
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
    await auth.login(values)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/accueil'
    await router.replace(redirect.startsWith('/') ? redirect : '/accueil')
  } catch (error) {
    formError.value = errorMessage(error)
  }
})

function fillDemo(account: string) {
  setValues({ login: account, password: DEMO_PASSWORD })
}
</script>

<template>
  <AuthLayout eyebrow="Rejoindre l’aventure" title="Se connecter" creature="Brumel" tone="mint">
    <form class="flex flex-col gap-4" novalidate @submit="onSubmit">
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
    </form>

    <div v-if="USE_MOCK_API" class="mt-5 border-t-2 border-dashed border-ink/40 pt-4 text-sm">
      <p class="font-semibold">Comptes de démonstration (API simulée)</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button type="button" class="chip" @click="fillDemo('demo')">Dresseur</button>
        <button type="button" class="chip" @click="fillDemo('lina')">Lina_42</button>
        <button type="button" class="chip" @click="fillDemo('noe')">Noe</button>
      </div>
    </div>

    <template #footer>
      Pas encore de compte ?
      <RouterLink to="/inscription" class="font-semibold underline underline-offset-2"
        >Créer un compte</RouterLink
      >
    </template>
  </AuthLayout>
</template>
