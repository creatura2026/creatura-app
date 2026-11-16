<script setup lang="ts">
/** Fiche d'une créature (UC-05), avec la quantité possédée. */
import { computed } from 'vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import RarityGems from '@creatura/shared/ui/RarityGems.vue'
import { familyTint } from '@creatura/shared/family'
import { formatPercent } from '@creatura/shared/format'

import CreatureOwners from '@/components/CreatureOwners.vue'
import { useCollection, useCreature, useRarities } from '@/api/queries'

const props = defineProps<{ id: string }>()

const { data: creature, isPending, error, refetch } = useCreature(() => props.id)
const { data: rarities } = useRarities()
const { data: collection } = useCollection({ pageSize: 100 })

const quantity = computed(
  () => collection.value?.items.find((e) => e.creature.id === props.id)?.quantity ?? 0,
)
const rarity = computed(() => rarities.value?.find((r) => r.code === creature.value?.rarity.code))
const isEgg = computed(() => creature.value?.imageUrl.startsWith('data:') ?? false)
</script>

<template>
  <section>
    <RouterLink to="/catalogue" class="mb-4 inline-flex min-h-10 items-center gap-2 font-semibold">
      <PixelIcon name="arrow-left" :size="18" /> Retour au catalogue
    </RouterLink>

    <AsyncState :loading="isPending" :error="error" @retry="refetch()">
      <article
        v-if="creature"
        class="card-pixel rarity-frame relative grid bg-white md:grid-cols-2"
        :data-rarity="creature.rarity.code"
      >
        <div
          class="card-window relative flex items-center justify-center border-b-2 border-ink p-8 md:border-r-2 md:border-b-0"
          :style="{ backgroundColor: familyTint(creature.family.code) }"
        >
          <span class="card-ground !bottom-[12%] !h-3 !w-2/5" aria-hidden="true" />
          <img
            :src="creature.imageUrl"
            :alt="`Illustration de ${creature.name}`"
            class="pixelated relative w-48 animate-float sm:w-64"
            :class="isEgg ? 'p-6' : ''"
          />
        </div>
        <div class="flex flex-col gap-4 p-5 sm:p-8">
          <div>
            <p class="eyebrow">{{ creature.family.label }}</p>
            <h1 class="mt-1 text-4xl font-bold sm:text-5xl">{{ creature.name }}</h1>
          </div>
          <p class="text-lg">{{ creature.description }}</p>
          <p v-if="isEgg" class="text-sm text-ink/70">Illustration à venir.</p>

          <dl class="grid grid-cols-2 gap-3">
            <div class="border-2 border-ink bg-cream p-3">
              <dt class="text-xs font-bold tracking-wider uppercase">Rareté</dt>
              <dd class="mt-1 flex items-center gap-2 font-semibold">
                {{ creature.rarity.label }}
                <RarityGems :code="creature.rarity.code" :label="creature.rarity.label" />
              </dd>
              <dd v-if="rarity" class="text-sm">
                Tirage : {{ formatPercent(rarity.dropRate * 100) }}
              </dd>
            </div>
            <div class="border-2 border-ink p-3" :class="quantity ? 'bg-mint' : 'hatched'">
              <dt class="text-xs font-bold tracking-wider uppercase">Ma collection</dt>
              <dd class="mt-1 font-semibold">
                {{ quantity ? `Possédées : ${quantity}` : 'Non possédée' }}
              </dd>
            </div>
          </dl>

          <div class="mt-auto flex flex-wrap gap-3">
            <RouterLink v-if="!quantity" to="/booster" class="btn btn-primary">
              <PixelIcon name="booster" :size="18" /> Tenter ma chance
            </RouterLink>
          </div>
        </div>
      </article>

      <!-- Joueurs qui possèdent cette carte : on peut ouvrir un échange avec chacun -->
      <section v-if="creature" class="mt-8 max-w-2xl" aria-labelledby="owners-title">
        <h2 id="owners-title" class="mb-3 text-2xl font-bold">
          {{ quantity ? 'Les autres joueurs qui l’ont' : 'Les joueurs qui l’ont' }}
        </h2>
        <CreatureOwners :creature-id="creature.id" :creature-name="creature.name" />
      </section>
    </AsyncState>
  </section>
</template>
