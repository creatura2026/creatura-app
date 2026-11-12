<script setup lang="ts">
/** UC-03 · Réclamer le booster du jour — UC-04 · Découvrir les cartes tirées. */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Booster } from '@creatura/shared/api/types'
import { errorMessage, isApiError } from '@creatura/shared/api/types'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import { formatDuration, formatPercent } from '@creatura/shared/format'
import { toast } from '@creatura/shared/toast'
import { rarityColor } from '@creatura/shared/rarity'

import BoosterTear, { type TearResult } from '@/components/BoosterTear.vue'
import FlipCard from '@/components/FlipCard.vue'
import { useClaimBooster, useRarities, useTodayBooster } from '@/api/queries'
import { burstFromPack, GHOST_Z_INDEX } from '@/composables/cardBurst'
import { useCardTable, type Spot } from '@/composables/useCardTable'

const { data: today, isPending, error, refetch } = useTodayBooster()
const { data: rarities } = useRarities()
const claim = useClaimBooster()

/** Booster ouvert pendant cette visite : on joue la découverte carte par carte. */
const opened = ref<Booster | null>(null)
/**
 * Nombre de cartes déjà retournées. La pile se vide dans l'ordre : la carte 0 est au-dessus, et la
 * carte `flipped` est la prochaine à retourner.
 */
const flipped = ref(0)
/** Carte tout juste retournée, présentée au-dessus de la pile avant de rejoindre le tapis. */
const showing = ref<number | null>(null)
/** Les cartes sont posées en pile (faux pendant qu'elles jaillissent du sachet). */
const settled = ref(true)

/** Déchirure en cours (le sachet reste affiché jusqu'à la sortie des cartes). */
const animating = ref(false)
/** Réponse du serveur reçue pendant l'animation. */
const pending = ref<Booster | null>(null)
/** Changer la clé remet un sachet neuf (après une erreur). */
const tearKey = ref(0)
const claiming = ref(false)

/** Sachet vide superposé pendant que les cartes en sortent. */
const ghost = ref<TearResult | null>(null)
const ghostEl = ref<HTMLImageElement | null>(null)
const grid = ref<HTMLUListElement | null>(null)
/** Les cartes arrivent en jaillissant du sachet : pas de petite entrée en fondu. */
const bursting = ref(false)
const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Le cadre jaune occupe exactement la hauteur visible restante (sous l'en-tête et le titre,
 * au-dessus de la barre d'onglets mobile) : avant, pendant et après l'ouverture.
 */
const panel = ref<HTMLDivElement | null>(null)
const panelHeight = ref<number | null>(null)
const PANEL_MIN = 340 // en dessous, on accepte de faire défiler plutôt que d'écraser le sachet
const PANEL_MAX = 760 // au-delà, le sachet est déjà à sa taille maximale

function measurePanel() {
  const el = panel.value
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY
  const nav = document.querySelector<HTMLElement>('[data-bottom-nav]')
  const navHeight = nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0
  const margin = 16 // un peu d'air sous le cadre (ombre portée comprise)
  const available = window.innerHeight - top - navHeight - margin
  panelHeight.value = Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, available)))
}

watch(panel, (el) => el && nextTick(measurePanel))
onMounted(() => window.addEventListener('resize', measurePanel))
onBeforeUnmount(() => window.removeEventListener('resize', measurePanel))

/** Nombre de cartes à dessiner dans le sachet (réglé par l'administrateur). */
const cardsInPack = computed(() => pending.value?.cards.length ?? today.value?.cardsPerBooster ?? 5)

const booster = computed(() => opened.value ?? today.value?.booster ?? null)

const total = computed(() => booster.value?.cards.length ?? 0)

