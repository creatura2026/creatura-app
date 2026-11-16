<script setup lang="ts">
/** Les joueurs qui possèdent une créature, avec de quoi ouvrir un échange avec chacun. */
import { ref } from 'vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'

import { useCreatureOwners } from '@/api/queries'
import { useOpenTrade } from '@/composables/useOpenTrade'

const props = defineProps<{ creatureId: string; creatureName: string }>()

const { data, isPending, error, refetch } = useCreatureOwners(() => props.creatureId)
const open = useOpenTrade()
const opening = ref<string | null>(null)

async function trade(playerId: string) {
  opening.value = playerId
  try {
    await open(playerId, props.creatureId)
  } finally {
    opening.value = null
  }
}
</script>

<template>
  <AsyncState :loading="isPending" :error="error" @retry="refetch()">
    <ul v-if="data?.items.length" class="flex flex-col gap-2">
      <li
        v-for="owner in data.items"
        :key="owner.player.id"
        class="flex items-center justify-between gap-3 border-2 border-ink bg-white px-3 py-2"
      >
        <span class="flex min-w-0 items-center gap-2">
          <PixelIcon name="user" :size="18" class="shrink-0" />
          <span class="truncate font-semibold">{{ owner.player.pseudo }}</span>
          <span class="shrink-0 text-sm text-ink/75">× {{ owner.quantity }}</span>
        </span>
        <button
          type="button"
          class="btn btn-primary !min-h-10 shrink-0 !px-3 text-sm"
          :disabled="!!opening"
          :aria-label="`Échanger avec ${owner.player.pseudo} pour obtenir ${creatureName}`"
          @click="trade(owner.player.id)"
        >
          <PixelIcon name="trade" :size="16" />
          {{ opening === owner.player.id ? 'Ouverture…' : 'Échanger' }}
        </button>
      </li>
    </ul>
    <p v-else class="border-2 border-dashed border-ink/40 px-3 py-4 text-sm">
      Aucun autre joueur ne possède {{ creatureName }} pour l’instant.
    </p>
  </AsyncState>
</template>
