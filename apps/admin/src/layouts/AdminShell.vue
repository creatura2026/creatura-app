<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import BrandMark from '@creatura/shared/ui/BrandMark.vue'
import PixelIcon, { type IconName } from '@creatura/shared/ui/PixelIcon.vue'

import { USE_MOCK_API } from '@/api'
import { useAuthStore } from '@/stores/auth'

const NAV: { name: string; label: string; uc: string; icon: IconName }[] = [
  { name: 'dashboard', label: 'Statistiques', uc: 'UC-12', icon: 'chart' },
  { name: 'trades', label: 'Échanges', uc: 'UC-13', icon: 'trade' },
  { name: 'rarities', label: 'Raretés', uc: 'UC-14', icon: 'gem' },
  { name: 'settings', label: 'Réglages booster', uc: '', icon: 'booster' },
]

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const menuOpen = ref(false)

watch(
  () => route.fullPath,
  () => (menuOpen.value = false),
)

async function logout() {
  await auth.logout()
  queryClient.clear()
  await router.replace({ name: 'login' })
}

/** Conserve la période choisie d'un écran à l'autre. */
const linkTo = (name: string) => ({ name, query: { du: route.query.du, au: route.query.au } })
</script>

<template>
  <div
    class="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:bg-[linear-gradient(to_right,var(--color-ink)_16rem,transparent_16rem)]"
  >
    <!-- Barre du haut (mobile / tablette) -->
    <header
      class="sticky top-0 z-30 flex h-14 items-center justify-between border-b-2 border-ink bg-ink px-4 text-cream lg:hidden"
    >
      <BrandMark tone="light" suffix="Admin" />
      <button
        type="button"
        class="flex size-11 cursor-pointer items-center justify-center border-2 border-cream/50"
        :aria-expanded="menuOpen"
        aria-controls="admin-nav"
        :aria-label="menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'"
        @click="menuOpen = !menuOpen"
      >
        <PixelIcon :name="menuOpen ? 'close' : 'menu'" />
      </button>
    </header>

    <div
      v-if="menuOpen"
      class="fixed inset-0 z-30 bg-ink/50 lg:hidden"
      aria-hidden="true"
      @click="menuOpen = false"
    />

    <!-- Navigation latérale -->
    <aside
      id="admin-nav"
      class="fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col bg-ink text-cream transition-transform lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:max-w-none lg:translate-x-0"
      :class="menuOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex h-14 items-center px-5 lg:h-20">
        <BrandMark tone="light" suffix="Admin" />
      </div>
      <nav class="flex flex-1 flex-col gap-1.5 px-3 py-4" aria-label="Navigation du dashboard">
        <p class="px-2 pb-2 font-pixel text-xs tracking-widest text-sun uppercase">
          Administration · consultation
        </p>
        <RouterLink
          v-for="item in NAV"
          :key="item.name"
          :to="linkTo(item.name)"
          class="flex min-h-12 items-center gap-3 border-2 border-transparent px-3 font-semibold hover:border-cream/40"
          exact-active-class="!border-cream bg-cream text-ink"
        >
          <PixelIcon :name="item.icon" :size="20" />
          <span class="flex-1">{{ item.label }}</span>
          <span class="text-xs opacity-70">{{ item.uc }}</span>
        </RouterLink>
      </nav>
      <div class="border-t-2 border-cream/20 p-4">
        <p class="flex items-center gap-2 text-sm">
          <PixelIcon name="user" :size="18" />
          <span class="truncate font-semibold">{{ auth.user?.pseudo }}</span>
          <span class="ml-auto border border-sun px-1.5 text-xs text-sun">ADMIN</span>
        </p>
        <button type="button" class="btn btn-dark mt-3 w-full" @click="logout">
          <PixelIcon name="logout" :size="18" /> Se déconnecter
        </button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-col">
      <!-- Bandeau bleu du document : « ADMINISTRATION · CONSULTATION — DONNÉES FICTIVES » -->
      <div
        class="flex items-center justify-between gap-3 bg-blue px-4 py-2 text-xs font-bold tracking-wide text-white uppercase sm:px-8"
      >
        <span>Administration<span class="hidden sm:inline"> · consultation</span></span>
        <span v-if="USE_MOCK_API" class="border-2 border-white px-1.5 py-0.5"
          >Données fictives</span
        >
      </div>
      <main id="contenu" class="w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>