/** Pile et emplacements du tapis sont disposés pour tenir dans la zone libre du cadre. */
const cardArea = ref<HTMLDivElement | null>(null)
const table = useCardTable(cardArea, total)
// Booster disponible : sachet à déchirer. Déjà ouvert sans son contenu (le serveur ne le
// conserve pas) : simple rappel, les cartes sont dans la collection.
const showTear = computed(
  () => animating.value || (!booster.value && today.value?.available !== false),
)
const allRevealed = computed(() => !opened.value || flipped.value >= total.value)
/**
 * Pile vide (ou booster déjà ouvert avant cette visite) : plus rien à retourner, les cartes
 * s'étalent en grand dans tout le cadre.
 */
const spreadOut = computed(() => allRevealed.value && showing.value === null)
const stageHeight = computed(() =>
  spreadOut.value && table.scroll.value ? table.spreadHeight.value : table.areaHeight.value,
)

/** Où se trouve une carte : dans la pile, présentée au-dessus, sur le tapis, ou étalée à la fin. */
type Place = 'pile' | 'show' | 'mat' | 'spread'
function placeOf(i: number): Place {
  if (spreadOut.value) return 'spread'
  if (i >= flipped.value) return 'pile'
  return showing.value === i ? 'show' : 'mat'
}

const SHOW_MS = 900 // retournement (500 ms) puis un temps pour lire la carte
const SHOW_LIFT = 0.14 // la carte présentée se soulève d'une fraction de sa hauteur…
const SHOW_GROW = 1.08 // …et s'approche un peu
const DEAL_MS = 130 // cadence de « Tout révéler »

/**
 * Position de chaque carte dans la zone. `translate` et `scale` sont animés en CSS (voir
 * `.booster-card`) : une carte qui change de place y glisse toute seule. `transform` reste libre
 * pour le jaillissement du sachet (cardBurst).
 */
function cardStyle(i: number) {
  const { w, h } = table.card.value
  const place = placeOf(i)
  const pile = table.stack.value
  let spot: Spot = pile
  let z = total.value - (i - flipped.value) // pile : la prochaine carte au-dessus
  if (place === 'show') {
    spot = { x: pile.x, y: pile.y - h * pile.scale * SHOW_LIFT, scale: pile.scale * SHOW_GROW }
    z = 25
  } else if (place !== 'pile') {
    spot = (place === 'mat' ? table.mat.value[i] : table.spread.value[i]) ?? pile
    z = 11 + i // posée après les précédentes : elle passe au-dessus pendant son trajet
  }
  return {
    width: `${w}px`,
    height: `${h}px`,
    translate: `${Math.round(spot.x - w / 2)}px ${Math.round(spot.y - h / 2)}px`,
    scale: String(spot.scale),
    zIndex: z,
    transitionDuration: place === 'show' ? '300ms' : undefined,
  }
}

/** Sous la carte du dessus, les cartes de la pile sont un peu décalées et tournées. */
const PILE_JITTER = [
  { x: 7, r: 4 },
  { x: -6, r: -5 },
  { x: 5, r: 3 },
  { x: -8, r: -3 },
  { x: 8, r: 6 },
  { x: -5, r: -6 },
  { x: 6, r: 5 },
  { x: -7, r: -4 },
]
function pileStyle(i: number) {
  const depth = i - flipped.value
  if (placeOf(i) !== 'pile' || depth <= 0) return undefined
  const { x, r } = PILE_JITTER[i % PILE_JITTER.length]!
  return { transform: `translate(${x}px, ${Math.min(depth, 4) * 3}px) rotate(${r}deg)` }
}

/** Emplacement vide du tapis, à la taille d'une carte posée. */
function slotStyle(spot: Spot) {
  const w = table.card.value.w * spot.scale
  const h = table.card.value.h * spot.scale
  return {
    left: `${Math.round(spot.x - w / 2)}px`,
    top: `${Math.round(spot.y - h / 2)}px`,
    width: `${Math.round(w)}px`,
    height: `${Math.round(h)}px`,
  }
}

/** Annonce de la dernière carte retournée, pour les lecteurs d'écran. */
const announcement = computed(() => {
  const card = opened.value?.cards[flipped.value - 1]
  if (!card) return ''
  const { name, rarity } = card.creature
  return `Carte ${flipped.value} sur ${total.value} : ${name}, ${rarity.label}${card.isNew ? ', nouvelle' : ''}.`
})

