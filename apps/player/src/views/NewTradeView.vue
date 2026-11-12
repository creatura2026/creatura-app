<script setup lang="ts">
/**
 * UC-08 · Explorer — UC-09 · Ouvrir un échange.
 *
 * Deux façons d'y arriver : choisir un joueur (et voir toutes ses cartes), ou choisir une carte du
 * catalogue (et voir tous les joueurs qui la possèdent). Dans les deux cas on ouvre une salle
 * d'échange, où chacun pose ensuite ses cartes. `?carte=<id>` ouvre directement la recherche par carte.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { CreatureSummary, PlayerSummary } from '@creatura/shared/api/types'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import EmptyState from '@creatura/shared/ui/EmptyState.vue'
import CreatureCard from '@creatura/shared/ui/CreatureCard.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import { useDebounced } from '@creatura/shared/composables'

import CreatureFilters from '@/components/CreatureFilters.vue'
import CreatureOwners from '@/components/CreatureOwners.vue'
import { useCollection, useCreatures, usePlayerCards, useSearchPlayers } from '@/api/queries'
import { useOpenTrade } from '@/composables/useOpenTrade'

type Mode = 'player' | 'card'

const route = useRoute()
const router = useRouter()
const open = useOpenTrade()

const mode = ref<Mode>(route.query.carte ? 'card' : 'player')
const MODES: { value: Mode; label: string }[] = [
  { value: 'player', label: 'Par joueur' },
  { value: 'card', label: 'Par carte' },
]

// ── Par joueur : ses cartes, toutes échangeables ─────────────────────────────
const search = ref('')
const debounced = useDebounced(search)
const players = useSearchPlayers(debounced)
const player = ref<PlayerSummary | null>(null)
const cards = usePlayerCards(() => player.value?.id ?? null)
const opening = ref(false)

async function openWith(playerId: string, wantedId?: string) {
  opening.value = true
  try {
    await open(playerId, wantedId)
  } finally {
    opening.value = false
  }
}

// ── Par carte : le catalogue, puis les joueurs qui ont la carte ──────────────
const cardSearch = ref('')
const family = ref('')
const rarity = ref('')
const cardSearchDebounced = useDebounced(cardSearch)
const catalogue = useCreatures(() => ({
  search: cardSearchDebounced.value.trim() || undefined,
  family: family.value || undefined,
  rarity: rarity.value || undefined,
  pageSize: 100,
}))
const { data: mine } = useCollection({ pageSize: 100 })
const owned = computed(
  () => new Map((mine.value?.items ?? []).map((e) => [e.creature.id, e.quantity] as const)),
)
/** Les cartes qui manquent d'abord : c'est celles qu'on vient chercher. */
const catalogueCards = computed(() =>
  [...(catalogue.data.value?.items ?? [])].sort(
    (a, b) => Number(!!owned.value.get(a.id)) - Number(!!owned.value.get(b.id)),
  ),
)

const wantedId = ref<string | null>(
  typeof route.query.carte === 'string' ? route.query.carte : null,
)
const wanted = computed<CreatureSummary | null>(
  () => catalogue.data.value?.items.find((c) => c.id === wantedId.value) ?? null,
)

function chooseCard(id: string | null) {
  wantedId.value = id
  void router.replace({ query: id ? { carte: id } : {} })
}

watch(mode, (m) => {
  if (m === 'player') void router.replace({ query: {} })
  else if (wantedId.value) void router.replace({ query: { carte: wantedId.value } })
})
</script>

