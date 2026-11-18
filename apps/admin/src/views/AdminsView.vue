<script setup lang="ts">
/**
 * AS-71 · Comptes admin : création avec un mot de passe provisoire généré par le serveur et affiché
 * une seule fois, désactivation par un autre admin (jamais son propre compte). Un admin désactivé
 * n'est jamais supprimé.
 */
import { computed, ref } from 'vue'
import { useForm } from 'vee-validate'
import { z } from 'zod'
import { toTypedSchema } from '@creatura/shared/forms'
import {
  errorMessage,
  isApiError,
  type AdminAccount,
  type AdminAccountCreated,
} from '@creatura/shared/api/types'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import FormField from '@creatura/shared/ui/FormField.vue'
import { formatDateTime } from '@creatura/shared/format'
import { toast } from '@creatura/shared/toast'

import { useAdmins, useCreateAdmin, useDeactivateAdmin } from '@/api/queries'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { data, isPending, error, refetch } = useAdmins()

// ── Création ──
const schema = toTypedSchema(
  z.object({
    pseudo: z
      .string({ error: 'Saisissez un pseudonyme.' })
      .trim()
      .min(3, '3 caractères minimum.')
      .max(20, '20 caractères maximum.')
      .regex(/^[A-Za-z0-9_-]+$/, 'Lettres sans accent, chiffres, - et _ seulement.'),
    login: z
      .string({ error: 'Saisissez un identifiant.' })
      .trim()
      .min(3, '3 caractères minimum.')
      .max(50, '50 caractères maximum.'),
  }),
)
const { defineField, errors, handleSubmit, isSubmitting, resetForm, setFieldError } = useForm({
  validationSchema: schema,
})
const [pseudo, pseudoAttrs] = defineField('pseudo')
const [login, loginAttrs] = defineField('login')
const create = useCreateAdmin()
const formError = ref<string | null>(null)

/** Compte qui vient d'être créé : son mot de passe provisoire n'est affiché qu'ici, une fois. */
const created = ref<AdminAccountCreated | null>(null)
const copied = ref(false)
async function copyPassword() {
  if (!created.value) return
  try {
    await navigator.clipboard.writeText(created.value.temporaryPassword)
    copied.value = true
  } catch {
    toast('Copie impossible : sélectionnez le mot de passe et copiez-le à la main.', 'error')
  }
}

const onCreate = handleSubmit(async (values) => {
  formError.value = null
  try {
    created.value = await create.mutateAsync(values)
    copied.value = false
    resetForm()
  } catch (e) {
    const field = isApiError(e) ? e.problem.errors?.[0] : undefined
    if (field?.field === 'pseudo' || field?.field === 'login')
      setFieldError(field.field, field.message)
    else formError.value = errorMessage(e)
  }
})

// ── Désactivation ──
const deactivate = useDeactivateAdmin()
const confirming = ref<string | null>(null)
async function onDeactivate(admin: AdminAccount) {
  try {
    await deactivate.mutateAsync(admin.id)
    confirming.value = null
    toast(`Compte ${admin.pseudo} désactivé.`, 'success')
  } catch (e) {
    toast(errorMessage(e), 'error')
  }
}

/** Il doit rester au moins deux admins actifs (une demande de suppression a besoin d'un validateur). */
const MIN_ACTIVE_ADMINS = 2
const canDeactivate = computed(
  () => (data.value?.filter((a) => a.active).length ?? 0) > MIN_ACTIVE_ADMINS,
)

function status(a: AdminAccount): string {
  if (!a.active)
    return `Désactivé le ${a.deactivatedAt ? formatDateTime(a.deactivatedAt) : '?'}${a.deactivatedBy ? ` par ${a.deactivatedBy.pseudo}` : ''}`
  if (a.mustChangePassword) return 'Actif · mot de passe provisoire'
  return 'Actif'
}
</script>

