<script setup lang="ts">
/**
 * UC-09 · UC-10 — Salle d'échange en temps réel.
 *
 * À gauche, le tapis du joueur connecté avec les cartes qu'il donne ; à droite, celui de l'autre
 * joueur. Chacun pose ses cartes, discute, puis valide. L'échange est conclu quand les deux ont
 * validé ; retirer sa validation rouvre son tapis. Toute modification d'un tapis retire les deux
 * validations (règle du serveur) : on ne valide que ce que l'on voit.
 */
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Problem, Trade, TradeItem } from '@creatura/shared/api/types'
import { errorMessage } from '@creatura/shared/api/types'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import TradeStatusBadge from '@creatura/shared/ui/TradeStatusBadge.vue'
import { toast } from '@creatura/shared/toast'

import TradeMat from '@/components/TradeMat.vue'
import TradeChat from '@/components/TradeChat.vue'
import TradeCardPicker from '@/components/TradeCardPicker.vue'
import { useLeaveTrade } from '@/api/queries'
import { seatsOf } from '@/composables/tradeSeats'
import { useTradeRoom } from '@/composables/useTradeRoom'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ id: string }>()

const auth = useAuthStore()
const router = useRouter()
const meId = computed(() => auth.user?.id ?? '')
const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Refus du serveur avant même d'entrer (échange inconnu, ou d'autres joueurs). */
const refused = ref<Problem | null>(null)
/** Les cartes ont changé de tapis à la conclusion : chaque tapis montre ce que son joueur reçoit. */
const swapped = ref(false)

const room = useTradeRoom(() => props.id, {
  onTrade: (next, previous) => {
    if (!previous) {
      swapped.value = next.status === 'ACCEPTED'
      return
    }
    if (previous.status === 'PENDING' && next.status === 'ACCEPTED') void celebrate()
    else if (previous.status === 'PENDING' && next.status !== 'PENDING') {
      toast(`${seatsOf(next, meId.value).theirs.player.pseudo} a abandonné l’échange.`, 'info')
    } else noticeChanges(previous, next)
  },
  onError: (problem) => {
    if (!room.connected.value) refused.value = problem
    else toast(problem.detail ?? problem.title, 'error', 6000)
  },
})

const trade = room.trade
const seats = computed(() => (trade.value ? seatsOf(trade.value, meId.value) : null))
const pending = computed(() => trade.value?.status === 'PENDING')
const partner = computed(() => seats.value?.theirs.player.pseudo ?? '')
const partnerOnline = computed(
  () => !!seats.value && room.online.value.includes(seats.value.theirs.player.id),
)
const bothHaveCards = computed(
  () => !!seats.value?.mine.cards.length && !!seats.value?.theirs.cards.length,
)
/** On modifie son tapis tant qu'on n'a pas validé. */
const canEdit = computed(() => pending.value && !seats.value?.mine.ready)

/** Ce que l'on cherche chez l'autre, ou ce que l'autre cherche chez nous. */
const wanted = computed(() => trade.value?.wanted ?? null)
const wantedFromMe = computed(() => !!wanted.value && !seats.value?.iAmProposer)

const status = computed(() => {
  const s = seats.value
  if (!s || !trade.value) return ''
  switch (trade.value.status) {
    case 'ACCEPTED':
      return 'Échange conclu : les cartes ont changé de collection.'
    case 'REFUSED':
    case 'CANCELLED':
      return 'Échange abandonné. Aucune carte n’a bougé.'
    case 'FAILED':
      return 'L’échange n’a pas pu aboutir. Aucune carte n’a bougé.'
  }
  if (s.mine.ready && s.theirs.ready) return 'Échange en cours de conclusion…'
  if (s.mine.ready) return `Vous avez validé. ${partner.value} doit valider à son tour.`
  if (s.theirs.ready) return `${partner.value} a validé. Validez pour conclure l’échange.`
  if (!s.mine.cards.length) return 'Posez sur votre tapis les cartes que vous donnez.'
  if (!s.theirs.cards.length) return `${partner.value} n’a encore posé aucune carte.`
  return 'Quand l’échange vous convient, validez-le.'
})

// ── Tapis ────────────────────────────────────────────────────────────────────

const toInputs = (items: TradeItem[]) =>
  items.map((item) => ({ creatureId: item.creature.id, quantity: item.quantity }))

function add(creatureId: string) {
  const cards = seats.value?.mine.cards ?? []
  const inputs = toInputs(cards)
  const line = inputs.find((i) => i.creatureId === creatureId)
  if (line) line.quantity++
  else inputs.push({ creatureId, quantity: 1 })
  room.setOffer(inputs)
}

function remove(creatureId: string) {
  const inputs = toInputs(seats.value?.mine.cards ?? [])
    .map((i) => (i.creatureId === creatureId ? { ...i, quantity: i.quantity - 1 } : i))
    .filter((i) => i.quantity > 0)
  room.setOffer(inputs)
}

