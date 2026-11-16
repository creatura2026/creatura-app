<script setup lang="ts">
import { CREATURES } from '@creatura/shared/fixtures/catalog'

const brumel = CREATURES.find((c) => c.name === 'Brumel')!
</script>

<template>
  <main
    class="flex min-h-dvh flex-col items-center justify-center gap-5 bg-ink px-4 text-center text-cream"
  >
    <img :src="brumel.imageUrl" alt="" class="pixelated w-40 animate-float" aria-hidden="true" />
    <p class="eyebrow !text-sun">Erreur 404</p>
    <h1 class="text-4xl font-bold">Perdu dans la brume</h1>
    <p class="max-w-sm">Cette page n’existe pas, ou s’est envolée avec les nuages.</p>
    <RouterLink to="/" class="btn btn-primary">Retour à l’accueil</RouterLink>
  </main>
</template>
