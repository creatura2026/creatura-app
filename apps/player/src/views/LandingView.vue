<script setup lang="ts">
import BrandMark from '@creatura/shared/ui/BrandMark.vue'
import CreatureCard from '@creatura/shared/ui/CreatureCard.vue'
import boosterUrl from '@creatura/shared/assets/booster.png'
import { CREATURES } from '@creatura/shared/fixtures/catalog'

const showcase = ['Moussou', 'Cristille', 'Flammille'].map((n) =>
  CREATURES.find((c) => c.name === n)!,
)

const PILLARS = [
  {
    n: '01',
    title: 'Découvrir',
    text: 'Explorer le catalogue et ouvrir un booster chaque jour.',
    bg: 'bg-mint',
  },
  {
    n: '02',
    title: 'Collectionner',
    text: 'Retrouver les cartes obtenues et repérer les manques.',
    bg: 'bg-butter',
  },
  { n: '03', title: 'Échanger', text: 'Proposer un échange à un autre joueur.', bg: 'bg-salmon' },
]

const LOOP = [
  { n: 1, title: 'Ouvrir', text: 'Booster quotidien', bg: 'bg-butter' },
  { n: 2, title: 'Recevoir', text: 'Cartes ajoutées', bg: 'bg-mint' },
  { n: 3, title: 'Repérer', text: 'Manques et doublons', bg: 'bg-sky' },
  { n: 4, title: 'Proposer', text: 'Un échange', bg: 'bg-salmon' },
]
</script>

<template>
  <div class="min-h-dvh">
    <!-- Héros sombre, comme la couverture du document -->
    <section class="bg-ink text-cream">
      <div class="mx-auto max-w-6xl px-4 pt-5 pb-14 sm:pb-20">
        <nav class="flex items-center justify-between gap-3" aria-label="Accès au compte">
          <BrandMark tone="light" />
          <RouterLink to="/connexion" class="btn btn-dark min-h-10 px-3 text-sm"
            >Se connecter</RouterLink
          >
        </nav>

        <div class="mt-10 grid items-center gap-10 sm:mt-14 lg:grid-cols-[1fr_auto]">
          <div>
            <p class="eyebrow !text-sun">Vision</p>
            <h1 class="mt-3 text-5xl leading-none font-bold tracking-wide sm:text-7xl">CREATURA</h1>
            <p class="mt-5 max-w-xl text-xl leading-snug sm:text-2xl">
              Une plateforme de collection et d’échange de cartes de créatures
            </p>
            <p class="mt-3 text-lg">Découvrez. Collectionnez. Échangez.</p>
            <div class="mt-8 flex flex-col gap-3 sm:flex-row">
              <RouterLink to="/inscription" class="btn btn-primary text-lg"
                >Créer un compte</RouterLink
              >
              <RouterLink to="/connexion" class="btn btn-dark text-lg"
                >J’ai déjà un compte</RouterLink
              >
            </div>
          </div>
          <img
            :src="boosterUrl"
            alt="Un booster de cartes Créatura"
            class="pixelated mx-auto hidden w-[150px] animate-float lg:block xl:w-[225px]"
          />
        </div>

        <ul class="mt-12 grid grid-cols-3 gap-2 sm:gap-4 md:max-w-3xl">
          <li v-for="c in showcase" :key="c.id">
            <CreatureCard :creature="c" class="!shadow-none sm:!shadow-pixel-sm" />
          </li>
        </ul>
      </div>
    </section>

    <!-- Notre ambition -->
    <section class="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <p class="eyebrow">Notre ambition</p>
      <h2 class="mt-2 text-3xl font-bold sm:text-4xl">Trois verbes, une aventure</h2>
      <ul class="mt-6 grid gap-5 md:grid-cols-3">
        <li v-for="p in PILLARS" :key="p.n" class="card-pixel p-5" :class="p.bg">
          <h3 class="font-sans text-lg font-bold">{{ p.n }} · {{ p.title }}</h3>
          <p class="mt-2">{{ p.text }}</p>
        </li>
      </ul>

      <h2 class="mt-14 text-3xl font-bold sm:text-4xl">Une boucle de collection</h2>
      <ol class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <li v-for="step in LOOP" :key="step.n" class="card-pixel-sm relative p-4" :class="step.bg">
          <p class="font-bold">{{ step.n }} · {{ step.title }}</p>
          <p>{{ step.text }}</p>
        </li>
      </ol>
      <p class="mt-3 text-sm font-medium text-blue">↻ Et retour au prochain booster, demain.</p>

      <p class="banner mt-10">
        Périmètre : aucun combat, aucun achat en argent réel. Juste le plaisir de collectionner.
      </p>
    </section>

    <footer class="border-t-2 border-ink/10 py-6">
      <p class="mx-auto max-w-6xl px-4 font-pixel text-xs text-ink/70">
        CREATURA — Projet d’intégration DLTQ 2026
      </p>
    </footer>
  </div>
</template>
