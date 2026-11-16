<script setup lang="ts">
/** UC-02 · Consulter son profil. */
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import ProgressBar from '@creatura/shared/ui/ProgressBar.vue'
import { formatDate, formatPercent } from '@creatura/shared/format'
import { toast } from '@creatura/shared/toast'

import { USE_MOCK_API, demoTools } from '@/api'
import { useMe } from '@/api/queries'
import { useAuthStore } from '@/stores/auth'

const { data: me, isPending, error, refetch } = useMe()
const auth = useAuthStore()
const router = useRouter()
const queryClient = useQueryClient()

async function logout() {
  await auth.logout()
  queryClient.clear()
  await router.replace({ name: 'landing' })
}

async function resetBooster() {
  await demoTools.resetTodayBooster()
  await queryClient.invalidateQueries()
  toast('Booster du jour à nouveau disponible (démo).', 'success')
}

async function resetData() {
  await demoTools.resetData()
  await queryClient.invalidateQueries()
  toast('Données de démonstration réinitialisées.', 'success')
}
</script>

<template>
  <section>
    <PageHeader title="Mon profil" />

    <AsyncState :loading="isPending" :error="error" @retry="refetch()">
      <div v-if="me" class="grid gap-5 md:grid-cols-2">
        <div class="card-pixel bg-sky p-5">
          <div class="flex items-center gap-4">
            <span
              class="flex size-16 items-center justify-center border-2 border-ink bg-white font-pixel text-3xl font-bold"
            >
              {{ me.pseudo.charAt(0).toUpperCase() }}
            </span>
            <div class="min-w-0">
              <p class="truncate font-pixel text-2xl font-bold">{{ me.pseudo }}</p>
              <p class="text-sm">
                {{ me.role === 'ADMIN' ? 'Administrateur' : 'Joueur' }} · inscrit le
                {{ formatDate(me.createdAt) }}
              </p>
            </div>
          </div>
          <button type="button" class="btn btn-secondary mt-6 w-full sm:w-auto" @click="logout">
            <PixelIcon name="logout" :size="18" /> Se déconnecter
          </button>
        </div>

        <div class="card-pixel bg-mint p-5">
          <p class="font-bold">Progression</p>
          <p class="mt-1 text-sm">
            {{ me.progress.ownedCreatures }} / {{ me.progress.totalCreatures }} créatures ·
            {{ formatPercent(me.progress.completionPercent) }} · {{ me.progress.totalCards }} cartes
          </p>
          <div class="mt-3">
            <ProgressBar
              :value="me.progress.ownedCreatures"
              :max="me.progress.totalCreatures"
              label="Progression"
            />
          </div>
        </div>

        <div v-if="USE_MOCK_API" class="card-pixel-sm border-dashed bg-butter p-5 md:col-span-2">
          <p class="font-bold">Mode démonstration</p>
          <p class="mt-1 text-sm">
            L’API n’existe pas encore : les données sont simulées et stockées dans ce navigateur.
            Ces outils disparaîtront avec le vrai serveur.
          </p>
          <div class="mt-4 flex flex-wrap gap-3">
            <button type="button" class="btn btn-secondary" @click="resetBooster">
              <PixelIcon name="booster" :size="18" /> Rendre le booster disponible
            </button>
            <button type="button" class="btn btn-secondary" @click="resetData">
              <PixelIcon name="refresh" :size="18" /> Réinitialiser les données
            </button>
          </div>
        </div>
      </div>
    </AsyncState>
  </section>
</template>
