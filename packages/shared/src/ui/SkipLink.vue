<script setup lang="ts">
/**
 * Lien d'évitement « Aller au contenu » (RGAA 12.7) : premier élément focusable de la page,
 * visible seulement au focus. La zone principale porte `id="contenu"` (balise `main`).
 */
withDefaults(defineProps<{ target?: string }>(), { target: 'contenu' })
</script>

<template>
  <a
    :href="`#${target}`"
    class="sr-only z-50 bg-sun px-4 py-2 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
  >
    Aller au contenu
  </a>
</template>
