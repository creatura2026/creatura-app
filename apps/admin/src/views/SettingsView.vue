<script setup lang="ts">
/** Réglage du nombre de cartes tirées à chaque ouverture de booster. */
import { computed, ref, watch } from 'vue'
import { errorMessage } from '@creatura/shared/api/types'
import { MAX_CARDS_PER_BOOSTER, MIN_CARDS_PER_BOOSTER } from '@creatura/shared/api/mock-settings'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import { formatDateTime } from '@creatura/shared/format'
import { toast } from '@creatura/shared/toast'

import { USE_MOCK_API } from '@/api'
import { useBoosterSettings, useUpdateBoosterSettings } from '@/api/queries'

const { data: settings, isPending, error, refetch } = useBoosterSettings()
const update = useUpdateBoosterSettings()

const draft = ref(5)
watch(
  settings,
  (s) => {
    if (s) draft.value = s.cardsPerBooster
  },
  { immediate: true },
)

const dirty = computed(() => !!settings.value && draft.value !== settings.value.cardsPerBooster)

function step(delta: number) {
  draft.value = Math.min(
    MAX_CARDS_PER_BOOSTER,
    Math.max(MIN_CARDS_PER_BOOSTER, draft.value + delta),
  )
}

async function save() {
  try {
    const saved = await update.mutateAsync(draft.value)
    toast(`Les prochains boosters contiendront ${saved.cardsPerBooster} carte(s).`, 'success')
  } catch (e) {
    toast(errorMessage(e), 'error')
  }
}

/** Aperçu en éventail : une inclinaison par carte, centrée. */
const fan = computed(() =>
  Array.from({ length: draft.value }, (_, i) => {
    const k = i - (draft.value - 1) / 2
    return { rot: k * Math.min(9, 40 / Math.max(1, draft.value - 1)), y: Math.abs(k) * 3 }
  }),
)
</script>

<template>
  <section>
    <PageHeader eyebrow="Réglages" title="Réglages du booster" />

    <AsyncState :loading="isPending" :error="error" @retry="refetch()">
      <div v-if="settings" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form class="card-pixel bg-butter p-5 sm:p-6" @submit.prevent="save">
          <h2 class="font-sans text-lg font-bold">Cartes par booster</h2>
          <p class="mt-1 text-sm">Nombre de cartes que reçoit un joueur à chaque ouverture.</p>

          <div class="mt-5 flex items-center justify-center gap-4">
            <button
              type="button"
              class="btn btn-secondary size-12 p-0 text-2xl"
              :disabled="draft <= MIN_CARDS_PER_BOOSTER"
              aria-label="Une carte de moins"
              @click="step(-1)"
            >
              −
            </button>
            <output
              for="cards-range"
              class="min-w-20 text-center font-pixel text-6xl leading-none font-bold tabular-nums"
              aria-live="polite"
            >
              {{ draft }}
            </output>
            <button
              type="button"
              class="btn btn-secondary size-12 p-0 text-2xl"
              :disabled="draft >= MAX_CARDS_PER_BOOSTER"
              aria-label="Une carte de plus"
              @click="step(1)"
            >
              +
            </button>
          </div>

          <label for="cards-range" class="sr-only">Cartes par booster</label>
          <input
            id="cards-range"
            v-model.number="draft"
            type="range"
            :min="MIN_CARDS_PER_BOOSTER"
            :max="MAX_CARDS_PER_BOOSTER"
            step="1"
            class="mt-5 w-full accent-ink"
          />
          <div class="flex justify-between text-xs font-semibold" aria-hidden="true">
            <span>{{ MIN_CARDS_PER_BOOSTER }}</span>
            <span>{{ MAX_CARDS_PER_BOOSTER }}</span>
          </div>

          <!-- Aperçu : les dos de cartes tels qu'ils sortiront du sachet -->
          <div class="mt-6 flex h-28 items-end justify-center" aria-hidden="true">
            <span
              v-for="(c, i) in fan"
              :key="i"
              class="-mx-2.5 block h-20 w-14 origin-bottom border-2 border-ink bg-ink p-1 shadow-pixel-xs transition-transform duration-200"
              :style="{ transform: `translateY(${c.y}px) rotate(${c.rot}deg)` }"
            >
              <span class="block size-full border-2 border-cream/80" />
            </span>
          </div>

          <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="!dirty || update.isPending.value"
              @click="draft = settings.cardsPerBooster"
            >
              Annuler
            </button>
            <button
              type="submit"
              class="btn btn-primary bg-white"
              :disabled="!dirty || update.isPending.value"
            >
              <PixelIcon name="check" :size="18" />
              {{ update.isPending.value ? 'Enregistrement…' : 'Enregistrer' }}
            </button>
          </div>
        </form>

        <aside class="flex flex-col gap-5">
          <div class="card-pixel-sm bg-sky p-4 text-sm">
            <p class="font-bold">Quand le changement s’applique-t-il ?</p>
            <p class="mt-1">
              Aux boosters ouverts après l’enregistrement. Les boosters déjà ouverts ne changent
              pas.
            </p>
          </div>
          <div class="card-pixel-sm bg-white p-4 text-sm">
            <p class="font-bold">Valeur actuelle : {{ settings.cardsPerBooster }}</p>
            <p v-if="settings.updatedAt" class="mt-1">
              Modifiée le {{ formatDateTime(settings.updatedAt) }}
              <template v-if="settings.updatedBy">par {{ settings.updatedBy.pseudo }}</template
              >.
            </p>
            <p v-else class="mt-1">Valeur par défaut, jamais modifiée.</p>
          </div>
          <p v-if="USE_MOCK_API" class="border-2 border-dashed border-ink/50 p-3 text-xs">
            Démo sans serveur : le réglage est partagé avec l’app joueur locale par un cookie.
          </p>
        </aside>
      </div>
    </AsyncState>
  </section>
</template>
