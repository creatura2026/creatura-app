/**
 * Dispose les cartes d'un booster sur le tapis (le cadre jaune), pour qu'elles tiennent toujours
 * dans la zone disponible. Deux dispositions sont calculées pour la même zone :
 *
 *  - `mat` + `stack` : la pile face cachée en bas, et au-dessus un emplacement par carte, un peu
 *    plus petit que la pile. Jamais de défilement : tout est réduit jusqu'à tenir.
 *  - `spread` : toutes les cartes étalées en grand, une fois la pile vide (ou pour un booster déjà
 *    ouvert). On essaie chaque nombre de colonnes et on garde celui qui donne les plus grandes
 *    cartes ; si elles deviendraient illisibles (< MIN_ZOOM), la zone défile verticalement.
 *
 * Les cartes gardent leur mise en page de base (largeur × hauteur de `card`) et sont agrandies ou
 * réduites par leur `scale`. Chaque position est le CENTRE de la carte, en pixels de la zone.
 */
import {
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'

export interface Spot {
  x: number
  y: number
  scale: number
}

interface CardLayout {
  w: number
  h: number
  compact: boolean
}

/** Carte normale, puis carte compacte (petite illustration) quand la place manque. */
const LAYOUTS: readonly CardLayout[] = [
  { w: 150, h: 240, compact: false },
  { w: 130, h: 190, compact: true },
]
const GAP = 16
const PAD = 12 // marge pour le liseré de rareté et le badge « Nouvelle ! »
const MIN_ZOOM = 0.75
const MAX_ZOOM = 1.1

/** Taille d'une carte posée sur le tapis, par rapport à la pile. */
const MAT_RATIO = 0.74
/** Espace entre les emplacements et la pile : la carte retournée s'y soulève un instant. */
const ZONE_GAP = 28
/** Débord des cartes de la pile, légèrement décalées et tournées sous celle du dessus. */
const PILE_X = 14
const PILE_Y = 18

/** Rangées centrées dans la zone ; une dernière rangée incomplète est centrée elle aussi. */
function rows(
  n: number,
  cols: number,
  scale: number,
  card: CardLayout,
  centerX: number,
  top: number,
) {
  const w = card.w * scale
  const h = card.h * scale
  const gap = GAP * scale
  const rowCount = Math.ceil(n / cols)
  return Array.from({ length: n }, (_, i): Spot => {
    const row = Math.floor(i / cols)
    const inRow = row === rowCount - 1 ? n - row * cols : cols
    const col = i - row * cols
    return {
      x: centerX + (col - (inRow - 1) / 2) * (w + gap),
      y: top + h / 2 + row * (h + gap),
      scale,
    }
  })
}

export function useCardTable(area: Ref<HTMLElement | null>, count: MaybeRefOrGetter<number>) {
  /** Vrai dès qu'une disposition a été calculée pour la zone affichée. */
  const ready = ref(false)
  const card = shallowRef<CardLayout>(LAYOUTS[0]!)
  const mat = shallowRef<Spot[]>([])
  const stack = shallowRef<Spot>({ x: 0, y: 0, scale: 1 })
  const spread = shallowRef<Spot[]>([])
  /** La disposition étalée dépasse la zone : elle défile dans le cadre. */
  const scroll = ref(false)
  const areaHeight = ref(0)
  const spreadHeight = ref(0)

  /** Meilleur nombre de colonnes pour étaler toutes les cartes à une taille donnée. */
  function bestSpread(layout: CardLayout, w: number, h: number, n: number) {
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

  function compute() {
    const el = area.value
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
    const w = el.clientWidth
    const h = el.clientHeight
    const n = Math.max(1, toValue(count))

    // ── Cartes étalées : taille lisible sans défilement, carte normale d'abord, compacte sinon.
    let layout = LAYOUTS[LAYOUTS.length - 1]!
    let cols = 1
    let k = 0
    let scrolls = true
    for (const candidate of LAYOUTS) {
      const best = bestSpread(candidate, w, h, n)
      if (best.k < MIN_ZOOM) continue
      layout = candidate
      cols = best.cols
      k = Math.min(MAX_ZOOM, best.k)
      scrolls = false
      break
    }
    if (scrolls) {
      // Trop de cartes pour la place : cartes compactes lisibles, la zone défile dans le cadre.
      const fit = Math.floor((w / MIN_ZOOM - 2 * PAD + GAP) / (layout.w + GAP))
      cols = Math.max(1, Math.min(n, fit))
      k = Math.min(MIN_ZOOM, w / (cols * layout.w + (cols - 1) * GAP + 2 * PAD))
    }
    const spreadRows = Math.ceil(n / cols)
    const gridH = (spreadRows * layout.h + (spreadRows - 1) * GAP) * k

    // ── Pile + emplacements : on garde le nombre de rangées qui laisse les plus grandes cartes
    //    (à taille égale, le moins de rangées possible), en rangées équilibrées : 5 + 5, pas 8 + 2.
    let table = { cols: n, k: 0, matH: 0 }
    for (let wanted = 1; wanted <= n; wanted++) {
      const c = Math.ceil(n / wanted)
      const r = Math.ceil(n / c)
      const matW = MAT_RATIO * (c * layout.w + (c - 1) * GAP)
      const matH = MAT_RATIO * (r * layout.h + (r - 1) * GAP)
      const needW = Math.max(matW, layout.w + 2 * PILE_X) + 2 * PAD
      const needH = matH + ZONE_GAP + layout.h + PILE_Y + 2 * PAD
      const fit = Math.min(MAX_ZOOM, w / needW, h / needH)
      if (fit > table.k) table = { cols: c, k: fit, matH }
    }
    const tableH = (table.matH + ZONE_GAP + layout.h + PILE_Y) * table.k
    const tableTop = (h - tableH) / 2

    card.value = layout
    scroll.value = scrolls
    areaHeight.value = h
    spreadHeight.value = scrolls ? gridH + 2 * PAD * k : h
    spread.value = rows(n, cols, k, layout, w / 2, scrolls ? PAD * k : (h - gridH) / 2)
    mat.value = rows(n, table.cols, table.k * MAT_RATIO, layout, w / 2, tableTop)
    stack.value = {
      x: w / 2,
      y: tableTop + (table.matH + ZONE_GAP + layout.h / 2) * table.k,
      scale: table.k,
    }
    ready.value = true
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
        } else {
          ready.value = false
        }
      },
      { immediate: true },
    )
  })
  onBeforeUnmount(() => observer?.disconnect())
  watch(() => toValue(count), compute)

  return { ready, card, mat, stack, spread, scroll, areaHeight, spreadHeight, refit: compute }
}
