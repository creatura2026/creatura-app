<script setup lang="ts">
/**
 * Section de la page d'accueil : télécharger l'application Windows.
 *
 * L'illustration est une fenêtre Créatura posée au-dessus d'une barre des tâches. Quand la section
 * entre à l'écran, la fenêtre s'ouvre une fois depuis son icône, comme au lancement de l'exe.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import CreatureCard from '@creatura/shared/ui/CreatureCard.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import boosterUrl from '@creatura/shared/assets/booster.png'
import { CREATURES } from '@creatura/shared/fixtures/catalog'

import type { DesktopRelease } from '@/composables/useDesktopDownload'

/** Version publiée, lue dans latest.json (voir useDesktopDownload). */
defineProps<{ release: DesktopRelease }>()

const byName = (name: string) => CREATURES.find((c) => c.name === name)!
const left = byName('Moussou')
const right = byName('Flammille')

const scene = ref<HTMLElement | null>(null)
const opened = ref(false)
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    opened.value = true
    return
  }
  observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return
      opened.value = true
      observer?.disconnect()
    },
    { threshold: 0.45 },
  )
  if (scene.value) observer.observe(scene.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <section
    id="application-windows"
    class="scroll-mt-4 border-y-2 border-ink bg-butter"
    aria-labelledby="desktop-title"
  >
    <div
      class="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14"
    >
      <!-- Illustration : la fenêtre de l'application et sa barre des tâches -->
      <div ref="scene" class="desk-scene mx-auto w-full max-w-md" :class="{ 'is-open': opened }">
        <div class="desk-window card-pixel overflow-hidden bg-white" aria-hidden="true">
          <div class="flex items-center justify-between gap-3 bg-ink px-3 py-2 text-cream">
            <span class="font-pixel text-sm font-bold tracking-wide">
              Créatura <span class="font-normal text-cream/60">{{ release.version }}</span>
            </span>
            <span class="flex gap-1.5">
              <span class="size-3 border-2 border-cream/80" />
              <span class="size-3 border-2 border-cream/80" />
              <span class="size-3 border-2 border-cream bg-brick" />
            </span>
          </div>
          <div
            class="desk-body relative grid h-56 place-items-center overflow-hidden bg-sky sm:h-64"
          >
            <div class="desk-card desk-card-left absolute w-24 sm:w-28">
              <CreatureCard :creature="left" class="!shadow-pixel-xs" />
            </div>
            <div class="desk-card desk-card-right absolute w-24 sm:w-28">
              <CreatureCard :creature="right" class="!shadow-pixel-xs" />
            </div>
            <img :src="boosterUrl" alt="" class="desk-booster pixelated relative w-24 sm:w-28" />
          </div>
        </div>
        <div
          class="desk-taskbar mt-4 flex items-center gap-2 border-2 border-ink bg-ink px-2 py-1.5"
        >
          <span class="size-6 border-2 border-cream/40" aria-hidden="true" />
          <span
            class="desk-launcher grid size-8 place-items-center border-2 border-ink bg-sun"
            aria-hidden="true"
          >
            <PixelIcon name="booster" :size="16" />
          </span>
          <span class="size-6 border-2 border-cream/40" aria-hidden="true" />
        </div>
      </div>

      <div class="max-w-xl">
        <h2 id="desktop-title" class="text-3xl font-bold sm:text-4xl">
          Créatura sur votre ordinateur
        </h2>
        <p class="mt-4 text-lg leading-relaxed">
          Votre collection dans sa propre fenêtre, lancée depuis le menu Démarrer. Même compte,
          mêmes cartes que sur le site.
        </p>

        <div class="mt-7 flex flex-col items-start gap-3">
          <a :href="release.setup.url" download class="btn btn-primary text-lg">
            <PixelIcon name="download" :size="20" />
            Télécharger la version {{ release.version }}
          </a>
          <p class="text-sm">
            Pour Windows 10 et 11, {{ release.setup.size
            }}<template v-if="release.date">, publiée le {{ release.date }}</template
            >.
            <a
              v-if="release.portable"
              :href="release.portable.url"
              download
              class="font-semibold underline underline-offset-2"
            >
              Version portable, sans installation ({{ release.portable.size }})
            </a>
          </p>
        </div>

        <p class="mt-6 border-l-4 border-ink pl-3 text-sm text-ink/80">
          Au premier lancement, Windows peut demander une confirmation : choisissez « Informations
          complémentaires », puis « Exécuter quand même ».
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Cartes posées de part et d'autre du booster, légèrement tournées. */
.desk-card-left {
  rotate: -9deg;
  translate: -78% 6%;
}
.desk-card-right {
  rotate: 8deg;
  translate: 78% 6%;
}

/*
 * Ouverture : la fenêtre part de l'icône de la barre des tâches et s'agrandit, puis le booster
 * et les cartes se posent. Sans JavaScript ni IntersectionObserver, tout est visible d'emblée.
 */
.desk-window {
  transform-origin: 50% 115%;
}
.desk-scene:not(.is-open) .desk-window {
  opacity: 0;
  scale: 0.18;
}
.desk-scene:not(.is-open) .desk-card,
.desk-scene:not(.is-open) .desk-booster {
  opacity: 0;
}
.desk-scene.is-open .desk-window {
  animation: window-open 520ms cubic-bezier(0.2, 0.9, 0.25, 1.05) both;
}
.desk-scene.is-open .desk-booster {
  animation: drop-in 420ms 380ms cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
}
.desk-scene.is-open .desk-card-left {
  animation: slide-left 420ms 520ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both;
}
.desk-scene.is-open .desk-card-right {
  animation: slide-right 420ms 600ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both;
}
.desk-scene.is-open .desk-launcher {
  animation: launcher-press 520ms ease-out both;
}

@keyframes window-open {
  from {
    opacity: 0;
    scale: 0.18;
  }
  35% {
    opacity: 1;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}
@keyframes drop-in {
  from {
    opacity: 0;
    translate: 0 -30%;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}
@keyframes slide-left {
  from {
    opacity: 0;
    rotate: 0deg;
    translate: 0 6%;
  }
  to {
    opacity: 1;
    rotate: -9deg;
    translate: -78% 6%;
  }
}
@keyframes slide-right {
  from {
    opacity: 0;
    rotate: 0deg;
    translate: 0 6%;
  }
  to {
    opacity: 1;
    rotate: 8deg;
    translate: 78% 6%;
  }
}
/* L'icône s'enfonce, comme cliquée, au moment où la fenêtre s'ouvre. */
@keyframes launcher-press {
  0%,
  100% {
    translate: 0 0;
  }
  25% {
    translate: 0 2px;
    background-color: var(--color-cream);
  }
}

@media (prefers-reduced-motion: reduce) {
  .desk-scene .desk-window,
  .desk-scene .desk-card,
  .desk-scene .desk-booster,
  .desk-scene .desk-launcher {
    animation: none !important;
    opacity: 1 !important;
    scale: 1 !important;
  }
}
</style>
