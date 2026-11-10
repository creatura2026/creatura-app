<script setup lang="ts">
/** UC-12 · Statistiques sur une période. */
import { computed } from 'vue'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import { formatDay } from '@creatura/shared/format'

import BarChart from '@/components/BarChart.vue'
import KpiTile from '@/components/KpiTile.vue'
import PeriodPicker from '@/components/PeriodPicker.vue'
import TradeTable from '@/components/TradeTable.vue'
import { useAdminStats, useAdminTrades } from '@/api/queries'
import { usePeriod } from '@/usePeriod'

const { period } = usePeriod()
const { data: stats, isPending, error, refetch, isFetching } = useAdminStats(period)
const { data: recent } = useAdminTrades(() => ({
  ...period.value,
  status: 'ACCEPTED' as const,
  pageSize: 5,
}))

const boostersTotal = computed(
  () => stats.value?.boostersOpenedPerDay.reduce((a, b) => a + b.count, 0) ?? 0,
)
const days = computed(() => stats.value?.boostersOpenedPerDay.map((d) => formatDay(d.date)) ?? [])
const boosterAvg = computed(() =>
  stats.value?.boostersOpenedPerDay.length
    ? (boostersTotal.value / stats.value.boostersOpenedPerDay.length).toLocaleString('fr-FR', {
        maximumFractionDigits: 1,
      })
    : '0',
)
</script>

<template>
  <section>
    <PageHeader eyebrow="UC-12 · Statistiques" title="Piloter Créatura" />
    <PeriodPicker />

    <AsyncState :loading="isPending" :error="error" @retry="refetch()">
      <div
        v-if="stats"
        class="flex flex-col gap-6"
        :class="isFetching ? 'opacity-70 transition-opacity' : ''"
      >
        <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile label="Inscrits · total" :value="stats.registrations.total" tone="bg-sky" />
          <KpiTile
            label="Inscrits · période"
            :value="stats.registrations.inPeriod"
            tone="bg-white"
          />
          <KpiTile
            label="Boosters · période"
            :value="boostersTotal"
            :detail="`${boosterAvg} par jour en moyenne`"
            tone="bg-mint"
          />
          <KpiTile
            label="Échanges finalisés · période"
            :value="stats.completedTrades.inPeriod"
            tone="bg-butter"
          />
        </div>

        <div class="grid gap-6 xl:grid-cols-2">
          <div class="card-pixel-sm min-w-0 bg-white p-4 sm:p-5">
            <h2 class="font-sans text-lg font-bold">Boosters ouverts / jour</h2>
            <BarChart
              class="mt-2"
              :categories="days"
              :series="[
                {
                  name: 'Boosters ouverts',
                  color: '#4776bc',
                  values: stats.boostersOpenedPerDay.map((d) => d.count),
                },
              ]"
              label="Nombre de boosters ouverts chaque jour de la période"
              :show-values="days.length <= 10"
            />
          </div>
          <div class="card-pixel-sm min-w-0 bg-white p-4 sm:p-5">
            <h2 class="font-sans text-lg font-bold">Échanges finalisés / jour</h2>
            <BarChart
              class="mt-2"
              :categories="days"
              :series="[
                {
                  name: 'Échanges acceptés',
                  color: '#4776bc',
                  values: stats.completedTrades.perDay.map((d) => d.count),
                },
              ]"
              label="Nombre d’échanges acceptés chaque jour de la période"
              :show-values="days.length <= 10"
            />
          </div>
        </div>

        <div class="card-pixel-sm bg-white p-4 sm:p-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-sans text-lg font-bold">Derniers échanges finalisés</h2>
            <RouterLink
              :to="{ name: 'trades', query: { du: period.from, au: period.to } }"
              class="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold underline underline-offset-2"
            >
              Tous les échanges <PixelIcon name="arrow-right" :size="16" />
            </RouterLink>
          </div>
          <TradeTable
            v-if="recent?.items.length"
            :trades="recent.items"
            caption="Derniers échanges acceptés"
          />
          <p v-else class="text-sm">Aucun échange finalisé sur la période.</p>
        </div>
      </div>
    </AsyncState>
  </section>
</template>
