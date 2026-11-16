<script setup lang="ts">
/**
 * Section de la page d'accueil : télécharger l'application Android (APK).
 *
 * L'illustration est un téléphone dont l'écran affiche un booster. Quand la section entre à
 * l'écran, le booster s'ouvre une fois et une carte en sort.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import CreatureCard from '@creatura/shared/ui/CreatureCard.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import boosterUrl from '@creatura/shared/assets/booster.png'
import { CREATURES } from '@creatura/shared/fixtures/catalog'

import type { AndroidRelease } from '@/composables/useAndroidDownload'

/** Version publiée, lue dans android.json ; `null` tant qu'aucun APK n'est en ligne. */
defineProps<{ release: AndroidRelease | null }>()

const card = CREATURES.find((c) => c.name === 'Cristille')!

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
    id="application-android"
    class="scroll-mt-4 border-b-2 border-ink bg-mint"
    aria-labelledby="android-title"
  >
    <div
      class="mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14"
    >
      <div class="max-w-xl lg:order-1">
        <h2 id="android-title" class="text-3xl font-bold sm:text-4xl">Créatura dans votre poche</h2>
        <p class="mt-4 text-lg leading-relaxed">
          Ouvrez votre booster du jour et répondez aux échanges depuis votre téléphone. Même compte,
          mêmes cartes que sur le site.
        </p>

        <div v-if="!release" class="mt-7 flex flex-col items-start gap-3">
          <span
            class="btn pointer-events-none bg-white/60 text-lg text-ink/70"
            aria-disabled="true"
          >
            <PixelIcon name="clock" :size="20" />
            Bientôt disponible
          </span>
          <p class="text-sm">L’application Android arrive prochainement.</p>
        </div>

        <div v-else class="mt-7 flex flex-col items-start gap-3">
          <a :href="release.apk.url" download class="btn btn-primary text-lg">
            <PixelIcon name="download" :size="20" />
            Télécharger pour Android
          </a>
          <p class="text-sm">
            Version {{ release.version }}, {{ release.apk.size
            }}<template v-if="release.minAndroid"
              >, Android {{ release.minAndroid }} ou plus récent</template
            ><template v-if="release.date">, publiée le {{ release.date }}</template
            >.
          </p>
        </div>

        <ol v-if="release" class="mt-6 space-y-1.5 border-l-4 border-ink pl-3 text-sm text-ink/80">
          <li>
            1. Ouvrez le fichier téléchargé depuis les notifications ou le dossier Téléchargements.
          </li>
          <li>
            2. Si Android le demande, autorisez votre navigateur à installer des applications
            inconnues.
          </li>
          <li>3. Touchez « Installer », puis ouvrez Créatura.</li>
        </ol>
      </div>

      <!-- Illustration : un téléphone avec le booster à l'écran -->
      <div
        ref="scene"
        class="phone-scene mx-auto w-full max-w-[10.5rem] lg:order-2"
        :class="{ 'is-open': opened }"
        aria-hidden="true"
      >
        <div class="phone border-4 border-ink bg-ink p-2 shadow-pixel">
          <div class="flex items-center justify-between px-2 pb-1.5 text-cream">
            <span class="font-pixel text-[9px]">Créatura</span>
            <span class="flex items-end gap-0.5">
              <span class="h-1.5 w-1 bg-cream/80" />
              <span class="h-2 w-1 bg-cream/80" />
              <span class="h-2.5 w-1 bg-cream/80" />
              <span class="ml-1 h-2 w-3.5 border border-cream/80 p-px"
                ><span class="block h-full w-2/3 bg-leaf"
              /></span>
            </span>
          </div>
          <div
            class="phone-screen relative grid aspect-[9/16] place-items-center overflow-hidden bg-sky"
          >
            <div class="phone-card absolute w-20">
              <CreatureCard :creature="card" class="!shadow-pixel-xs" />
            </div>
            <img :src="boosterUrl" alt="" class="phone-booster pixelated relative w-20" />
          </div>
          <div class="mx-auto mt-2 h-1.5 w-12 bg-cream/40" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/*
 * Ouverture : le téléphone se redresse, le booster s'efface vers le bas et la carte monte.
 * Sans JavaScript ni IntersectionObserver, l'état final est visible d'emblée.
 */
.phone {
  rotate: 4deg;
}
.phone-card {
  translate: 0 -30%;
}
.phone-booster {
  translate: 0 78%;
  scale: 0.72;
}
.phone-scene:not(.is-open) .phone {
  opacity: 0;
}
.phone-scene:not(.is-open) .phone-card {
  opacity: 0;
}
.phone-scene.is-open .phone {
  animation: phone-in 480ms cubic-bezier(0.2, 0.9, 0.25, 1.05) both;
}
.phone-scene.is-open .phone-booster {
  animation: booster-open 520ms 420ms cubic-bezier(0.3, 0.8, 0.3, 1) both;
}
.phone-scene.is-open .phone-card {
  animation: card-out 480ms 640ms cubic-bezier(0.2, 0.9, 0.3, 1.25) both;
}

@keyframes phone-in {
  from {
    opacity: 0;
    rotate: -6deg;
    translate: 0 12%;
  }
  to {
    opacity: 1;
    rotate: 4deg;
    translate: 0 0;
  }
}
@keyframes booster-open {
  from {
    translate: 0 0;
    scale: 1;
  }
  30% {
    translate: 0 -4%;
    scale: 1.06;
  }
  to {
    translate: 0 78%;
    scale: 0.72;
  }
}
@keyframes card-out {
  from {
    opacity: 0;
    translate: 0 50%;
    scale: 0.7;
  }
  to {
    opacity: 1;
    translate: 0 -30%;
    scale: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .phone-scene .phone,
  .phone-scene .phone-card,
  .phone-scene .phone-booster {
    animation: none !important;
    opacity: 1 !important;
  }
}
</style>
