<script setup lang="ts">
/**
 * AS-71 · Demandes de suppression : le validateur choisi valide ou refuse, le demandeur peut
 * annuler tant que la demande est en attente. Les autres admins la voient sans agir.
 */
import { ref } from 'vue'
import {
  errorMessage,
  type DeletionRequest,
  type DeletionRequestStatus,
} from '@creatura/shared/api/types'
import { formatDateTime } from '@creatura/shared/format'
import { toast } from '@creatura/shared/toast'

import { useDecideDeletionRequest } from '@/api/queries'
import { useAuthStore } from '@/stores/auth'

defineProps<{ requests: DeletionRequest[]; caption: string }>()

const STATUS: Record<DeletionRequestStatus, { label: string; tone: string }> = {
  PENDING: { label: 'En attente', tone: 'bg-butter' },
  APPROVED: { label: 'Validée', tone: 'bg-mint' },
  REJECTED: { label: 'Refusée', tone: 'bg-salmon' },
  CANCELLED: { label: 'Annulée', tone: 'bg-mist' },
  EXPIRED: { label: 'Expirée', tone: 'bg-mist' },
}

const auth = useAuthStore()
const decide = useDecideDeletionRequest()
/** Demande dont on confirme la validation (suppression définitive). */
const confirming = ref<string | null>(null)

async function act(request: DeletionRequest, decision: 'approve' | 'reject' | 'cancel') {
  try {
    await decide.mutateAsync({ id: request.id, decision })
    confirming.value = null
    const n = request.accountCount
    const message =
      decision === 'approve'
        ? `${n} joueur${n > 1 ? 's supprimés' : ' supprimé'}.`
        : decision === 'reject'
          ? 'Demande refusée : personne n’est supprimé.'
          : 'Demande annulée.'
    toast(message, 'success')
  } catch (e) {
    toast(errorMessage(e), 'error')
  }
}

const players = (r: DeletionRequest) =>
  r.players.length
    ? r.players.map((p) => p.pseudo).join(', ')
    : `${r.accountCount} joueur${r.accountCount > 1 ? 's' : ''} (supprimé${r.accountCount > 1 ? 's' : ''})`
</script>

<template>
  <ul class="flex flex-col gap-3" :aria-label="caption">
    <li v-for="r in requests" :key="r.id" class="border-2 border-ink bg-white p-3 text-sm">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-semibold">{{ players(r) }}</span>
        <span class="border-2 border-ink px-1.5 text-xs font-bold" :class="STATUS[r.status].tone">
          {{ STATUS[r.status].label }}
        </span>
      </div>
      <p class="mt-1">
        Demandée par <strong>{{ r.requestedBy.pseudo }}</strong> le
        {{ formatDateTime(r.createdAt) }}, validateur : <strong>{{ r.validator.pseudo }}</strong>
      </p>
      <p v-if="r.reason" class="mt-1"><span class="text-ink/70">Motif :</span> {{ r.reason }}</p>
      <p v-if="r.status === 'PENDING'" class="mt-1 text-ink/80">
        Expire le {{ formatDateTime(r.expiresAt) }}
      </p>
      <p v-else-if="r.decidedAt" class="mt-1 text-ink/80">
        Traitée le {{ formatDateTime(r.decidedAt) }}
      </p>

      <div
        v-if="r.status === 'PENDING' && r.validator.id === auth.user?.id"
        class="mt-3 flex flex-wrap gap-2"
      >
        <template v-if="confirming === r.id">
          <p class="w-full font-semibold text-brick" role="alert">
            Suppression définitive : confirmer ?
          </p>
          <button type="button" class="btn btn-secondary" @click="confirming = null">Retour</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="decide.isPending.value"
            @click="act(r, 'approve')"
          >
            Oui, supprimer
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="decide.isPending.value"
            @click="act(r, 'reject')"
          >
            Refuser
          </button>
          <button type="button" class="btn btn-primary" @click="confirming = r.id">Valider</button>
        </template>
      </div>
      <div
        v-else-if="r.status === 'PENDING' && r.requestedBy.id === auth.user?.id"
        class="mt-3 flex flex-wrap gap-2"
      >
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="decide.isPending.value"
          @click="act(r, 'cancel')"
        >
          Annuler ma demande
        </button>
      </div>
    </li>
  </ul>
</template>