function toggleReady() {
  if (!seats.value) return
  room.setReady(!seats.value.mine.ready)
}

/** Signale ce qui a changé chez l'autre joueur pendant qu'on regardait. */
function noticeChanges(previous: Trade, next: Trade) {
  const before = seatsOf(previous, meId.value)
  const now = seatsOf(next, meId.value)
  const theirCardsChanged = JSON.stringify(before.theirs.cards) !== JSON.stringify(now.theirs.cards)
  if (before.mine.ready && !now.mine.ready && theirCardsChanged) {
    toast(`${partner.value} a modifié son tapis : votre validation a été retirée.`, 'info', 6000)
  }
}

// ── Conclusion : les cartes traversent la table ─────────────────────────────

const table = ref<HTMLElement | null>(null)

async function celebrate() {
  const el = table.value
  if (!el || reduced) {
    swapped.value = true
    return
  }
  const mats = [...el.querySelectorAll<HTMLElement>('[data-mat]')]
  const [mine, theirs] = mats.map((m) => m.getBoundingClientRect())
  if (!mine || !theirs) {
    swapped.value = true
    return
  }
  const flights = [...el.querySelectorAll<HTMLElement>('[data-flip]')].map((card, i) => {
    const r = card.getBoundingClientRect()
    const fromMine = mats[0]!.contains(card)
    const target = fromMine ? theirs : mine
    const dx = target.left + target.width / 2 - (r.left + r.width / 2)
    const dy = target.top + target.height / 2 - (r.top + r.height / 2)
    return card.animate(
      [
        { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
        {
          offset: 0.35,
          transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 40}px) rotate(${fromMine ? 6 : -6}deg)`,
          opacity: 1,
        },
        { transform: `translate(${dx}px, ${dy}px) rotate(0) scale(0.9)`, opacity: 0 },
      ],
      { duration: 720, delay: i * 70, easing: 'cubic-bezier(.35,.1,.25,1)', fill: 'forwards' },
    )
  })
  await Promise.all(flights.map((a) => a.finished.catch(() => undefined)))
  swapped.value = true
  await nextTick()
  flights.forEach((a) => a.cancel())
}

// ── Abandon ──────────────────────────────────────────────────────────────────

const leave = useLeaveTrade()
const confirmLeave = ref(false)

async function abandon() {
  if (!trade.value || !seats.value) return
  try {
    await leave.mutateAsync({ id: trade.value.id, asProposer: seats.value.iAmProposer })
    toast('Échange abandonné. Aucune carte n’a bougé.', 'info')
    await router.push({ name: 'trades' })
  } catch (e) {
    toast(errorMessage(e), 'error')
  } finally {
    confirmLeave.value = false
  }
}

/** Après la conclusion, chaque tapis montre ce que son joueur a reçu. */
const leftCards = computed(() =>
  swapped.value ? (seats.value?.theirs.cards ?? []) : (seats.value?.mine.cards ?? []),
)
const rightCards = computed(() =>
  swapped.value ? (seats.value?.mine.cards ?? []) : (seats.value?.theirs.cards ?? []),
)
</script>

<template>
  <section>
    <RouterLink to="/echanges" class="mb-2 inline-flex min-h-10 items-center gap-2 font-semibold">
      <PixelIcon name="arrow-left" :size="18" /> Mes échanges
    </RouterLink>

    <div
      v-if="refused"
      class="card-pixel-sm flex flex-col items-start gap-3 bg-salmon p-5"
      role="alert"
    >
      <p class="font-bold">Impossible d’ouvrir cet échange.</p>
      <p class="text-sm">{{ refused.detail ?? refused.title }}</p>
      <RouterLink to="/echanges" class="btn btn-secondary">Retour à mes échanges</RouterLink>
    </div>

    <AsyncState v-else :loading="!trade" loading-label="Entrée dans la salle d’échange…">
      <template v-if="trade && seats">
        <header class="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div class="min-w-0">
            <h1 class="text-3xl leading-tight font-bold sm:text-4xl">Échange avec {{ partner }}</h1>
            <p class="mt-1 font-semibold" aria-live="polite">{{ status }}</p>
          </div>
          <TradeStatusBadge v-if="!pending" :status="trade.status" />
          <div v-else class="flex flex-wrap items-center gap-2">
            <template v-if="confirmLeave">
              <span class="text-sm font-semibold">Abandonner cet échange ?</span>
              <button type="button" class="btn btn-secondary" @click="confirmLeave = false">
                Continuer
              </button>
              <button
                type="button"
                class="btn btn-danger"
                :disabled="leave.isPending.value"
                @click="abandon"
              >
                {{ leave.isPending.value ? 'Abandon…' : 'Abandonner' }}
              </button>
            </template>
            <button v-else type="button" class="btn btn-secondary" @click="confirmLeave = true">
              Abandonner l’échange
            </button>
          </div>
        </header>

        <!-- Table : mon tapis à gauche, celui de l'autre joueur à droite -->
        <div ref="table" class="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <TradeMat
            data-mat
            :title="swapped ? 'Vous avez reçu' : 'Vous donnez'"
            :cards="leftCards"
            :owner-id="swapped ? seats.theirs.player.id : seats.mine.player.id"
            :editable="canEdit && !swapped"
            :stamp="pending && seats.mine.ready ? 'Validé' : undefined"
            empty-text="Touchez une carte de votre collection pour la poser ici."
            @remove="remove"
          >
            <template v-if="pending && wanted && wantedFromMe" #hint>
              <p class="border-2 border-ink bg-white/80 px-3 py-1.5 text-sm">
                {{ partner }} cherche <strong>{{ wanted.name }}</strong
                >.
              </p>
            </template>
          </TradeMat>

          <!-- Validation : le geste qui conclut, entre les deux tapis -->
          <div class="flex flex-col items-center justify-center gap-2 lg:w-44">
            <span class="font-pixel text-4xl leading-none font-bold text-brick" aria-hidden="true">
              <span class="lg:hidden">⇅</span><span class="hidden lg:inline">⇄</span>
            </span>
            <button
              v-if="pending"
              type="button"
              role="switch"
              class="ready-toggle"
              :aria-checked="seats.mine.ready"
              :disabled="!seats.mine.ready && !bothHaveCards"
              @click="toggleReady"
            >
              <span class="ready-box" aria-hidden="true">
                <PixelIcon v-if="seats.mine.ready" name="check" :size="22" />
              </span>
              <span>{{ seats.mine.ready ? 'Validé' : 'Valider' }}</span>
            </button>
            <p v-if="pending && seats.mine.ready" class="max-w-44 text-center text-xs">
              Décochez pour modifier vos cartes.
            </p>
            <p v-else-if="pending && !bothHaveCards" class="max-w-44 text-center text-xs">
              Une carte au moins de chaque côté.
            </p>
            <RouterLink
              v-if="trade.status === 'ACCEPTED'"
              to="/collection"
              class="btn btn-success whitespace-nowrap"
            >
              Ma collection <PixelIcon name="arrow-right" :size="18" />
            </RouterLink>
          </div>

          <TradeMat
            data-mat
            :title="swapped ? `${partner} a reçu` : `${partner} donne`"
            :cards="rightCards"
            :owner-id="swapped ? seats.mine.player.id : seats.theirs.player.id"
            :stamp="pending && seats.theirs.ready ? 'Validé' : undefined"
            :empty-text="pending ? `${partner} n’a encore posé aucune carte.` : 'Aucune carte.'"
          >
            <template v-if="pending && wanted && !wantedFromMe" #hint>
              <p class="border-2 border-ink bg-white/80 px-3 py-1.5 text-sm">
                Vous cherchez <strong>{{ wanted.name }}</strong
                >.
              </p>
            </template>
          </TradeMat>
        </div>

        <!-- Sous la table : sa collection pour poser des cartes, et la discussion -->
        <div
          class="mt-6 grid gap-5"
          :class="pending ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : 'max-w-2xl'"
        >
          <TradeCardPicker
            v-if="pending"
            :on-mat="seats.mine.cards"
            :locked="!canEdit"
            :wanted-id="wantedFromMe ? wanted?.id : null"
            @add="add"
          />
          <TradeChat
            :class="pending ? 'lg:sticky lg:top-24 lg:max-h-[32rem]' : 'max-h-[28rem]'"
            :messages="room.messages.value"
            :me-id="meId"
            :partner="partner"
            :partner-online="partnerOnline"
            :closed="!pending"
            @send="room.say"
          />
        </div>
      </template>
    </AsyncState>
  </section>
</template>

<style scoped>
/* Case « Valider » : une grande case à cocher pixel, qu'on peut décocher pour revenir en arrière. */
.ready-toggle {
  display: inline-flex;
  min-height: 3.5rem;
  cursor: pointer;
  align-items: center;
  gap: 0.75rem;
  border: 2px solid var(--color-ink);
  background: var(--color-sun);
  padding: 0.5rem 1.25rem 0.5rem 0.75rem;
  font-family: var(--font-pixel);
  font-size: 1.375rem;
  font-weight: 700;
  box-shadow: var(--shadow-pixel-sm);
  transition:
    transform 100ms,
    box-shadow 100ms,
    background-color 160ms;
}
.ready-toggle:hover:not(:disabled) {
  transform: translate(-1px, -1px);
  box-shadow: 5px 5px 0 0 var(--color-ink);
}
.ready-toggle:active:not(:disabled) {
  transform: translate(4px, 4px);
  box-shadow: none;
}
.ready-toggle[aria-checked='true'] {
  background: var(--color-mint);
}
.ready-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.ready-box {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border: 2px solid var(--color-ink);
  background: white;
}
@media (prefers-reduced-motion: reduce) {
  .ready-toggle {
    transition: none;
  }
}
</style>
