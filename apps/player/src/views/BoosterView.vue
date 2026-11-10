<script setup lang="ts">
/** UC-03 · Réclamer le booster du jour — UC-04 · Découvrir les cartes tirées. */
import { computed, onBeforeUnmount, ref } from 'vue'
import type { Booster } from '@creatura/shared/api/types'
import { errorMessage, isApiError } from '@creatura/shared/api/types'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import boosterUrl from '@creatura/shared/assets/booster.png'
import { formatDuration, formatPercent } from '@creatura/shared/format'
import { toast } from '@creatura/shared/toast'

import FlipCard from '@/components/FlipCard.vue'
import { useClaimBooster, useRarities, useTodayBooster } from '@/api/queries'

const { data: today, isPending, error, refetch } = useTodayBooster()
const { data: rarities } = useRarities()
const claim = useClaimBooster()

/** Booster ouvert pendant cette visite : on joue la découverte carte par carte. */
const opened = ref<Booster | null>(null)
const revealed = ref<Set<number>>(new Set())
const tearing = ref(false)

const booster = computed(() => opened.value ?? today.value?.booster ?? null)
const allRevealed = computed(
  () => !opened.value || revealed.value.size === (booster.value?.cards.length ?? 0),
)
const newCount = computed(() => booster.value?.cards.filter((c) => c.isNew).length ?? 0)

async function openBooster() {
  tearing.value = true
  try {
    const [result] = await Promise.all([
      claim.mutateAsync(),
      new Promise((r) => setTimeout(r, 900)),
    ])
    revealed.value = new Set()
    opened.value = result
  } catch (e) {
    if (isApiError(e, 'BOOSTER_ALREADY_CLAIMED'))
      toast('Ce booster a déjà été ouvert aujourd’hui.', 'info')
    else toast(errorMessage(e), 'error')
  } finally {
    tearing.value = false
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
          <!-- 1 · Disponible -->
          <div
            v-if="!booster"
            class="card-pixel flex flex-col items-center gap-4 bg-butter px-5 py-8 text-center sm:py-10"
          >
            <p class="text-xs font-bold tracking-wider uppercase">1 · Disponible</p>
            <button
              type="button"
              class="cursor-pointer disabled:cursor-wait"
              :disabled="tearing"
              aria-label="Ouvrir le booster du jour"
              @click="openBooster"
            >
              <img
                :src="boosterUrl"
                alt=""
                class="pixelated w-44 drop-shadow-[6px_6px_0_var(--color-ink)] transition-transform sm:w-56"
                :class="tearing ? 'animate-wiggle scale-110' : 'animate-float hover:scale-105'"
              />
            </button>
            <p class="max-w-sm">
              {{
                tearing
                  ? 'Ouverture du booster…'
                  : 'Votre booster du jour vous attend. Touchez-le pour l’ouvrir !'
              }}
            </p>
            <button
              type="button"
              class="btn btn-primary bg-white text-lg"
              :disabled="tearing"
              @click="openBooster"
            >
              {{ tearing ? 'Ouverture…' : 'Ouvrir le booster' }}
            </button>
          </div>

          <!-- 2 · Ouverture / 3 · Déjà réclamé -->
          <div v-else>
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
              class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
              aria-label="Cartes du booster"
            >
              <li v-for="(card, i) in booster.cards" :key="`${booster.id}-${i}`">
                <FlipCard
                  :card="card"
                  :index="i"
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
                  <span class="flex gap-0.5" aria-hidden="true">
                    <span
                      v-for="i in 3"
                      :key="i"
                      class="size-2 border border-ink"
                      :class="i <= r.rank ? 'bg-sun' : 'bg-white'"
                    />
                  </span>
                  {{ r.label }}
                </span>
                <strong>{{ formatPercent(r.dropRate * 100) }}</strong>
              </li>
            </ul>
            <p class="mt-3 border-t-2 border-dashed border-ink/30 pt-2 text-xs text-ink/75">
              Valeurs et nombre de cartes à valider au point client.
            </p>
          </div>
        </aside>
      </div>
    </AsyncState>
  </section>
</template>
