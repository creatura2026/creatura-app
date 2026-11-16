<script setup lang="ts">
/** Réglages des boosters (nombre de cartes, poids des raretés), appliqués au prochain minuit. */
import { computed, ref, watch } from 'vue'
import { errorMessage, type RarityWeights } from '@creatura/shared/api/types'
import { MAX_CARDS_PER_BOOSTER, MIN_CARDS_PER_BOOSTER } from '@creatura/shared/api/mock-settings'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import { formatDate, formatDateTime } from '@creatura/shared/format'
import { toast } from '@creatura/shared/toast'

import { USE_MOCK_API } from '@/api'
import { useBoosterSettings, useUpdateBoosterSettings } from '@/api/queries'

const { data: settings, isPending, error, refetch } = useBoosterSettings()
const update = useUpdateBoosterSettings()

const RARITY_FIELDS: { code: keyof RarityWeights; label: string }[] = [
  { code: 'COMMON', label: 'Commune' },
  { code: 'UNCOMMON', label: 'Peu commune' },
  { code: 'RARE', label: 'Rare' },
  { code: 'LEGENDARY', label: 'Légendaire' },
]

const draft = ref(5)
const weights = ref<RarityWeights>({ COMMON: 70, UNCOMMON: 20, RARE: 8, LEGENDARY: 2 })

/** Valeurs de référence du formulaire : celles prévues à minuit, sinon celles du jour. */
const target = computed(() => settings.value?.scheduled ?? settings.value)
function reset() {
  if (!target.value) return
  draft.value = target.value.cardsPerBooster
  weights.value = { ...target.value.rarityWeights }
}
watch(target, reset, { immediate: true })

const weightTotal = computed(() => Object.values(weights.value).reduce((a, b) => a + (b || 0), 0))
const dirty = computed(
  () =>
    !!target.value &&
    (draft.value !== target.value.cardsPerBooster ||
      RARITY_FIELDS.some((r) => weights.value[r.code] !== target.value!.rarityWeights[r.code])),
)

function step(delta: number) {
  draft.value = Math.min(
    MAX_CARDS_PER_BOOSTER,
    Math.max(MIN_CARDS_PER_BOOSTER, draft.value + delta),
  )
}

async function save() {
  try {
    const saved = await update.mutateAsync({
      cardsPerBooster: draft.value,
      rarityWeights: weights.value,
    })
    const when = saved.scheduled ? formatDate(saved.scheduled.effectiveFrom) : 'demain'
    toast(`Réglages enregistrés : appliqués à partir du ${when}, minuit.`, 'success')
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

          <fieldset class="mt-6">
            <legend class="font-sans text-lg font-bold">Poids des raretés</legend>
            <p class="mt-1 text-sm">
              On tire d’abord la rareté selon ces poids, puis une carte au hasard. Au plus une rare
              ou une légendaire par booster.
            </p>
            <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label v-for="r in RARITY_FIELDS" :key="r.code" class="text-sm font-semibold">
                {{ r.label }}
                <input
                  v-model.number="weights[r.code]"
                  type="number"
                  min="0"
                  max="1000"
                  step="1"
                  class="mt-1 w-full border-2 border-ink bg-white px-2 py-1.5 font-pixel text-lg tabular-nums"
                />
                <span class="text-xs font-normal">
                  {{
                    weightTotal ? Math.round(((weights[r.code] || 0) * 1000) / weightTotal) / 10 : 0
                  }}
                  % par tirage
                </span>
              </label>
            </div>
          </fieldset>

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
              @click="reset()"
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
              Au prochain minuit (heure de Paris). Les boosters du jour gardent les réglages en
              vigueur ; une nouvelle modification dans la journée remplace la précédente.
            </p>
          </div>
          <div v-if="settings.scheduled" class="card-pixel-sm bg-butter p-4 text-sm">
            <p class="font-bold">
              Prévu le {{ formatDate(settings.scheduled.effectiveFrom) }}, minuit
            </p>
            <p class="mt-1">
              {{ settings.scheduled.cardsPerBooster }} cartes · poids
              {{ settings.scheduled.rarityWeights.COMMON }} /
              {{ settings.scheduled.rarityWeights.UNCOMMON }} /
              {{ settings.scheduled.rarityWeights.RARE }} /
              {{ settings.scheduled.rarityWeights.LEGENDARY }}
            </p>
          </div>
          <div class="card-pixel-sm bg-white p-4 text-sm">
            <p class="font-bold">En vigueur aujourd’hui : {{ settings.cardsPerBooster }} cartes</p>
            <p class="mt-1">
              Poids {{ settings.rarityWeights.COMMON }} / {{ settings.rarityWeights.UNCOMMON }} /
              {{ settings.rarityWeights.RARE }} / {{ settings.rarityWeights.LEGENDARY }}
            </p>
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
