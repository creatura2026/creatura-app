<script setup lang="ts">
/**
 * AS-75 · Lien de réinitialisation du mot de passe d'un joueur : l'admin le génère, le copie et
 * l'envoie au joueur. 5 minutes, usage unique ; un nouveau lien annule le précédent.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { errorMessage, type PasswordResetLink } from '@creatura/shared/api/types'
import { toast } from '@creatura/shared/toast'

import { useCreatePasswordResetLink } from '@/api/queries'

const props = defineProps<{ playerId: string; pseudo: string }>()

const create = useCreatePasswordResetLink()
const link = ref<PasswordResetLink | null>(null)
const copied = ref(false)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

const secondsLeft = computed(() =>
  link.value ? Math.max(0, Math.ceil((Date.parse(link.value.expiresAt) - now.value) / 1000)) : 0,
)
const expired = computed(() => link.value !== null && secondsLeft.value === 0)
const countdown = computed(() => {
  const s = secondsLeft.value
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

async function generate() {
  try {
    link.value = await create.mutateAsync(props.playerId)
    copied.value = false
    now.value = Date.now()
    clearInterval(timer)
    timer = setInterval(() => {
      now.value = Date.now()
      if (expired.value) clearInterval(timer)
    }, 1000)
  } catch (e) {
    toast(errorMessage(e), 'error')
  }
}

async function copy() {
  if (!link.value) return
  try {
    await navigator.clipboard.writeText(link.value.url)
    copied.value = true
  } catch {
    toast('Copie impossible : sélectionnez le lien et copiez-le à la main.', 'error')
  }
}

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="card-pixel-sm bg-white p-4 sm:p-5">
    <h2 class="font-sans text-lg font-bold">Mot de passe oublié</h2>
    <p class="mt-1 text-sm text-ink/80">
      Générez un lien que {{ pseudo }} ouvrira pour choisir un nouveau mot de passe. Il vaut 5
      minutes et ne sert qu’une fois ; ses sessions ouvertes seront fermées.
    </p>

    <div
      v-if="link && !expired"
      class="mt-3 border-2 border-ink bg-butter px-3 py-3 text-sm"
      role="status"
      aria-live="polite"
    >
      <p class="font-bold">Lien à envoyer à {{ pseudo }}</p>
      <p class="mt-2 flex flex-wrap items-center gap-2">
        <code
          class="min-w-0 flex-1 border-2 border-ink bg-white px-2 py-1 font-mono text-xs break-all select-all"
          >{{ link.url }}</code
        >
        <button type="button" class="btn btn-secondary min-h-10 px-3" @click="copy">
          {{ copied ? 'Copié' : 'Copier' }}
        </button>
      </p>
      <p class="mt-2">
        Expire dans <strong class="tabular-nums">{{ countdown }}</strong
        >. Envoyez-le en privé : il ne sera plus affiché.
      </p>
    </div>
    <p v-else-if="expired" class="mt-3 border-2 border-ink bg-mist px-3 py-2 text-sm" role="status">
      Le lien a expiré. Générez-en un nouveau si besoin.
    </p>

    <button
      type="button"
      class="btn btn-secondary mt-3"
      :disabled="create.isPending.value"
      @click="generate"
    >
      {{
        create.isPending.value
          ? 'Génération…'
          : link && !expired
            ? 'Générer un nouveau lien'
            : 'Générer un lien de réinitialisation'
      }}
    </button>
    <p v-if="link && !expired" class="mt-1 text-xs text-ink/70">Un nouveau lien annule celui-ci.</p>
  </div>
</template>
