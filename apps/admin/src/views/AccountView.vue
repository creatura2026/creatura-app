<script setup lang="ts">
/** Mon compte administrateur : changer son mot de passe, supprimer son compte. */
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import type { PasswordChangeRequest } from '@creatura/shared/api/types'
import AccountDeletePanel from '@creatura/shared/ui/AccountDeletePanel.vue'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import PasswordChangeForm from '@creatura/shared/ui/PasswordChangeForm.vue'
import { toast } from '@creatura/shared/toast'

import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const queryClient = useQueryClient()

async function changePassword(body: PasswordChangeRequest) {
  await auth.changePassword(body)
  toast('Mot de passe changé. Vos autres sessions ont été déconnectées.', 'success')
}

const DELETE_CONSEQUENCES = [
  'Vos identifiants sont effacés : vous ne pourrez plus vous connecter.',
  'Les réglages que vous avez modifiés restent en place.',
  'Impossible s’il n’y a pas d’autre administrateur : le jeu doit toujours en avoir un.',
]

async function deleteAccount(password: string) {
  await auth.deleteAccount(password)
  queryClient.clear()
  toast('Votre compte administrateur a été supprimé.', 'info')
  await router.replace({ name: 'login' })
}
</script>

<template>
  <section>
    <PageHeader title="Mon compte" />

    <div class="grid gap-5">
      <div class="card-pixel bg-white p-5">
        <h2 class="font-bold">Sécurité</h2>
        <p class="mt-1 text-sm">
          Changer votre mot de passe déconnecte vos autres sessions (autres appareils, application
          Windows).
        </p>
        <div class="mt-4 max-w-md">
          <PasswordChangeForm :submit="changePassword" />
        </div>
      </div>

      <div class="card-pixel-sm border-brick bg-salmon/40 p-5">
        <h2 class="font-bold">Zone sensible</h2>
        <p class="mt-1 text-sm">La suppression de votre compte est définitive.</p>
        <div class="mt-4 max-w-md">
          <AccountDeletePanel :submit="deleteAccount" :consequences="DELETE_CONSEQUENCES" />
        </div>
      </div>
    </div>
  </section>
</template>
