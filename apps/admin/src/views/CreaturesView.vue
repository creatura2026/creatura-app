<script setup lang="ts">
/**
 * Cartes du catalogue : ajout d'une carte et changement de rareté, appliqués au prochain minuit.
 * Une légendaire est une édition limitée : son nombre d'exemplaires est obligatoire.
 */
import { computed, reactive, ref } from 'vue'
import { errorMessage, type AdminCreature } from '@creatura/shared/api/types'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import RarityGems from '@creatura/shared/ui/RarityGems.vue'
import { formatDate } from '@creatura/shared/format'
import { toast } from '@creatura/shared/toast'

import {
  useAdminCreatures,
  useCancelRarityChange,
  useCreateCreature,
  useScheduleRarityChange,
} from '@/api/queries'

const FAMILIES = [
  { code: 'NATURE', label: 'Nature' },
  { code: 'CRISTAL', label: 'Cristal' },
  { code: 'BRUME', label: 'Brume' },
  { code: 'LUEUR', label: 'Lueur' },
]
const RARITIES = [
  { code: 'COMMON', label: 'Commune' },
  { code: 'UNCOMMON', label: 'Peu commune' },
  { code: 'RARE', label: 'Rare' },
  { code: 'LEGENDARY', label: 'Légendaire (édition limitée)' },
]

const { data: creatures, isPending, error, refetch } = useAdminCreatures()
const create = useCreateCreature()
const schedule = useScheduleRarityChange()
const cancel = useCancelRarityChange()

const today = new Date().toISOString().slice(0, 10)
const search = ref('')
const shown = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return (creatures.value ?? []).filter((c) => !needle || c.name.toLowerCase().includes(needle))
})

// ── Ajout d'une carte ────────────────────────────────────────────────────
const blank = () => ({
  name: '',
  description: '',
  family: 'NATURE',
  rarity: 'LEGENDARY',
  image: 'sprites/',
  stock: 50 as number | null,
})
const form = reactive(blank())
const formErrors = ref<Record<string, string>>({})
const imagePreview = computed(() =>
  /^sprites\/[a-z0-9_-]+\.png$/.test(form.image)
    ? `${creatures.value?.[0]?.imageUrl.replace(/sprites\/.*$/, '') ?? '/'}${form.image}`
    : null,
)

async function addCard() {
  formErrors.value = {}
  try {
    const card = await create.mutateAsync({
      ...form,
      stock: form.rarity === 'LEGENDARY' ? form.stock : null,
    })
    toast(`${card.name} sera disponible le ${formatDate(card.availableFrom)}, à minuit.`, 'success')
    Object.assign(form, blank())
  } catch (e) {
    const fields = (e as { problem?: { errors?: { field: string; message: string }[] } }).problem
      ?.errors
    formErrors.value = Object.fromEntries((fields ?? []).map((f) => [f.field, f.message]))
    toast(errorMessage(e), 'error')
  }
}

// ── Changement de rareté ──────────────────────────────────────────────────
const editing = ref<string | null>(null)
const change = reactive({ rarity: 'RARE', stock: 50 as number | null })

function startEdit(c: AdminCreature) {
  editing.value = c.id
  change.rarity = c.scheduledChange?.rarity.code ?? c.rarity.code
  change.stock = c.scheduledChange?.stock ?? c.stockRemaining ?? 50
}

async function saveChange(c: AdminCreature) {
  try {
    const updated = await schedule.mutateAsync({
      id: c.id,
      body: { rarity: change.rarity, stock: change.rarity === 'LEGENDARY' ? change.stock : null },
    })
    editing.value = null
    toast(
      `${updated.name} : ${updated.scheduledChange?.rarity.label} à partir du ${formatDate(updated.scheduledChange!.effectiveFrom)}.`,
      'success',
    )
  } catch (e) {
    toast(errorMessage(e), 'error')
  }
}

async function cancelChange(c: AdminCreature) {
  try {
    await cancel.mutateAsync(c.id)
    toast(`Changement de ${c.name} annulé.`, 'success')
  } catch (e) {
    toast(errorMessage(e), 'error')
  }
}
</script>

