<script setup lang="ts">
/**
 * AS-71 · Demande de suppression de joueurs : le demandeur choisit l'admin qui la validera.
 * Rien n'est supprimé ici ; seul le validateur choisi pourra valider ou refuser.
 */
import { computed, onMounted, ref } from 'vue'
import { errorMessage, type AdminPlayer } from '@creatura/shared/api/types'
import { toast } from '@creatura/shared/toast'

import { useAdmins, useCreateDeletionRequest } from '@/api/queries'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ players: AdminPlayer[] }>()
const emit = defineEmits<{ close: []; created: [] }>()

const auth = useAuthStore()
const admins = useAdmins()
const create = useCreateDeletionRequest()

/** Validateurs possibles : les autres admins actifs. */
const validators = computed(
  () => admins.data.value?.filter((a) => a.active && a.id !== auth.user?.id) ?? [],
)
const validatorId = ref('')
const reason = ref('')
const error = ref<string | null>(null)
const firstField = ref<HTMLSelectElement | null>(null)
onMounted(() => firstField.value?.focus())

async function submit() {
  error.value = null
  if (!validatorId.value) {
    error.value = 'Choisissez l’administrateur qui validera la demande.'
    return
  }
  try {
    await create.mutateAsync({
      playerIds: props.players.map((p) => p.id),
      validatorId: validatorId.value,
      reason: reason.value.trim() || null,
    })
    const validator = validators.value.find((a) => a.id === validatorId.value)
    toast(`Demande envoyée à ${validator?.pseudo ?? 'l’administrateur choisi'}.`, 'success')
    emit('created')
  } catch (e) {
    error.value = errorMessage(e)
  }
}
</script>

<template>
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- Échap ferme la boîte de dialogue, où que soit le focus -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    @keydown.escape="emit('close')"
  >
    <form
      class="card-pixel-sm max-h-[90dvh] w-full max-w-lg overflow-y-auto bg-white px-5 py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deletion-title"
      novalidate
      @submit.prevent="submit"
    >
      <h2 id="deletion-title" class="text-lg font-bold">Demander la suppression</h2>
      <p class="mt-2 text-sm">
        {{ players.length }} joueur{{ players.length > 1 ? 's' : '' }} :
        <strong>{{ players.map((p) => p.pseudo).join(', ') }}</strong>
      </p>
      <p class="mt-2 border-2 border-ink bg-butter px-3 py-2 text-sm">
        Une fois la demande validée, le compte, les cartes, les connexions et les échanges en cours
        de ces joueurs sont supprimés définitivement. Leurs échanges terminés restent chez l’autre
        joueur, avec « Joueur supprimé » à leur place.
      </p>

      <p
        v-if="error"
        class="mt-3 border-2 border-brick bg-salmon px-3 py-2 text-sm font-medium"
        role="alert"
      >
        {{ error }}
      </p>

      <div class="mt-4">
        <label for="validator" class="field-label">Administrateur qui valide</label>
        <select id="validator" ref="firstField" v-model="validatorId" class="field-input">
          <option value="" disabled>Choisir un administrateur</option>
          <option v-for="a in validators" :key="a.id" :value="a.id">{{ a.pseudo }}</option>
        </select>
        <p v-if="admins.data.value && !validators.length" class="mt-1 text-sm text-brick">
          Aucun autre administrateur actif : créez-en un dans l’onglet « Administrateurs ».
        </p>
        <p v-else class="mt-1 text-sm text-ink/80">
          Lui seul pourra valider ou refuser. Sans réponse sous 7 jours, la demande expire.
        </p>
      </div>
      <div class="mt-4">
        <label for="reason" class="field-label">Motif (facultatif)</label>
        <textarea id="reason" v-model="reason" class="field-input" rows="3" maxlength="500" />
      </div>

      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Annuler</button>
        <button type="submit" class="btn btn-primary" :disabled="create.isPending.value">
          {{ create.isPending.value ? 'Envoi…' : 'Envoyer la demande' }}
        </button>
      </div>
    </form>
  </div>
</template>
