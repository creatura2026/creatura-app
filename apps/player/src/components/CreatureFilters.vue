<script setup lang="ts">
/** Recherche + filtres famille / rareté (UC-05, UC-07). */
import { useId } from 'vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'

import { useFamilies, useRarities } from '@/api/queries'

const search = defineModel<string>('search', { default: '' })
const family = defineModel<string>('family', { default: '' })
const rarity = defineModel<string>('rarity', { default: '' })

defineProps<{ title?: string }>()

const { data: families } = useFamilies()
const { data: rarities } = useRarities()
const id = useId()
</script>

<template>
  <div class="card-pixel-sm bg-white">
    <!-- Barre bleue « MA COLLECTION | Rechercher… » du document -->
    <div
      class="flex flex-col gap-2 bg-blue px-3 py-2.5 text-white sm:flex-row sm:items-center sm:gap-3"
    >
      <p v-if="title" class="shrink-0 text-sm font-bold tracking-wide uppercase">{{ title }}</p>
      <span v-if="title" class="hidden h-5 w-0.5 bg-white/70 sm:block" aria-hidden="true" />
      <label :for="`${id}-search`" class="sr-only">Rechercher une créature</label>
      <div class="relative flex-1">
        <PixelIcon
          name="search"
          :size="18"
          class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
        />
        <input
          :id="`${id}-search`"
          v-model="search"
          type="search"
          placeholder="Rechercher…"
          class="block min-h-10 w-full border-2 border-white/80 bg-white/15 py-1.5 pr-3 pl-9 font-semibold text-white placeholder:text-white/80 focus:bg-white focus:text-ink focus:placeholder:text-ink/50"
          autocomplete="off"
        />
      </div>
    </div>

    <div class="flex flex-wrap items-end gap-3 px-3 py-3">
      <div class="min-w-0 flex-1 basis-36">
        <label :for="`${id}-family`" class="field-label !text-xs">Famille</label>
        <select :id="`${id}-family`" v-model="family" class="field-input !min-h-10 !py-1.5 text-sm">
          <option value="">Toutes</option>
          <option v-for="f in families" :key="f.code" :value="f.code">{{ f.label }}</option>
        </select>
      </div>
      <div class="min-w-0 flex-1 basis-36">
        <label :for="`${id}-rarity`" class="field-label !text-xs">Rareté</label>
        <select :id="`${id}-rarity`" v-model="rarity" class="field-input !min-h-10 !py-1.5 text-sm">
          <option value="">Toutes</option>
          <option v-for="r in rarities" :key="r.code" :value="r.code">{{ r.label }}</option>
        </select>
      </div>
      <slot />
    </div>
  </div>
</template>