<template>
  <section>
    <PageHeader eyebrow="Catalogue" title="Cartes" />

    <form class="card-pixel bg-butter p-5 sm:p-6" @submit.prevent="addCard">
      <h2 class="font-sans text-lg font-bold">Ajouter une carte</h2>
      <p class="mt-1 text-sm">
        Visible et tirable à partir du prochain minuit (heure de Paris). L’image doit déjà être sur
        le CDN, dans le dossier <code>sprites/</code>.
      </p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label class="text-sm font-semibold">
          Nom
          <input v-model="form.name" required minlength="2" maxlength="50" class="field" />
          <span v-if="formErrors.name" class="text-xs text-brick">{{ formErrors.name }}</span>
        </label>
        <label class="text-sm font-semibold">
          Famille
          <select v-model="form.family" class="field">
            <option v-for="f in FAMILIES" :key="f.code" :value="f.code">{{ f.label }}</option>
          </select>
        </label>
        <label class="text-sm font-semibold">
          Rareté
          <select v-model="form.rarity" class="field">
            <option v-for="r in RARITIES" :key="r.code" :value="r.code">{{ r.label }}</option>
          </select>
        </label>
        <label v-if="form.rarity === 'LEGENDARY'" class="text-sm font-semibold">
          Nombre d’exemplaires
          <input
            v-model.number="form.stock"
            type="number"
            min="1"
            max="100000"
            required
            class="field"
          />
          <span v-if="formErrors.stock" class="text-xs text-brick">{{ formErrors.stock }}</span>
        </label>
        <label class="text-sm font-semibold">
          Image (clé sur le CDN)
          <input v-model="form.image" required pattern="sprites/[a-z0-9_\-]+\.png" class="field" />
          <span v-if="formErrors.image" class="text-xs text-brick">{{ formErrors.image }}</span>
        </label>
        <label class="text-sm font-semibold sm:col-span-2 lg:col-span-3">
          Description
          <textarea v-model="form.description" maxlength="500" rows="2" class="field" />
        </label>
      </div>
      <div class="mt-4 flex items-center justify-between gap-3">
        <img
          v-if="imagePreview"
          :src="imagePreview"
          alt="Aperçu de l’image"
          class="pixelated size-16 border-2 border-ink bg-white"
        />
        <span v-else />
        <button type="submit" class="btn btn-primary bg-white" :disabled="create.isPending.value">
          <PixelIcon name="check" :size="18" />
          {{ create.isPending.value ? 'Ajout…' : 'Ajouter au prochain minuit' }}
        </button>
      </div>
    </form>

    <AsyncState :loading="isPending" :error="error" @retry="refetch()">
      <div class="mt-6 flex items-center justify-between gap-3">
        <h2 class="font-sans text-lg font-bold">{{ creatures?.length ?? 0 }} cartes</h2>
        <input v-model="search" type="search" placeholder="Rechercher" class="field max-w-60" />
      </div>
      <ul class="mt-3 grid gap-3">
        <li
          v-for="c in shown"
          :key="c.id"
          class="card-pixel-sm flex flex-wrap items-center gap-3 bg-white p-3"
        >
          <img :src="c.imageUrl" alt="" class="pixelated size-12" />
          <div class="min-w-40 flex-1">
            <p class="font-bold">
              {{ c.name }}
              <span v-if="c.availableFrom > today" class="ml-1 bg-sky px-1.5 text-xs">
                disponible le {{ formatDate(c.availableFrom) }}
              </span>
            </p>
            <p class="text-xs">
              {{ c.family.label }} ·
              <template v-if="c.stockTotal !== null">
                édition limitée : {{ c.stockRemaining }} / {{ c.stockTotal }} restants
              </template>
              <template v-else>illimitée</template>
            </p>
            <p v-if="c.scheduledChange" class="mt-1 text-xs font-semibold">
              Le {{ formatDate(c.scheduledChange.effectiveFrom) }} :
              {{ c.scheduledChange.rarity.label }}
              <template v-if="c.scheduledChange.stock"
                >({{ c.scheduledChange.stock }} exemplaires)</template
              >
              <button type="button" class="ml-2 underline" @click="cancelChange(c)">Annuler</button>
            </p>
          </div>
          <RarityGems :code="c.rarity.code" :label="c.rarity.label" :size="14" />

          <form
            v-if="editing === c.id"
            class="flex w-full flex-wrap items-end gap-2 border-t-2 border-ink/20 pt-3"
            @submit.prevent="saveChange(c)"
          >
            <label class="text-xs font-semibold">
              Nouvelle rareté
              <select v-model="change.rarity" class="field">
                <option v-for="r in RARITIES" :key="r.code" :value="r.code">{{ r.label }}</option>
              </select>
            </label>
            <label v-if="change.rarity === 'LEGENDARY'" class="text-xs font-semibold">
              Exemplaires à tirer
              <input
                v-model.number="change.stock"
                type="number"
                min="1"
                max="100000"
                required
                class="field w-28"
              />
            </label>
            <button type="submit" class="btn btn-primary" :disabled="schedule.isPending.value">
              Prévoir à minuit
            </button>
            <button type="button" class="btn btn-secondary" @click="editing = null">Fermer</button>
          </form>
          <button v-else type="button" class="btn btn-secondary" @click="startEdit(c)">
            Changer la rareté
          </button>
        </li>
      </ul>
    </AsyncState>
  </section>
</template>

<style scoped>
.field {
  display: block;
  width: 100%;
  margin-top: 0.25rem;
  border: 2px solid var(--color-ink);
  background: white;
  padding: 0.375rem 0.5rem;
  font-weight: 400;
}
</style>
