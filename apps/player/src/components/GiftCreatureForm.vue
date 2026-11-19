<script setup lang="ts">
/**
 * Offrir une carte possédée à un autre joueur (don, à accepter par le destinataire).
 * Le donneur choisit le joueur (recherche par pseudo) et le nombre d'exemplaires.
 */
import { computed, ref } from 'vue'
import type { PlayerSummary } from '@creatura/shared/api/types'
import { errorMessage } from '@creatura/shared/api/types'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import { toast } from '@creatura/shared/toast'
import { useDebounced } from '@creatura/shared/composables'

import { useCreateGift, useSearchPlayers } from '@/api/queries'

const props = defineProps<{ creatureId: string; creatureName: string; owned: number }>()

const search = ref('')
const debounced = useDebounced(search)
const players = useSearchPlayers(debounced)
const recipient = ref<PlayerSummary | null>(null)
const quantity = ref(1)
const create = useCreateGift()

const max = computed(() => Math.min(props.owned, 10))

async function send() {
  if (!recipient.value) return
  try {
    await create.mutateAsync({
      recipientId: recipient.value.id,
      creatureId: props.creatureId,
      quantity: quantity.value,
    })
    toast(
      `${quantity.value} ${props.creatureName} offerte(s) à ${recipient.value.pseudo}. En attente de sa réponse.`,
      'success',
    )
    recipient.value = null
    search.value = ''
    quantity.value = 1
  } catch (e) {
    toast(errorMessage(e), 'error')
  }
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="send">
    <p class="text-sm">
      Vous en possédez <strong>{{ owned }}</strong
      >. Choisissez à qui offrir {{ creatureName }} ; le joueur devra accepter le don.
    </p>

    <div>
      <label for="gift-recipient" class="field-label">Pseudonyme du joueur</label>
      <div class="relative">
        <PixelIcon
          name="search"
          :size="18"
          class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <input
          id="gift-recipient"
          v-model="search"
          type="search"
          class="field-input pl-10"
          placeholder="Au moins 2 lettres"
          autocomplete="off"
        />
      </div>

      <p v-if="recipient" class="mt-2 flex items-center gap-2 text-sm font-semibold">
        <PixelIcon name="user" :size="16" /> Pour {{ recipient.pseudo }}
        <button type="button" class="underline" @click="recipient = null">changer</button>
      </p>
      <div v-else-if="debounced.trim().length >= 2" class="mt-2">
        <AsyncState
          :loading="players.isPending.value"
          :error="players.error.value"
          @retry="players.refetch()"
        >
          <ul v-if="players.data.value?.items.length" class="flex flex-col gap-2">
            <li v-for="p in players.data.value.items" :key="p.id">
              <button
                type="button"
                class="btn btn-secondary w-full justify-between"
                @click="recipient = p"
              >
                <span class="flex items-center gap-2"><PixelIcon name="user" :size="18" /> {{ p.pseudo }}</span>
                <PixelIcon name="arrow-right" :size="18" />
              </button>
            </li>
          </ul>
          <p v-else class="text-sm">Aucun joueur ne s’appelle « {{ debounced }}… ».</p>
        </AsyncState>
      </div>
    </div>

    <label class="field-label">
      Nombre d'exemplaires
      <input v-model.number="quantity" type="number" min="1" :max="max" class="field-input w-24" />
    </label>

    <button
      type="submit"
      class="btn btn-primary self-start"
      :disabled="!recipient || quantity < 1 || quantity > max || create.isPending.value"
    >
      <PixelIcon name="trade" :size="18" />
      {{ create.isPending.value ? 'Envoi…' : 'Offrir cette carte' }}
    </button>
  </form>
</template>
