<script setup lang="ts">
/** UC-08 · Explorer les autres joueurs — UC-09 · Proposer un échange (une carte contre une carte). */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { CreatureSummary, PlayerSummary } from '@creatura/shared/api/types'
import { errorMessage } from '@creatura/shared/api/types'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import EmptyState from '@creatura/shared/ui/EmptyState.vue'
import CreatureCard from '@creatura/shared/ui/CreatureCard.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import TradeItems from '@creatura/shared/ui/TradeItems.vue'
import { useDebounced } from '@creatura/shared/composables'
import { toast } from '@creatura/shared/toast'

import { useCollection, useCreateTrade, useSearchPlayers, useTradeableCards } from '@/api/queries'

const router = useRouter()

const step = ref<1 | 2 | 3 | 4>(1)
const STEPS = ['Joueur', 'Carte demandée', 'Carte proposée', 'Confirmation'] as const

// Étape 1 · joueur
const search = ref('')
const debounced = useDebounced(search)
const players = useSearchPlayers(debounced)
const player = ref<PlayerSummary | null>(null)

// Étape 2 · carte demandée (doublons de l'autre joueur)
const tradeable = useTradeableCards(() => player.value?.id ?? null)
const requested = ref<CreatureSummary | null>(null)

// Étape 3 · carte proposée (mes doublons)
const mine = useCollection({ duplicatesOnly: true, pageSize: 100 })
const offered = ref<CreatureSummary | null>(null)

const create = useCreateTrade()

watch(player, () => {
  requested.value = null
})

function choosePlayer(p: PlayerSummary) {
  player.value = p
  step.value = 2
}
function chooseRequested(c: CreatureSummary) {
  requested.value = c
  step.value = 3
}
function chooseOffered(c: CreatureSummary) {
  offered.value = c
  step.value = 4
}

const canGoTo = (n: number) =>
  n === 1 ||
  (n === 2 && !!player.value) ||
  (n === 3 && !!requested.value) ||
  (n === 4 && !!offered.value)

const ready = computed(() => !!(player.value && requested.value && offered.value))

async function submit() {
  if (!player.value || !requested.value || !offered.value) return
  try {
    await create.mutateAsync({
      recipientId: player.value.id,
      offered: [{ creatureId: offered.value.id, quantity: 1 }],
      requested: [{ creatureId: requested.value.id, quantity: 1 }],
    })
    toast(`Proposition envoyée à ${player.value.pseudo}.`, 'success')
    await router.push({ name: 'trades' })
  } catch (e) {
    toast(errorMessage(e), 'error')
  }
}
</script>