function claimFailed(e: unknown) {
  if (isApiError(e, 'BOOSTER_ALREADY_CLAIMED'))
    toast('Ce booster a déjà été ouvert aujourd’hui.', 'info')
  else toast(errorMessage(e), 'error')
}

/** Le haut du sachet est arraché : le serveur fait le tirage pendant que l'animation continue. */
async function onTorn() {
  animating.value = true
  try {
    pending.value = await claim.mutateAsync()
  } catch (e) {
    claimFailed(e)
    animating.value = false
    tearKey.value++
  }
}

let showTimer: ReturnType<typeof setTimeout> | undefined
let dealTimer: ReturnType<typeof setTimeout> | undefined

/** Une nouvelle pile, face cachée. */
function resetPile() {
  clearTimeout(showTimer)
  clearTimeout(dealTimer)
  flipped.value = 0
  showing.value = null
}
onBeforeUnmount(resetPile)

/** Les cartes sortent du sachet et vont s'empiler au bas du tapis, face cachée. */
async function onTearDone(result: TearResult) {
  if (!pending.value) return
  resetPile()
  bursting.value = !reduced
  settled.value = !bursting.value
  if (bursting.value) ghost.value = result
  opened.value = pending.value
  pending.value = null
  animating.value = false
  if (!bursting.value) return
  // La zone des cartes vient d'apparaître : on attend sa disposition, puis les cartes elles-mêmes.
  await nextTick()
  table.refit()
  await nextTick()
  // Du bas de la pile vers le haut : la carte du dessus arrive en dernier.
  const cards = [...(grid.value?.querySelectorAll<HTMLElement>('[data-card-index]') ?? [])].sort(
    (a, b) => Number(b.dataset.cardIndex) - Number(a.dataset.cardIndex),
  )
  await burstFromPack(result, cards, ghostEl.value, table.stack.value.scale)
  ghost.value = null
  settled.value = true
}

/** Alternative sans geste (accessibilité, préférence de l'utilisateur). */
async function openWithoutTearing() {
  claiming.value = true
  try {
    const result = await claim.mutateAsync()
    resetPile()
    settled.value = true
    opened.value = result
  } catch (e) {
    claimFailed(e)
  } finally {
    claiming.value = false
  }
}

/**
 * Retourne la carte du dessus : elle se soulève et se retourne au-dessus de la pile, le temps de la
 * lire, puis va se poser à son emplacement sur le tapis. Retourner la suivante sans attendre envoie
 * tout de suite la précédente à sa place.
 */
function reveal(index: number) {
  if (index !== flipped.value) return
  clearTimeout(showTimer)
  flipped.value = index + 1
  showing.value = reduced ? null : index
  if (!reduced) showTimer = setTimeout(() => (showing.value = null), SHOW_MS)
  void keepFocus()
}

/** Distribue le reste de la pile sur le tapis, une carte après l'autre. */
function revealAll() {
  clearTimeout(showTimer)
  clearTimeout(dealTimer)
  showing.value = null
  if (reduced) {
    flipped.value = total.value
    return
  }
  const deal = () => {
    if (flipped.value >= total.value) return
    flipped.value++
    dealTimer = setTimeout(deal, DEAL_MS)
  }
  deal()
}

/**
 * Le bouton qui vient de servir se désactive ou disparaît : le focus passe à la prochaine carte à
 * retourner, puis au lien vers la collection quand la pile est vide.
 */
async function keepFocus() {
  await nextTick()
  const active = document.activeElement
  const lost =
    !active || active === document.body || (active instanceof HTMLButtonElement && active.disabled)
  if (!lost) return
  const next =
    grid.value?.querySelector<HTMLElement>('button:not(:disabled)') ??
    panel.value?.querySelector<HTMLElement>('[data-after-reveal]')
  next?.focus({ preventScroll: true })
}
watch(allRevealed, (done) => {
  if (done && opened.value) void keepFocus()
})

