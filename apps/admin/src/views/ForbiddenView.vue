<script setup lang="ts">
/** Preuve qualité 02 : un joueur se voit refuser l'accès administrateur. */
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'

import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const queryClient = useQueryClient()

async function switchAccount() {
  await auth.logout()
  queryClient.clear()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <main class="flex min-h-dvh flex-col items-center justify-center gap-5 bg-cream px-4 text-center">
    <span class="card-pixel flex size-20 items-center justify-center bg-salmon"
      ><PixelIcon name="lock" :size="40"
    /></span>
    <p class="eyebrow">Erreur 403</p>
    <h1 class="text-4xl font-bold">Accès refusé</h1>
    <p class="max-w-md">
      <template v-if="auth.user">
        Le compte <strong>{{ auth.user.pseudo }}</strong> est un compte joueur.
      </template>
      Les informations d’administration sont réservées au rôle administrateur.
    </p>
    <button v-if="auth.user" type="button" class="btn btn-primary" @click="switchAccount">
      Changer de compte
    </button>
    <RouterLink v-else to="/connexion" class="btn btn-primary">Se connecter</RouterLink>
  </main>
</template>