<template>
  <section>
    <RouterLink to="/echanges" class="mb-2 inline-flex min-h-10 items-center gap-2 font-semibold">
      <PixelIcon name="arrow-left" :size="18" /> Mes échanges
    </RouterLink>
    <PageHeader eyebrow="UC-08 Explorer · UC-09 Proposer" title="Proposer un échange" />

    <!-- Étapes -->
    <ol class="mb-6 grid grid-cols-4 gap-1.5 sm:gap-3" aria-label="Étapes">
      <li v-for="(label, i) in STEPS" :key="label">
        <button
          type="button"
          class="flex w-full cursor-pointer flex-col items-start gap-0.5 border-2 border-ink px-2 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
          :class="step === i + 1 ? 'bg-ink text-cream' : canGoTo(i + 1) ? 'bg-white' : 'bg-mist'"
          :disabled="!canGoTo(i + 1)"
          :aria-current="step === i + 1 ? 'step' : undefined"
          @click="step = (i + 1) as 1 | 2 | 3 | 4"
        >
          <span class="font-pixel text-lg leading-none font-bold">{{ i + 1 }}</span>
          <span class="hidden text-xs font-semibold sm:block">{{ label }}</span>
        </button>
      </li>
    </ol>
    <p class="sr-only" aria-live="polite">Étape {{ step }} sur 4 : {{ STEPS[step - 1] }}</p>

    <!-- 1 · Joueur -->
    <div v-if="step === 1" class="card-pixel bg-sky p-5">
      <h2 class="text-2xl font-bold">Avec qui échanger ?</h2>
      <label for="player-search" class="field-label mt-4">Pseudonyme du joueur</label>
      <div class="relative">
        <PixelIcon
          name="search"
          :size="18"
          class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <input
          id="player-search"
          v-model="search"
          type="search"
          class="field-input pl-10"
          placeholder="Au moins 2 lettres, ex. « Li »"
          autocomplete="off"
        />
      </div>
      <div class="mt-4">
        <p v-if="debounced.trim().length < 2" class="text-sm">
          Saisissez le début d’un pseudonyme.
        </p>
        <AsyncState
          v-else
          :loading="players.isPending.value"
          :error="players.error.value"
          @retry="players.refetch()"
        >
          <ul v-if="players.data.value?.items.length" class="grid gap-2 sm:grid-cols-2">
            <li v-for="p in players.data.value.items" :key="p.id">
              <button
                type="button"
                class="btn btn-secondary w-full justify-between"
                :class="player?.id === p.id ? '!bg-sun' : ''"
                @click="choosePlayer(p)"
              >
                <span class="flex items-center gap-2"
                  ><PixelIcon name="user" :size="18" /> {{ p.pseudo }}</span
                >
                <PixelIcon name="arrow-right" :size="18" />
              </button>
            </li>
          </ul>
          <p v-else class="text-sm">Aucun joueur ne correspond à « {{ debounced }} ».</p>
        </AsyncState>
      </div>
    </div>

    <!-- 2 · Carte demandée -->
    <div v-else-if="step === 2">
      <h2 class="mb-1 text-2xl font-bold">Quelle carte voulez-vous de {{ player?.pseudo }} ?</h2>
      <p class="mb-4 text-sm">
        Seuls ses doublons sont échangeables : un exemplaire lui reste toujours.
      </p>
      <AsyncState
        :loading="tradeable.isPending.value"
        :error="tradeable.error.value"
        @retry="tradeable.refetch()"
      >
        <ul v-if="tradeable.data.value?.items.length" class="card-grid">
          <li v-for="t in tradeable.data.value.items" :key="t.creature.id">
            <button
              type="button"
              class="block h-full w-full cursor-pointer text-left transition-transform hover:-translate-y-1"
              :aria-pressed="requested?.id === t.creature.id"
              @click="chooseRequested(t.creature)"
            >
              <CreatureCard :creature="t.creature" :highlight="requested?.id === t.creature.id">
                <p class="text-center text-xs sm:text-sm">
                  Disponibles : <strong>{{ t.availableQuantity }}</strong>
                </p>
              </CreatureCard>
            </button>
          </li>
        </ul>
        <EmptyState
          v-else
          title="Aucun doublon"
          :text="`${player?.pseudo} n’a pas de carte à échanger pour l’instant.`"
        >
          <button type="button" class="btn btn-secondary" @click="step = 1">
            Choisir un autre joueur
          </button>
        </EmptyState>
      </AsyncState>
    </div>

    <!-- 3 · Carte proposée -->
    <div v-else-if="step === 3">
      <h2 class="mb-1 text-2xl font-bold">Que proposez-vous en échange ?</h2>
      <p class="mb-4 text-sm">Vos doublons uniquement. Une carte contre une carte.</p>
      <AsyncState :loading="mine.isPending.value" :error="mine.error.value" @retry="mine.refetch()">
        <ul v-if="mine.data.value?.items.length" class="card-grid">
          <li v-for="e in mine.data.value.items" :key="e.creature.id">
            <button
              type="button"
              class="block h-full w-full cursor-pointer text-left transition-transform hover:-translate-y-1"
              :aria-pressed="offered?.id === e.creature.id"
              @click="chooseOffered(e.creature)"
            >
              <CreatureCard :creature="e.creature" :highlight="offered?.id === e.creature.id">
                <p class="text-center text-xs sm:text-sm">
                  Échangeables : <strong>{{ e.quantity - 1 }}</strong>
                </p>
              </CreatureCard>
            </button>
          </li>
        </ul>
        <EmptyState
          v-else
          title="Pas de doublon"
          text="Ouvrez des boosters pour obtenir des cartes en double."
        >
          <RouterLink to="/booster" class="btn btn-primary">Mon booster</RouterLink>
        </EmptyState>
      </AsyncState>
    </div>

    <!-- 4 · Confirmation -->
    <div v-else-if="ready" class="card-pixel bg-white p-5">
      <h2 class="text-2xl font-bold">Récapitulatif</h2>
      <p class="mt-1 text-sm">
        Proposition à <strong class="font-pixel">{{ player?.pseudo }}</strong>
      </p>
      <div class="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-4">
        <TradeItems
          label="Vous donnez"
          :items="[{ creature: offered!, quantity: 1 }]"
          tone="bg-sky"
        />
        <span class="self-center font-pixel text-4xl font-bold text-brick" aria-hidden="true">
          <span class="sm:hidden">⇅</span><span class="hidden sm:inline">⇄</span>
        </span>
        <TradeItems
          label="Vous recevez"
          :items="[{ creature: requested!, quantity: 1 }]"
          tone="bg-mint"
        />
      </div>
      <p class="mt-4 border-2 border-ink bg-butter px-3 py-2 text-sm">
        Les cartes ne sont pas réservées : leur disponibilité sera vérifiée au moment où
        {{ player?.pseudo }}
        acceptera.
      </p>
      <div class="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" class="btn btn-secondary" @click="step = 3">Modifier</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="create.isPending.value"
          @click="submit"
        >
          {{ create.isPending.value ? 'Envoi…' : 'Envoyer la proposition' }}
        </button>
      </div>
    </div>
  </section>
</template>