// Compte à rebours jusqu'au prochain booster (minuit, heure de Paris).
const now = ref(Date.now())
const timer = setInterval(() => (now.value = Date.now()), 30_000)
onBeforeUnmount(() => clearInterval(timer))
const remaining = computed(() =>
  today.value ? formatDuration(new Date(today.value.nextAvailableAt).getTime() - now.value) : '',
)
</script>

<template>
  <section>
    <PageHeader eyebrow="Expérience joueur" title="Un booster quotidien" />

    <AsyncState :loading="isPending" :error="error" @retry="refetch()">
      <div v-if="today" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <!-- Cadre jaune unique : ouverture puis découverte des cartes, toujours à la taille de l'écran -->
          <div
            ref="panel"
            class="card-pixel booster-stage flex flex-col items-center gap-2 bg-butter px-5 py-5 text-center"
            :style="panelHeight ? { height: `${panelHeight}px` } : undefined"
          >
            <p
              v-if="!showTear"
              class="flex w-full shrink-0 items-center justify-center gap-1.5 text-xs font-semibold sm:justify-end"
            >
              <PixelIcon name="clock" :size="14" /> Prochain booster dans {{ remaining }}
            </p>

            <!-- Booster disponible : le joueur déchire lui-même le sachet -->
            <template v-if="showTear">
              <BoosterTear
                class="flex-1"
                :key="tearKey"
                :ready="!!pending"
                :cards="cardsInPack"
                @torn="onTorn"
                @done="onTearDone"
              />
              <!-- Masqué sans libérer sa place : le cadre garde la même taille pendant l'animation -->
              <button
                type="button"
                class="btn btn-secondary min-h-10 shrink-0 text-sm"
                :class="{ invisible: animating }"
                :tabindex="animating ? -1 : undefined"
                :disabled="claiming"
                @click="openWithoutTearing"
              >
                {{ claiming ? 'Ouverture…' : 'Ouvrir sans déchirer' }}
              </button>
            </template>

            <!-- Booster ouvert ou déjà réclamé : découverte des cartes dans le même cadre -->
            <template v-else-if="booster">
              <p v-if="!opened" class="shrink-0 text-sm">
                Une nouvelle demande ne donne aucune carte.
              </p>

              <!--
                Tapis : la pile face cachée en bas, un emplacement par carte au-dessus. Chaque carte
                est placée par `cardStyle` et glisse d'une place à l'autre.
              -->
              <div
                ref="cardArea"
                class="min-h-0 w-full flex-1"
                :class="spreadOut && table.scroll.value ? 'overflow-y-auto' : ''"
              >
                <div
                  v-if="table.ready.value"
                  class="relative w-full"
                  :style="{ height: `${stageHeight}px` }"
                >
                  <div v-if="opened" aria-hidden="true">
                    <span
                      v-for="(spot, i) in table.mat.value"
                      :key="i"
                      class="mat-slot"
                      :class="{ 'is-shown': settled && !spreadOut }"
                      :style="slotStyle(spot)"
                    />
                  </div>

                  <ul ref="grid" aria-label="Cartes du booster">
                    <li
                      v-for="(card, i) in booster.cards"
                      :key="`${booster.id}-${i}`"
                      class="booster-card"
                      :class="{ 'pointer-events-none': placeOf(i) === 'show' }"
                      :data-card-index="i"
                      :style="cardStyle(i)"
                    >
                      <div class="pile-tilt" :style="pileStyle(i)">
                        <FlipCard
                          :card="card"
                          :index="i"
                          :intro="!bursting"
                          :compact="table.card.value.compact"
                          :revealed="!opened || i < flipped"
                          :interactive="settled && i === flipped"
                          :glow="settled && showing === null && i === flipped"
                          @reveal="reveal(i)"
                        />
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
              <p v-if="opened" class="sr-only" aria-live="polite">{{ announcement }}</p>

              <div class="flex shrink-0 flex-wrap justify-center gap-3">
                <button
                  v-if="!allRevealed"
                  type="button"
                  class="btn btn-primary bg-white"
                  @click="revealAll"
                >
                  Tout révéler
                </button>
                <RouterLink v-else to="/collection" class="btn btn-success" data-after-reveal>
                  Voir ma collection <PixelIcon name="arrow-right" :size="18" />
                </RouterLink>
              </div>
            </template>

            <!-- Booster déjà ouvert plus tôt : le serveur ne renvoie pas son contenu -->
            <template v-else>
              <div class="flex flex-1 flex-col items-center justify-center gap-3">
                <p class="font-bold">Booster du jour déjà ouvert</p>
                <p class="max-w-sm text-sm">Ses cartes ont rejoint votre collection.</p>
                <RouterLink to="/collection" class="btn btn-success">
                  Voir ma collection <PixelIcon name="arrow-right" :size="18" />
                </RouterLink>
              </div>
            </template>
          </div>
        </div>

        <aside class="flex flex-col gap-5">
          <div class="card-pixel-sm bg-salmon p-4">
            <p class="font-bold">Règle quotidienne</p>
            <p class="mt-1 text-sm">
              Un booster par compte et par jour (minuit à minuit, heure de Paris). Le serveur
              contrôle aussi les demandes simultanées.
            </p>
          </div>
          <div class="card-pixel-sm bg-white p-4">
            <p class="font-bold">Probabilités de tirage</p>
            <ul class="mt-2 flex flex-col gap-1.5 text-sm">
              <li
                v-for="r in rarities"
                :key="r.code"
                class="flex items-center justify-between gap-2"
              >
                <span class="flex items-center gap-2">
                  <span
                    class="size-4 border-2 border-ink"
                    :style="{ backgroundColor: rarityColor(r.code) }"
                    aria-hidden="true"
                  />
                  {{ r.label }}
                </span>
                <strong>{{ formatPercent(r.dropRate * 100) }}</strong>
              </li>
            </ul>
            <p class="mt-3 text-sm">
              Sur la pile, la prochaine carte à retourner scintille de la couleur de sa rareté si
              elle est peu commune ou rare.
            </p>
          </div>
        </aside>
      </div>
    </AsyncState>

    <!-- Sachet vide, superposé à l'écran pendant que les cartes en jaillissent -->
    <Teleport to="body">
      <img
        v-if="ghost"
        ref="ghostEl"
        :src="ghost.image"
        alt=""
        aria-hidden="true"
        class="pixelated pointer-events-none fixed drop-shadow-[4px_4px_0_var(--color-ink)]"
        :style="{
          left: `${ghost.rect.left}px`,
          top: `${ghost.rect.top}px`,
          width: `${ghost.rect.width}px`,
          height: `${ghost.rect.height}px`,
          zIndex: GHOST_Z_INDEX,
        }"
      />
    </Teleport>
  </section>