<template>
  <section>
    <PageHeader
      eyebrow="Comptes du dashboard"
      title="Administrateurs"
      subtitle="Un admin valide les demandes de suppression de joueurs des autres admins."
    />

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <AsyncState :loading="isPending" :error="error" @retry="refetch()">
        <div v-if="data" class="card-pixel-sm min-w-0 bg-white p-4 sm:p-5">
          <ul class="flex flex-col gap-3" aria-label="Comptes administrateur">
            <li
              v-for="a in data"
              :key="a.id"
              class="border-2 border-ink p-3 text-sm"
              :class="a.active ? 'bg-white' : 'bg-mist'"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-base font-semibold">
                  {{ a.pseudo }}
                  <span v-if="a.id === auth.user?.id" class="text-ink/80">(vous)</span>
                </span>
                <span
                  class="border-2 border-ink px-1.5 text-xs font-bold"
                  :class="!a.active ? 'bg-salmon' : a.mustChangePassword ? 'bg-butter' : 'bg-mint'"
                >
                  {{ status(a) }}
                </span>
              </div>
              <p class="mt-1">
                Identifiant : {{ a.login }} · créé le {{ formatDateTime(a.createdAt) }}
                {{ a.createdBy ? `par ${a.createdBy.pseudo}` : '(premier admin)' }}
              </p>
              <p class="mt-1 text-ink/80">
                Dernière connexion :
                {{ a.lastLoginAt ? formatDateTime(a.lastLoginAt) : 'jamais' }}
              </p>

              <div
                v-if="a.active && a.id !== auth.user?.id && canDeactivate"
                class="mt-3 flex flex-wrap gap-2"
              >
                <template v-if="confirming === a.id">
                  <p class="w-full font-semibold text-brick" role="alert">
                    {{ a.pseudo }} ne pourra plus se connecter et ses demandes en attente seront
                    annulées. Confirmer ?
                  </p>
                  <button type="button" class="btn btn-secondary" @click="confirming = null">
                    Retour
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary"
                    :disabled="deactivate.isPending.value"
                    @click="onDeactivate(a)"
                  >
                    Oui, désactiver
                  </button>
                </template>
                <button v-else type="button" class="btn btn-secondary" @click="confirming = a.id">
                  Désactiver
                </button>
              </div>
            </li>
          </ul>
          <p v-if="!canDeactivate" class="mt-3 text-sm text-ink/80">
            Il doit toujours rester au moins deux administrateurs actifs : créez-en un autre avant
            d’en désactiver un.
          </p>
        </div>
      </AsyncState>

      <form
        class="card-pixel-sm flex h-fit flex-col gap-4 bg-sky p-4 sm:p-5"
        novalidate
        aria-labelledby="create-admin-title"
        @submit="onCreate"
      >
        <h2 id="create-admin-title" class="font-sans text-lg font-bold">Créer un administrateur</h2>
        <div
          v-if="created"
          class="border-2 border-ink bg-butter px-3 py-3 text-sm"
          role="status"
          aria-live="polite"
        >
          <p class="font-bold">Compte {{ created.pseudo }} créé</p>
          <p class="mt-1">
            Identifiant : <strong>{{ created.login }}</strong>
          </p>
          <p class="mt-1">Mot de passe provisoire :</p>
          <p class="mt-1 flex flex-wrap items-center gap-2">
            <code class="border-2 border-ink bg-white px-2 py-1 font-mono text-base select-all">{{
              created.temporaryPassword
            }}</code>
            <button type="button" class="btn btn-secondary min-h-10 px-3" @click="copyPassword">
              {{ copied ? 'Copié' : 'Copier' }}
            </button>
          </p>
          <p class="mt-2 font-semibold text-brick">
            Notez-le maintenant et transmettez-le en privé : il ne sera plus affiché.
          </p>
          <button type="button" class="mt-2 underline underline-offset-2" @click="created = null">
            J’ai transmis le mot de passe, masquer
          </button>
        </div>
        <p
          v-if="formError"
          class="border-2 border-brick bg-salmon px-3 py-2 text-sm font-medium"
          role="alert"
        >
          {{ formError }}
        </p>
        <FormField
          v-model="pseudo"
          v-bind="pseudoAttrs"
          label="Pseudonyme"
          :error="errors.pseudo"
        />
        <FormField
          v-model="login"
          v-bind="loginAttrs"
          label="Identifiant de connexion"
          autocomplete="off"
          :error="errors.login"
        />
        <p class="text-sm text-ink/80">
          Le mot de passe provisoire est généré automatiquement. Le nouvel admin le remplacera à sa
          première connexion.
        </p>
        <button type="submit" class="btn btn-primary" :disabled="isSubmitting">
          {{ isSubmitting ? 'Création…' : 'Créer le compte' }}
        </button>
      </form>
    </div>
  </section>
</template>
