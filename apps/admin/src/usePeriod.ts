/** Période d'analyse partagée par tous les écrans du dashboard (et conservée dans l'URL). */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Period } from '@creatura/shared/api/types'
import { addDays, parisToday } from '@creatura/shared/format'

const DAY = /^\d{4}-\d{2}-\d{2}$/

export const PRESETS = [
  { days: 7, label: '7 j' },
  { days: 30, label: '30 j' },
  { days: 90, label: '90 j' },
] as const

export function usePeriod() {
  const route = useRoute()
  const router = useRouter()

  const period = computed<Period>(() => {
    const to =
      typeof route.query.au === 'string' && DAY.test(route.query.au) ? route.query.au : parisToday()
    const from =
      typeof route.query.du === 'string' && DAY.test(route.query.du)
        ? route.query.du
        : addDays(to, -29)
    return { from, to }
  })

  function setPeriod(next: Period) {
    router.replace({ query: { ...route.query, du: next.from, au: next.to, page: undefined } })
  }

  function setPreset(days: number) {
    const to = parisToday()
    setPeriod({ from: addDays(to, -(days - 1)), to })
  }

  const activePreset = computed(() => {
    if (period.value.to !== parisToday()) return null
    return (
      PRESETS.find((p) => addDays(period.value.to, -(p.days - 1)) === period.value.from)?.days ??
      null
    )
  })

  return { period, setPeriod, setPreset, activePreset }
}
