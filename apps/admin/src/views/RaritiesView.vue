<script setup lang="ts">
/** UC-14 · Analyser la distribution des raretés : observé vs théorique. */
import { computed } from 'vue'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import { formatPercent } from '@creatura/shared/format'

import BarChart from '@/components/BarChart.vue'
import KpiTile from '@/components/KpiTile.vue'
import PeriodPicker from '@/components/PeriodPicker.vue'
import { useRarityDistribution } from '@/api/queries'
import { usePeriod } from '@/usePeriod'

const { period } = usePeriod()
const { data, isPending, error, refetch, isFetching } = useRarityDistribution(period)

const pct = (rate: number) => formatPercent(rate * 100, 1)
const gap = (observed: number, expected: number) => (observed - expected) * 100
/** « +1,1 pt », « −0,9 pt », « 0 pt » */
const formatGap = (observed: number, expected: number) => {
  const rounded = Math.round(gap(observed, expected) * 10) / 10
  if (rounded === 0) return '0 pt'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toLocaleString('fr-FR')} pt`
}
const maxGap = computed(() =>
  Math.max(
    0,
    ...(data.value?.items.map((i) => Math.abs(gap(i.observedRate, i.expectedRate))) ?? []),
  ),
)
</script>

<template>
  <section>
    <PageHeader eyebrow="UC-14 · Analyser les raretés" title="Distribution des raretés" />
    <PeriodPicker />

    <AsyncState :loading="isPending" :error="error" @retry="refetch()">
      <div
        v-if="data"
        class="flex flex-col gap-6"
        :class="isFetching ? 'opacity-70 transition-opacity' : ''"
      >
        <div class="grid gap-5 sm:grid-cols-2">
          <KpiTile
            label="Cartes distribuées · période"
            :value="data.totalCardsDistributed.toLocaleString('fr-FR')"
            tone="bg-mint"
          />
          <KpiTile
            label="Écart maximal au théorique"
            :value="`${maxGap.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} pt`"
            :detail="maxGap < 3 ? 'Tirage conforme aux probabilités' : 'Écart à surveiller'"
            :tone="maxGap < 3 ? 'bg-sky' : 'bg-salmon'"
          />
        </div>

        <div class="card-pixel-sm min-w-0 bg-white p-4 sm:p-5">
          <h2 class="font-sans text-lg font-bold">Part des cartes par rareté</h2>
          <BarChart
            class="mt-2"
            :categories="data.items.map((i) => i.rarity.label)"
            :series="[
              {
                name: 'Théorique',
                color: '#d99b32',
                values: data.items.map((i) => i.expectedRate * 100),
              },
              {
                name: 'Observé',
                color: '#4776bc',
                values: data.items.map((i) => i.observedRate * 100),
              },
            ]"
            :format="(v) => formatPercent(v, 1)"
            :label-format="(v) => formatPercent(v)"
            label="Comparaison, pour chaque rareté, de la part théorique et de la part observée des cartes distribuées"
            :height="300"
            show-values
          />
        </div>

        <div class="card-pixel-sm bg-white p-4 sm:p-5">
          <table class="w-full border-collapse text-left text-xs sm:text-sm">
            <caption class="mb-2 text-left font-bold">
              Détail par rareté
            </caption>
            <thead>
              <tr class="border-b-2 border-ink">
                <th scope="col" class="py-2 pr-3">Rareté</th>
                <th scope="col" class="py-2 pr-3 text-right">Cartes</th>
                <th scope="col" class="py-2 pr-3 text-right">Observé</th>
                <th scope="col" class="py-2 pr-3 text-right">Théorique</th>
                <th scope="col" class="py-2 text-right">Écart</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="i in data.items" :key="i.rarity.code" class="border-b border-line">
                <th scope="row" class="py-2.5 pr-3 font-semibold">{{ i.rarity.label }}</th>
                <td class="py-2.5 pr-3 text-right tabular-nums">
                  {{ i.observedCount.toLocaleString('fr-FR') }}
                </td>
                <td class="py-2.5 pr-3 text-right tabular-nums">{{ pct(i.observedRate) }}</td>
                <td class="py-2.5 pr-3 text-right tabular-nums">{{ pct(i.expectedRate) }}</td>
                <td class="py-2.5 text-right whitespace-nowrap tabular-nums">
                  {{ formatGap(i.observedRate, i.expectedRate) }}
                </td>
              </tr>
            </tbody>
          </table>
          <p class="mt-3 text-xs text-ink/75">Probabilités théoriques à valider au point client.</p>
        </div>
      </div>
    </AsyncState>
  </section>
</template>