<template>
  <section>
    <RouterLink to="/echanges" class="mb-2 inline-flex min-h-10 items-center gap-2 font-semibold">
      <PixelIcon name="arrow-left" :size="18" /> Mes échanges
    </RouterLink>
    <PageHeader title="Ouvrir un échange" />

    <div
      role="tablist"
      aria-label="Chercher un échange"
      class="mb-5 grid grid-cols-2 border-2 border-ink bg-white sm:inline-grid"
    >
      <button
        v-for="m in MODES"
        :key="m.value"
        type="button"
        role="tab"
        class="min-h-11 cursor-pointer px-4 font-semibold not-last:border-r-2 not-last:border-ink sm:px-6"
        :class="mode === m.value ? 'bg-ink text-cream' : 'hover:bg-mist'"
        :aria-selected="mode === m.value"
        @click="mode = m.value"
      >
        {{ m.label }}
      </button>
    </div>

    <!-- Par joueur -->
    <div v-if="mode === 'player'" class="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div class="card-pixel self-start bg-sky p-5">
        <label for="player-search" class="field-label">Pseudonyme du joueur</label>
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
            placeholder="Au moins 2 lettres"
            autocomplete="off"
          />
        </div>
        <div class="mt-4">
          <p v-if="debounced.trim().length < 2" class="text-sm">Tapez le début d’un pseudonyme.</p>
          <AsyncState
            v-else
            :loading="players.isPending.value"
            :error="players.error.value"
            @retry="players.refetch()"
          >
            <ul v-if="players.data.value?.items.length" class="flex flex-col gap-2">
              <li v-for="p in players.data.value.items" :key="p.id">
                <button
                  type="button"
                  class="btn btn-secondary w-full justify-between"
                  :class="player?.id === p.id ? '!bg-sun' : ''"
                  :aria-pressed="player?.id === p.id"
                  @click="player = p"
                >
                  <span class="flex items-center gap-2">
                    <PixelIcon name="user" :size="18" /> {{ p.pseudo }}
                  </span>
                  <PixelIcon name="arrow-right" :size="18" />
                </button>
              </li>
            </ul>
            <p v-else class="text-sm">Aucun joueur ne s’appelle « {{ debounced }}… ».</p>
          </AsyncState>
        </div>
      </div>

      <div>
        <EmptyState
          v-if="!player"
          title="Choisissez un joueur"
          text="Vous verrez toutes ses cartes et pourrez ouvrir un échange avec lui."
        />
        <template v-else>
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-2xl font-bold">Les cartes de {{ player.pseudo }}</h2>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="opening"
              @click="openWith(player.id)"
            >
              <PixelIcon name="trade" :size="18" />
              {{ opening ? 'Ouverture…' : `Échanger avec ${player.pseudo}` }}
            </button>
          </div>
          <AsyncState
            :loading="cards.isPending.value"
            :error="cards.error.value"
            @retry="cards.refetch()"
          >
            <!-- La grille partage la largeur avec la recherche : moins de colonnes que d'habitude -->
            <ul
              v-if="cards.data.value?.items.length"
              class="card-grid lg:grid-cols-3 xl:grid-cols-4"
            >
              <li v-for="c in cards.data.value.items" :key="c.creature.id" class="relative">
                <button
                  type="button"
                  class="block h-full w-full cursor-pointer text-left transition-transform enabled:hover:-translate-y-1"
                  :disabled="opening"
                  :aria-label="`Échanger avec ${player.pseudo} pour obtenir ${c.creature.name}`"
                  @click="openWith(player.id, c.creature.id)"
                >
                  <CreatureCard :creature="c.creature" :quantity="c.availableQuantity" />
                </button>
                <span
                  v-if="!owned.get(c.creature.id)"
                  class="pointer-events-none absolute -top-3 -right-2 rotate-6 border-2 border-ink bg-sun px-2 py-0.5 font-pixel text-xs font-bold"
                >
                  Il vous la faut
                </span>
              </li>
            </ul>
            <EmptyState
              v-else
              title="Aucune carte"
              :text="`${player.pseudo} n’a pas encore de carte.`"
            />
          </AsyncState>
        </template>
      </div>
    </div>

    <!-- Par carte -->
    <div v-else>
      <div v-if="wantedId" class="grid gap-5 md:grid-cols-[12rem_minmax(0,1fr)]">
        <div class="mx-auto w-44 md:w-auto">
          <CreatureCard v-if="wanted" :creature="wanted" />
        </div>
        <div>
          <button
            type="button"
            class="mb-3 inline-flex min-h-10 cursor-pointer items-center gap-2 font-semibold"
            @click="chooseCard(null)"
          >
            <PixelIcon name="arrow-left" :size="18" /> Choisir une autre carte
          </button>
          <h2 class="mb-3 text-2xl font-bold">Qui possède {{ wanted?.name ?? 'cette carte' }} ?</h2>
          <CreatureOwners :creature-id="wantedId" :creature-name="wanted?.name ?? 'cette carte'" />
        </div>
      </div>

      <template v-else>
        <CreatureFilters
          v-model:search="cardSearch"
          v-model:family="family"
          v-model:rarity="rarity"
          title="Quelle carte cherchez-vous ?"
        />
        <div class="mt-6">
          <AsyncState
            :loading="catalogue.isPending.value"
            :error="catalogue.error.value"
            @retry="catalogue.refetch()"
          >
            <ul v-if="catalogueCards.length" class="card-grid">
              <li v-for="c in catalogueCards" :key="c.id">
                <button
                  type="button"
                  class="block h-full w-full cursor-pointer text-left transition-transform hover:-translate-y-1"
                  :aria-label="`Trouver les joueurs qui possèdent ${c.name}`"
                  @click="chooseCard(c.id)"
                >
                  <CreatureCard
                    :creature="c"
                    :missing="!owned.get(c.id)"
                    :quantity="owned.get(c.id) ?? 0"
                  />
                </button>
              </li>
            </ul>
            <EmptyState v-else title="Aucune créature" text="Aucune carte ne correspond." />
          </AsyncState>
        </div>
      </template>
    </div>
  </section>
</template>
