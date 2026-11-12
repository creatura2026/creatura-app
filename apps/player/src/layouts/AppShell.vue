<script setup lang="ts">
import { computed } from 'vue'
import BrandMark from '@creatura/shared/ui/BrandMark.vue'
import PixelIcon, { type IconName } from '@creatura/shared/ui/PixelIcon.vue'

import { useMe, useOpenTrades } from '@/api/queries'
import { awaitsMe } from '@/composables/tradeSeats'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { data: me } = useMe()
const { data: open } = useOpenTrades()

/** Échanges qui attendent une action du joueur. */
const pendingCount = computed(
  () => (open.value?.items ?? []).filter((t) => awaitsMe(t, auth.user?.id ?? '')).length,
)

const NAV: { to: string; label: string; short: string; icon: IconName }[] = [
  { to: '/accueil', label: 'Accueil', short: 'Accueil', icon: 'home' },
  { to: '/booster', label: 'Booster', short: 'Booster', icon: 'booster' },
  { to: '/collection', label: 'Ma collection', short: 'Collection', icon: 'collection' },
  { to: '/catalogue', label: 'Catalogue', short: 'Catalogue', icon: 'catalogue' },
  { to: '/echanges', label: 'Échanges', short: 'Échanges', icon: 'trade' },
]

const pseudo = computed(() => me.value?.pseudo ?? auth.user?.pseudo ?? '')
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <a
      href="#contenu"
      class="sr-only z-50 bg-sun px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      Aller au contenu
    </a>

    <!-- En-tête : marque + navigation (bureau) + profil -->
    <header class="sticky top-0 z-30 border-b-2 border-ink bg-ink text-cream">
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:h-16">
        <RouterLink to="/accueil" class="shrink-0" aria-label="Créatura, accueil">
          <BrandMark tone="light" />
        </RouterLink>

        <nav
          class="ml-4 hidden flex-1 items-center gap-1 md:flex"
          aria-label="Navigation principale"
        >
          <RouterLink
            v-for="item in NAV"
            :key="item.to"
            :to="item.to"
            class="relative flex min-h-10 items-center gap-2 border-2 border-transparent px-3 text-sm font-semibold hover:border-cream/40"
            active-class="!border-cream bg-cream/10"
          >
            <PixelIcon :name="item.icon" :size="18" />
            {{ item.label }}
            <span
              v-if="item.to === '/echanges' && pendingCount"
              class="ml-0.5 min-w-5 border-2 border-ink bg-sun px-1 text-center text-xs leading-4 font-bold text-ink"
              :aria-label="`${pendingCount} échange(s) à votre tour`"
            >
              {{ pendingCount }}
            </span>
          </RouterLink>
        </nav>

        <RouterLink
          to="/profil"
          class="ml-auto flex min-h-10 items-center gap-2 border-2 border-cream/40 px-2.5 text-sm font-semibold hover:border-cream sm:px-3"
          active-class="!border-cream bg-cream/10"
          aria-label="Mon profil"
        >
          <PixelIcon name="user" :size="18" />
          <span class="max-w-28 truncate sm:max-w-40">{{ pseudo }}</span>
        </RouterLink>
      </div>
    </header>

    <main id="contenu" class="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 sm:pt-8 md:pb-12">
      <RouterView v-slot="{ Component }">
        <Transition
          mode="out-in"
          enter-from-class="opacity-0 translate-y-1"
          enter-active-class="transition duration-150"
          leave-to-class="opacity-0"
          leave-active-class="transition duration-100"
        >
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <footer class="hidden border-t-2 border-ink/10 py-5 md:block">
      <p class="mx-auto max-w-6xl px-4 font-pixel text-xs text-ink/70">
        CREATURA — Projet d’intégration DLTQ 2026 · Données fictives (API simulée)
      </p>
    </footer>

    <!-- Barre d'onglets mobile : actions accessibles au pouce -->
    <nav
      data-bottom-nav
      class="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-cream pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Navigation principale"
    >
      <ul class="grid grid-cols-5">
        <li v-for="item in NAV" :key="item.to">
          <RouterLink
            :to="item.to"
            class="relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[0.7rem] font-semibold"
            active-class="bg-ink text-cream"
          >
            <PixelIcon :name="item.icon" :size="22" />
            <span class="truncate">{{ item.short }}</span>
            <span
              v-if="item.to === '/echanges' && pendingCount"
              class="absolute top-1.5 right-[calc(50%-1.4rem)] min-w-5 border-2 border-ink bg-sun px-1 text-center text-[0.65rem] leading-4 font-bold text-ink"
              :aria-label="`${pendingCount} échange(s) à votre tour`"
            >
              {{ pendingCount }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
