<script setup lang="ts">
/** AS-71 · Un admin créé depuis le dashboard remplace son mot de passe provisoire. */
import { useRouter } from 'vue-router'
import type { PasswordChangeRequest } from '@creatura/shared/api/types'
import BrandMark from '@creatura/shared/ui/BrandMark.vue'
import PasswordChangeForm from '@creatura/shared/ui/PasswordChangeForm.vue'
import { toast } from '@creatura/shared/toast'

import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

/** Même route que « Mon compte » (PUT /me/password) : le serveur lève le mot de passe provisoire. */
async function changePassword(body: PasswordChangeRequest) {
  await auth.changePassword(body)
  toast('Mot de passe enregistré.', 'success')
  await router.replace({ name: 'dashboard' })
}

async function logout() {
  await auth.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <main class="flex min-h-dvh flex-col bg-ink px-4 py-6 text-cream">
    <BrandMark tone="light" suffix="Admin" />
    <div class="mx-auto my-auto w-full max-w-md py-10">
      <p class="eyebrow text-center !text-sun">Première connexion</p>
      <h1 class="mt-2 mb-3 text-center text-3xl font-bold">Choisissez votre mot de passe</h1>
      <p class="mb-6 text-center text-cream/90">
        Bonjour {{ auth.user?.pseudo }}. Votre compte a été créé avec un mot de passe provisoire :
        saisissez-le comme mot de passe actuel, puis choisissez le vôtre pour accéder au dashboard.
      </p>

      <div class="card-pixel flex flex-col gap-4 border-cream bg-sky p-5 text-ink sm:p-6">
        <PasswordChangeForm :submit="changePassword" />
        <button type="button" class="btn btn-secondary w-full" @click="logout">
          Me déconnecter
        </button>
      </div>
    </div>
  </main>
</template>
