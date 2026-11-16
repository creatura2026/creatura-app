<script setup lang="ts">
import BrandMark from '@creatura/shared/ui/BrandMark.vue'
import { CREATURES } from '@creatura/shared/fixtures/catalog'

const props = defineProps<{
  eyebrow: string
  title: string
  creature?: string
  tone?: 'sky' | 'mint'
}>()
const art = CREATURES.find((c) => c.name === (props.creature ?? 'Moussou'))!
</script>

<template>
  <div class="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
    <!-- Colonne illustrée (grand écran) -->
    <aside class="relative hidden flex-col justify-between bg-ink p-10 text-cream lg:flex">
      <RouterLink to="/" aria-label="Retour à l’accueil"><BrandMark tone="light" /></RouterLink>
      <img
        :src="art.imageUrl"
        alt=""
        class="pixelated mx-auto w-72 animate-float"
        aria-hidden="true"
      />
      <p class="font-pixel text-sm text-cream/80">
        « Nous avons l’idée. À vous de construire l’aventure. »
      </p>
    </aside>

    <div class="flex flex-col px-4 py-5 sm:px-8">
      <RouterLink to="/" class="self-start lg:hidden" aria-label="Retour à l’accueil">
        <BrandMark />
      </RouterLink>
      <div class="mx-auto my-auto w-full max-w-md py-8">
        <p class="eyebrow">{{ eyebrow }}</p>
        <h1 class="mt-2 mb-6 text-3xl font-bold sm:text-4xl">{{ title }}</h1>
        <div class="card-pixel p-5 sm:p-6" :class="tone === 'mint' ? 'bg-mint' : 'bg-sky'">
          <slot />
        </div>
        <div class="mt-6 text-center text-sm">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </div>
</template>