</template>

<style scoped>
/*
 * Carte du booster : placée dans la zone par `translate` + `scale` (voir `cardStyle`). Un changement
 * de place (pile → présentation → tapis → étalement final) est une simple transition, avec un très
 * léger dépassement à l'arrivée.
 */
.booster-card {
  position: absolute;
  top: 0;
  left: 0;
  transition-property: translate, scale;
  transition-duration: 560ms;
  transition-timing-function: cubic-bezier(0.25, 0.85, 0.3, 1.03);
}
/* La carte qui arrive en haut de la pile se remet droite. */
.pile-tilt {
  transition: transform 320ms cubic-bezier(0.3, 0.7, 0.3, 1);
}
/* Emplacement vide : même tracé en pointillés que le cadre intérieur du tapis. */
.mat-slot {
  position: absolute;
  border: 2px dashed rgb(37 51 75 / 0.32);
  background-color: rgb(255 255 255 / 0.22);
  opacity: 0;
  transition: opacity 320ms ease-out;
}
.mat-slot.is-shown {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .booster-card,
  .pile-tilt,
  .mat-slot {
    transition: none;
  }
}

/*
 * Fond du cadre jaune : tout est peint en arrière-plan (aucun élément ajouté), pour ne jamais passer
 * devant les cartes ni perturber leur jaillissement du sachet.
 *  - coins dorés en équerre, posés sur un cadre intérieur en pointillés (comme la ligne de déchirure) ;
 *  - halo clair en anneaux nets au centre, derrière le booster puis les cartes ;
 *  - motif pixel discret : pattes et feuilles du sachet, petits éclats blancs.
 */
