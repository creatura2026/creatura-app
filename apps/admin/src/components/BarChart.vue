<script setup lang="ts">
/**
 * Histogramme sobre aux couleurs du document : barres fines à bouts arrondis (4 px) posées sur la ligne de base,
 * grille discrète, infobulle au survol, une seule échelle. Légende affichée dès 2 séries.
 */
import { computed } from 'vue'
import { use } from 'echarts/core'
import { BarChart as EBarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent, AriaComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import VChart from 'vue-echarts'

use([EBarChart, GridComponent, LegendComponent, TooltipComponent, AriaComponent, SVGRenderer])

export interface BarSeries {
  name: string
  color: string
  values: number[]
}

const props = withDefaults(
  defineProps<{
    categories: string[]
    series: BarSeries[]
    /** Description accessible du graphique. */
    label: string
    height?: number
    format?: (value: number) => string
    /** Format plus court pour les étiquettes posées sur les barres. */
    labelFormat?: (value: number) => string
    /** Étiquette de valeur au-dessus de chaque barre (peu de barres seulement). */
    showValues?: boolean
  }>(),
  { height: 260, showValues: false },
)

const INK = '#25334b'
const MUTED = 'rgba(37, 51, 75, 0.72)'
const GRID = '#e7edf2'
const fmt = (v: number) => (props.format ? props.format(v) : v.toLocaleString('fr-FR'))

const option = computed<EChartsOption>(() => ({
  aria: { enabled: true, label: { description: props.label } },
  textStyle: { fontFamily: "'Inter Variable', Inter, sans-serif", color: INK },
  grid: {
    left: 8,
    right: 8,
    top: props.series.length > 1 ? 40 : 16,
    bottom: 4,
    containLabel: true,
  },
  legend:
    props.series.length > 1
      ? {
          top: 0,
          left: 0,
          icon: 'rect',
          itemWidth: 12,
          itemHeight: 12,
          textStyle: { color: INK, fontSize: 13, fontWeight: 600 },
        }
      : undefined,
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(37, 51, 75, 0.06)' } },
    backgroundColor: '#ffffff',
    borderColor: INK,
    borderWidth: 2,
    padding: [8, 12],
    extraCssText: `border-radius:0;box-shadow:4px 4px 0 0 ${INK};`,
    textStyle: { color: INK, fontSize: 13 },
    valueFormatter: (v) => fmt(Number(v)),
  },
  xAxis: {
    type: 'category',
    data: props.categories,
    axisLine: { lineStyle: { color: INK, width: 2 } },
    axisTick: { show: false },
    // Peu de catégories : toutes les étiquettes, sur deux lignes si besoin. Beaucoup de jours : on en masque.
    axisLabel:
      props.categories.length <= 6
        ? { color: MUTED, fontSize: 12, interval: 0, width: 72, overflow: 'break' }
        : { color: MUTED, fontSize: 12, hideOverlap: true },
  },
  yAxis: {
    type: 'value',
    minInterval: 1,
    splitNumber: 4,
    axisLabel: { color: MUTED, fontSize: 12, formatter: (v: number) => fmt(v) },
    splitLine: { lineStyle: { color: GRID, width: 1 } },
  },
  series: props.series.map((s) => ({
    type: 'bar',
    name: s.name,
    data: s.values,
    barMaxWidth: 32,
    barGap: '12%',
    itemStyle: { color: s.color, borderRadius: [4, 4, 0, 0] },
    emphasis: { itemStyle: { color: s.color, borderColor: INK, borderWidth: 2 } },
    label: props.showValues
      ? {
          show: true,
          position: 'top',
          color: INK,
          fontWeight: 700,
          fontSize: 12,
          formatter: (p) => (props.labelFormat ?? fmt)(Number(p.value)),
        }
      : undefined,
  })),
}))
</script>

<template>
  <VChart
    :option="option"
    :style="{ height: `${height}px` }"
    autoresize
    role="img"
    :aria-label="label"
  />
</template>
