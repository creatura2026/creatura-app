<script setup lang="ts">
/** AS-71 · Fiche d'un joueur : cartes par rareté et par famille, connexions par jour ou par mois. */
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { Granularity } from '@creatura/shared/api/types'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import { formatDateTime, formatDay } from '@creatura/shared/format'

import BarChart from '@/components/BarChart.vue'
import DeletionRequestDialog from '@/components/DeletionRequestDialog.vue'
import KpiTile from '@/components/KpiTile.vue'
import PasswordResetLinkPanel from '@/components/PasswordResetLinkPanel.vue'
import PeriodPicker from '@/components/PeriodPicker.vue'
import { useAdminPlayer } from '@/api/queries'
import { usePeriod } from '@/usePeriod'

const MONTHS = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})

const route = useRoute()
const { period } = usePeriod()
const playerId = computed(() => String(route.params.playerId))
const granularity = ref<Granularity>('DAY')

/** Par mois : les 12 derniers mois jusqu'à la fin de la période choisie. */
const query = computed(() => {
  if (granularity.value === 'DAY') return { ...period.value, granularity: granularity.value }
  const [y, m] = period.value.to.split('-').map(Number) as [number, number]
  const start = new Date(Date.UTC(y, m - 1 - 11, 1)).toISOString().slice(0, 10)
  return { from: start, to: period.value.to, granularity: granularity.value }
})
const { data, isPending, error, refetch, isFetching } = useAdminPlayer(playerId, query)

const categories = computed(
  () =>
    data.value?.logins.points.map((p) =>
      granularity.value === 'DAY'
        ? formatDay(p.date)
        : MONTHS.format(new Date(`${p.date}T00:00:00Z`)),
    ) ?? [],
)
const dialogOpen = ref(false)
</script>

<template>
  <section>
    <RouterLink
      :to="{ name: 'players', query: { du: period.from, au: period.to } }"
      class="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold underline underline-offset-2"
    >
      <PixelIcon name="arrow-left" :size="16" /> Tous les joueurs
    </RouterLink>

    <AsyncState :loading="isPending" :error="error" @retry="refetch()">
      <div v-if="data" class="flex flex-col gap-6" :class="isFetching ? 'opacity-70' : ''">
        <PageHeader
          eyebrow="AS-71 · Fiche joueur"
          :title="data.player.pseudo"
          :subtitle="`Identifiant : ${data.player.login} · inscrit le ${formatDateTime(data.player.createdAt)}`"
        >
          <template #actions>
            <span
              v-if="data.player.pendingDeletionRequestId"
              class="border-2 border-ink bg-butter px-2 py-1 text-sm font-bold"
            >
              Suppression demandée
            </span>
            <button v-else type="button" class="btn btn-secondary" @click="dialogOpen = true">
              Demander la suppression
            </button>
          </template>
        </PageHeader>

        <div class="grid gap-4 sm:grid-cols-3">
          <KpiTile
            label="Dernière connexion"
            :value="data.player.lastLoginAt ? formatDateTime(data.player.lastLoginAt) : 'Jamais'"
            tone="bg-sky"
          />
          <KpiTile
            label="Connexions · période"
            :value="data.player.loginsInPeriod"
            :detail="`${formatDay(period.from)} – ${formatDay(period.to)}`"
            tone="bg-white"
          />
          <KpiTile label="Cartes possédées" :value="data.player.totalCards" tone="bg-mint" />
        </div>

        <PasswordResetLinkPanel :player-id="data.player.id" :pseudo="data.player.pseudo" />

        <PeriodPicker />

        <div class="card-pixel-sm min-w-0 bg-white p-4 sm:p-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-sans text-lg font-bold">
              Connexions par {{ granularity === 'DAY' ? 'jour' : 'mois' }}
            </h2>
            <div class="flex gap-2" role="group" aria-label="Regrouper les connexions">
              <button
                type="button"
                class="chip"
                :aria-pressed="granularity === 'DAY'"
                @click="granularity = 'DAY'"
              >
                Par jour
              </button>
              <button
                type="button"
                class="chip"
                :aria-pressed="granularity === 'MONTH'"
                @click="granularity = 'MONTH'"
              >
                Par mois (12 mois)
              </button>
            </div>
          </div>
          <BarChart
            class="mt-2"
            :categories="categories"
            :series="[
              {
                name: 'Connexions',
                color: '#4776bc',
                values: data.logins.points.map((p) => p.count),
              },
            ]"
            :label="`Connexions de ${data.player.pseudo} par ${granularity === 'DAY' ? 'jour' : 'mois'}`"
            :show-values="categories.length <= 12"
          />
        </div>

        <div class="grid gap-6 lg:grid-cols-2">
          <div class="card-pixel-sm bg-white p-4 sm:p-5">
            <h2 class="mb-3 font-sans text-lg font-bold">Cartes par rareté</h2>
            <table class="w-full border-collapse text-left text-sm">
              <caption class="sr-only">
                Cartes possédées par rareté
              </caption>
              <thead>
                <tr class="border-b-2 border-ink">
                  <th scope="col" class="py-2 pr-3 font-semibold">Rareté</th>
                  <th scope="col" class="py-2 pr-3 text-right font-semibold">Exemplaires</th>
                  <th scope="col" class="py-2 text-right font-semibold">Créatures différentes</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in data.cardsByRarity"
                  :key="r.rarity.code"
                  class="border-b border-line"
                >
                  <td class="py-2.5 pr-3 font-semibold">{{ r.rarity.label }}</td>
                  <td class="py-2.5 pr-3 text-right tabular-nums">{{ r.cards }}</td>
                  <td class="py-2.5 text-right tabular-nums">{{ r.distinctCreatures }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="card-pixel-sm bg-white p-4 sm:p-5">
            <h2 class="mb-3 font-sans text-lg font-bold">Cartes par famille</h2>
            <table class="w-full border-collapse text-left text-sm">
              <caption class="sr-only">
                Cartes possédées par famille
              </caption>
              <thead>
                <tr class="border-b-2 border-ink">
                  <th scope="col" class="py-2 pr-3 font-semibold">Famille</th>
                  <th scope="col" class="py-2 pr-3 text-right font-semibold">Exemplaires</th>
                  <th scope="col" class="py-2 text-right font-semibold">Créatures différentes</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="f in data.cardsByFamily"
                  :key="f.family.code"
                  class="border-b border-line"
                >
                  <td class="py-2.5 pr-3 font-semibold">{{ f.family.label }}</td>
                  <td class="py-2.5 pr-3 text-right tabular-nums">{{ f.cards }}</td>
                  <td class="py-2.5 text-right tabular-nums">{{ f.distinctCreatures }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <DeletionRequestDialog
          v-if="dialogOpen"
          :players="[data.player]"
          @close="dialogOpen = false"
          @created="dialogOpen = false"
        />
      </div>
    </AsyncState>
  </section>
</template>
