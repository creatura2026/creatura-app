<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import ProgressBar from '@creatura/shared/ui/ProgressBar.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import boosterUrl from '@creatura/shared/assets/booster.png'
import { formatPercent } from '@creatura/shared/format'

import { useMe, useMyTrades } from '@/api/queries'

const { data: me, isPending, error, refetch } = useMe()
const { data: received } = useMyTrades({ role: 'received', status: 'PENDING', pageSize: 1 })
const { data: sent } = useMyTrades({ role: 'sent', status: 'PENDING', pageSize: 1 })

const pendingReceived = computed(() => received.value?.totalItems ?? 0)
const pendingSent = computed(() => sent.value?.totalItems ?? 0)
</script>

<template>
  <section>
    <PageHeader
      eyebrow="Expérience joueur"
      :title="me ? `Bonjour, ${me.pseudo} !` : 'Bonjour !'"
      subtitle="Ouvrez, collectionnez, échangez."
    />

    <AsyncState :loading="isPending" :error="error" @retry="refetch()">
      <div v-if="me" class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <!-- Booster du jour -->
        <RouterLink
          to="/booster"
          class="card-pixel group flex items-center gap-4 bg-butter p-5 transition-transform hover:-translate-y-0.5 md:col-span-2 lg:col-span-1 lg:row-span-2 lg:flex-col lg:justify-center lg:text-center"
        >
          <img
            :src="boosterUrl"
            alt=""
            class="pixelated w-24 shrink-0 sm:w-28 lg:w-40"
            :class="
              me.boosterAvailableToday ? 'group-hover:animate-wiggle' : 'opacity-60 grayscale-[40%]'
            "
            aria-hidden="true"
          />
          <div>
            <p class="text-xs font-bold tracking-wider uppercase">Booster du jour</p>
            <p class="mt-1 font-pixel text-2xl font-bold">
              {{ me.boosterAvailableToday ? 'Disponible !' : 'Déjà ouvert' }}
            </p>
            <p class="mt-1 text-sm">
              {{
                me.boosterAvailableToday
                  ? 'Réclamez-le pour ajouter de nouvelles cartes à votre collection.'
                  : 'Revenez demain pour un nouveau booster.'
              }}
            </p>
            <span
              v-if="me.boosterAvailableToday"
              class="btn btn-primary mt-3 bg-white whitespace-nowrap"
              >Ouvrir</span
            >
          </div>
        </RouterLink>

        <!-- Progression (UC-06) -->
        <RouterLink
          to="/collection"
          class="card-pixel block bg-mint p-5 transition-transform hover:-translate-y-0.5"
        >
          <p class="flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
            <PixelIcon name="collection" :size="16" /> Ma collection
          </p>
          <p class="mt-2 font-pixel text-3xl font-bold">
            {{ me.progress.ownedCreatures }} / {{ me.progress.totalCreatures }}
          </p>
          <p class="mb-3 text-sm">
            créatures découvertes · {{ formatPercent(me.progress.completionPercent) }}
          </p>
          <ProgressBar
            :value="me.progress.ownedCreatures"
            :max="me.progress.totalCreatures"
            label="Progression de la collection"
          />
          <p class="mt-3 text-sm">{{ me.progress.totalCards }} cartes au total, doublons compris</p>
        </RouterLink>

        <!-- Échanges -->
        <RouterLink
          to="/echanges"
          class="card-pixel block bg-salmon p-5 transition-transform hover:-translate-y-0.5"
        >
          <p class="flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
            <PixelIcon name="trade" :size="16" /> Échanges
          </p>
          <p class="mt-2 font-pixel text-3xl font-bold">{{ pendingReceived }}</p>
          <p class="text-sm">
            {{
              pendingReceived > 1 ? 'propositions reçues attendent' : 'proposition reçue attend'
            }}
            votre réponse
          </p>
          <p class="mt-3 text-sm">{{ pendingSent }} envoyée(s) en attente</p>
        </RouterLink>

        <!-- Catalogue -->
        <RouterLink
          to="/catalogue"
          class="card-pixel flex items-center justify-between gap-3 bg-sky p-5 transition-transform hover:-translate-y-0.5 md:col-span-2"
        >
          <div>
            <p class="flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
              <PixelIcon name="catalogue" :size="16" /> Catalogue
            </p>
            <p class="mt-1">Découvrez toutes les créatures, possédées ou non.</p>
          </div>
          <PixelIcon name="arrow-right" :size="28" />
        </RouterLink>
      </div>
    </AsyncState>
  </section>
</template>
