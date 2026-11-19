<script setup lang="ts">
/** Mentions légales du site (page publique). */
import { computed } from 'vue'
import LegalNotice from '@creatura/shared/ui/LegalNotice.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const backTo = computed(() => (auth.isAuthenticated ? '/accueil' : '/'))
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-8">
    <RouterLink :to="backTo" class="btn btn-secondary mb-6">&larr; Retour</RouterLink>
    <LegalNotice />
  </div>
</template>