.booster-stage {
  --corner: #d9a12e;
  outline: 2px dashed rgb(255 255 255 / 0.75);
  outline-offset: -10px;
  background-color: var(--color-butter);
  background-image:
    linear-gradient(var(--corner) 0 0), linear-gradient(var(--corner) 0 0),
    linear-gradient(var(--corner) 0 0), linear-gradient(var(--corner) 0 0),
    linear-gradient(var(--corner) 0 0), linear-gradient(var(--corner) 0 0),
    linear-gradient(var(--corner) 0 0), linear-gradient(var(--corner) 0 0),
    radial-gradient(
      ellipse 60% 48% at 50% 46%,
      rgb(255 255 255 / 0.42) 0 38%,
      rgb(255 255 255 / 0.26) 38% 62%,
      rgb(255 255 255 / 0.13) 62% 84%,
      transparent 84%
    ),
    url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 80 80' shape-rendering='crispEdges'><path fill='%23d9a93a' fill-opacity='.22' d='M10 10h2v2h-2zM14 10h2v2h-2zM8 13h2v2h-2zM16 13h2v2h-2zM11 15h4v1h-4zM10 16h6v1h-6zM9 17h8v2h-8zM10 19h2v1h-2zM14 19h2v1h-2zM52 52h2v2h-2zM56 52h2v2h-2zM50 55h2v2h-2zM58 55h2v2h-2zM53 57h4v1h-4zM52 58h6v1h-6zM51 59h8v2h-8zM52 61h2v1h-2zM56 61h2v1h-2z'/><path fill='%2383cba4' fill-opacity='.45' d='M56 12h2v1h-2zM55 13h3v1h-3zM54 14h4v1h-4zM53 15h4v1h-4zM53 16h3v1h-3zM52 17h2v1h-2zM14 58h2v1h-2zM14 59h3v1h-3zM14 60h4v1h-4zM15 61h4v1h-4zM16 62h3v1h-3zM18 63h2v1h-2z'/><path fill='%23fff' fill-opacity='.8' d='M35 6h1v1h-1zM34 7h3v1h-3zM35 8h1v1h-1zM5 38h1v1h-1zM4 39h3v1h-3zM5 40h1v1h-1zM69 36h1v1h-1zM68 37h3v1h-3zM69 38h1v1h-1zM35 70h1v1h-1zM34 71h3v1h-3zM35 72h1v1h-1z'/><path fill='%23fff' fill-opacity='.6' d='M26 30h1v1h-1zM62 4h1v1h-1zM44 44h1v1h-1zM74 72h1v1h-1z'/></svg>");
  background-position:
    left 6px top 6px,
    left 6px top 6px,
    right 6px top 6px,
    right 6px top 6px,
    left 6px bottom 6px,
    left 6px bottom 6px,
    right 6px bottom 6px,
    right 6px bottom 6px,
    center,
    -20px -12px;
  background-size:
    22px 6px,
    6px 22px,
    22px 6px,
    6px 22px,
    22px 6px,
    6px 22px,
    22px 6px,
    6px 22px,
    100% 100%,
    160px 160px;
  background-repeat:
    no-repeat, no-repeat, no-repeat, no-repeat, no-repeat, no-repeat, no-repeat, no-repeat,
    no-repeat, repeat;
}
</style>
