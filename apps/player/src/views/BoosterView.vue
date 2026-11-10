<script setup lang="ts">
/** UC-03 · Réclamer le booster du jour — UC-04 · Découvrir les cartes tirées. */
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
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

const { data: today, isPending, error, refetch } = useTodayBooster()
const { data: rarities } = useRarities()
const claim = useClaimBooster()

/** Booster ouvert pendant cette visite : on joue la découverte carte par carte. */
const opened = ref<Booster | null>(null)
const revealed = ref<Set<number>>(new Set())

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

/** Nombre de cartes à dessiner dans le sachet (réglé par l'administrateur). */
const cardsInPack = computed(() => pending.value?.cards.length ?? today.value?.cardsPerBooster ?? 5)

const booster = computed(() => opened.value ?? today.value?.booster ?? null)
const showTear = computed(() => animating.value || !booster.value)
const allRevealed = computed(
  () => !opened.value || revealed.value.size === (booster.value?.cards.length ?? 0),
)
const newCount = computed(() => booster.value?.cards.filter((c) => c.isNew).length ?? 0)

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

/** Les cartes sortent du sachet et vont se poser dans la grille, face cachée. */
async function onTearDone(result: TearResult) {
  if (!pending.value) return
  revealed.value = new Set()
  bursting.value = !reduced
  if (bursting.value) ghost.value = result
  opened.value = pending.value
  pending.value = null
  animating.value = false
  if (!bursting.value) return
  await nextTick()
  const cards = [...(grid.value?.querySelectorAll<HTMLElement>('[data-card-index]') ?? [])].sort(
    (a, b) => Number(a.dataset.cardIndex) - Number(b.dataset.cardIndex),
  )
  await burstFromPack(result, cards, ghostEl.value)
  ghost.value = null
}

/** Alternative sans geste (accessibilité, préférence de l'utilisateur). */
async function openWithoutTearing() {
  claiming.value = true
  try {
    const result = await claim.mutateAsync()
    revealed.value = new Set()
    opened.value = result
  } catch (e) {
    claimFailed(e)
  } finally {
    claiming.value = false
  }
}

function reveal(index: number) {
  revealed.value = new Set(revealed.value).add(index)
}
function revealAll() {
  revealed.value = new Set(booster.value?.cards.map((_, i) => i))
}

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
          <!-- 1 · Disponible : le joueur déchire lui-même le sachet -->
          <div
            v-if="showTear"
            class="card-pixel flex flex-col items-center gap-3 overflow-hidden bg-butter px-4 py-6 text-center sm:py-8"
          >
            <p class="text-xs font-bold tracking-wider uppercase">1 · Disponible</p>
            <BoosterTear
              :key="tearKey"
              :ready="!!pending"
              :cards="cardsInPack"
              @torn="onTorn"
              @done="onTearDone"
            />
            <p v-if="!animating" class="text-sm">
              Ce booster contient <strong>{{ today.cardsPerBooster }}</strong> carte{{
                today.cardsPerBooster > 1 ? 's' : ''
              }}.
            </p>
            <button
              v-if="!animating"
              type="button"
              class="btn btn-secondary min-h-10 text-sm"
              :disabled="claiming"
              @click="openWithoutTearing"
            >
              {{ claiming ? 'Ouverture…' : 'Ouvrir sans déchirer' }}
            </button>
          </div>

          <!-- 2 · Ouverture / 3 · Déjà réclamé -->
          <div v-else-if="booster">
            <div
              class="card-pixel-sm mb-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              :class="opened ? 'bg-mint' : 'bg-sky'"
            >
              <div>
                <p class="font-bold">
                  {{ opened ? '2 · Ouverture' : '3 · Déjà réclamé aujourd’hui' }}
                </p>
                <p class="text-sm">
                  <template v-if="opened">
                    {{ booster.cards.length }} cartes ajoutées à votre collection<template
                      v-if="newCount"
                    >
                      dont {{ newCount }} nouvelle{{ newCount > 1 ? 's' : '' }}</template
                    >.
                  </template>
                  <template v-else>Une nouvelle demande ne donne aucune carte.</template>
                </p>
              </div>
              <p class="flex items-center gap-2 text-sm font-semibold">
                <PixelIcon name="clock" :size="18" /> Prochain booster dans {{ remaining }}
              </p>
            </div>

            <ul
              ref="grid"
              class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
              aria-label="Cartes du booster"
            >
              <li
                v-for="(card, i) in booster.cards"
                :key="`${booster.id}-${i}`"
                class="relative"
                :data-card-index="i"
              >
                <FlipCard
                  :card="card"
                  :index="i"
                  :intro="!bursting"
                  :revealed="!opened || revealed.has(i)"
                  @reveal="reveal(i)"
                />
              </li>
            </ul>

            <div class="mt-6 flex flex-wrap gap-3">
              <button v-if="!allRevealed" type="button" class="btn btn-primary" @click="revealAll">
                Tout révéler
              </button>
              <RouterLink v-else to="/collection" class="btn btn-success">
                Voir ma collection <PixelIcon name="arrow-right" :size="18" />
              </RouterLink>
            </div>
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
              Survolez une carte : la couleur de son bord indique sa rareté.
            </p>
            <p class="mt-3 border-t-2 border-dashed border-ink/30 pt-2 text-xs text-ink/75">
              Probabilités à valider au point client. Nombre de cartes par booster réglé par
              l’administrateur.
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
