/**
 * Dispose N cartes pour qu'elles tiennent toutes dans une zone donnée (le cadre jaune du booster).
 *
 * Les cartes gardent leur mise en page de base (CARD_W × CARD_H) et la grille entière est agrandie
 * ou réduite d'un facteur `zoom`. On essaie chaque nombre de colonnes et on garde celui qui donne
 * les plus grandes cartes. Si même ainsi elles deviendraient illisibles (< MIN_ZOOM), on garde une
 * taille lisible et la zone défile verticalement, à l'intérieur du cadre.
 */
import {
  onBeforeUnmount,
  onMounted,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'

/** Carte normale, puis carte compacte (petite illustration) quand la place manque. */
const LAYOUTS = [
  { w: 150, h: 240, compact: false },
  { w: 130, h: 190, compact: true },
] as const
export const GAP = 16
export const PAD = 12 // marge pour le liseré de rareté et le badge « Nouvelle ! »
const MIN_ZOOM = 0.75
const MAX_ZOOM = 1.1

export function useFitGrid(area: Ref<HTMLElement | null>, count: MaybeRefOrGetter<number>) {
  const cols = ref(1)
  const zoom = ref(1)
  const scroll = ref(false)
  const compact = ref(false)
  const cardW = ref<number>(LAYOUTS[0].w)

  /** Meilleur nombre de colonnes pour une taille de carte donnée. */
  function bestFor(layout: (typeof LAYOUTS)[number], w: number, h: number, n: number) {
    let best = { cols: 1, k: 0 }
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c)
      const needW = c * layout.w + (c - 1) * GAP + 2 * PAD
      const needH = r * layout.h + (r - 1) * GAP + 2 * PAD
      const k = Math.min(w / needW, h / needH)
      if (k > best.k) best = { cols: c, k }
    }
    return best
  }

  function apply(layout: (typeof LAYOUTS)[number], c: number, k: number, scrolls: boolean) {
    compact.value = layout.compact
    cardW.value = layout.w
    cols.value = c
    zoom.value = k
    scroll.value = scrolls
  }

  function compute() {
    const el = area.value
    if (!el || el.clientWidth === 0) return
    const w = el.clientWidth
    const h = el.clientHeight
    const n = Math.max(1, toValue(count))

    // Toutes les cartes à une taille lisible, sans défilement : carte normale d'abord, compacte sinon.
    for (const layout of LAYOUTS) {
      const best = bestFor(layout, w, h, n)
      if (best.k >= MIN_ZOOM) return apply(layout, best.cols, Math.min(MAX_ZOOM, best.k), false)
    }

    // Trop de cartes pour la place : cartes compactes lisibles, la zone défile dans le cadre.
    const layout = LAYOUTS[1]
    const fit = Math.floor((w / MIN_ZOOM - 2 * PAD + GAP) / (layout.w + GAP))
    const c = Math.max(1, Math.min(n, fit))
    const needW = c * layout.w + (c - 1) * GAP + 2 * PAD
    apply(layout, c, Math.min(MIN_ZOOM, w / needW), true)
  }

  let observer: ResizeObserver | null = null
  onMounted(() => {
    observer = new ResizeObserver(compute)
    watch(
      area,
      (el, old) => {
        if (old) observer?.unobserve(old)
        if (el) {
          observer?.observe(el)
          compute()
        }
      },
      { immediate: true },
    )
  })
  onBeforeUnmount(() => observer?.disconnect())
  watch(() => toValue(count), compute)

  return { cols, zoom, scroll, compact, cardW, refit: compute }
}
