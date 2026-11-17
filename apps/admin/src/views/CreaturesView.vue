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
  useUploadSprite,
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
const uploadSprite = useUploadSprite()

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
  stock: 50 as number | null,
})
const form = reactive(blank())
const formErrors = ref<Record<string, string>>({})
const newFile = ref<File | null>(null)
const newFileInput = ref<HTMLInputElement | null>(null)

/** Nom de carte → clé de fichier : minuscules, accents retirés, snake_case. « Léo Brume » → leo_brume */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
const spriteKey = computed(() => slugify(form.name))

function onNewFile(event: Event) {
  newFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

async function addCard() {
  formErrors.value = {}
  const file = newFile.value
  const key = spriteKey.value
  if (!file) {
    formErrors.value = { file: 'Choisissez une image PNG pour la carte.' }
    return
  }
  if (!key) {
    formErrors.value = { name: 'Le nom doit contenir des lettres ou des chiffres.' }
    return
  }
  try {
    const card = await create.mutateAsync({
      ...form,
      image: `sprites/${key}.png`,
      stock: form.rarity === 'LEGENDARY' ? form.stock : null,
    })
    // La carte existe : on y attache le sprite (clé dérivée du nom). Un échec ici n'annule pas
    // la carte (le back n'a pas de suppression) : on le signale et le sprite reste à reprendre.
    try {
      await uploadSprite.mutateAsync({ id: card.id, file, filename: key })
    } catch (e) {
      toast(`${card.name} créée, mais l'image a échoué : ${errorMessage(e)} Reprenez le sprite dans la liste.`, 'error')
      resetForm()
      return
    }
    toast(`${card.name} sera disponible le ${formatDate(card.availableFrom)}, à minuit.`, 'success')
    resetForm()
  } catch (e) {
    const fields = (e as { problem?: { errors?: { field: string; message: string }[] } }).problem
      ?.errors
    formErrors.value = Object.fromEntries((fields ?? []).map((f) => [f.field, f.message]))
    toast(errorMessage(e), 'error')
  }
}

function resetForm() {
  Object.assign(form, blank())
  newFile.value = null
  if (newFileInput.value) newFileInput.value.value = ''
}

// ── Upload de sprite ──────────────────────────────────────────────────────
const uploadingFor = ref<string | null>(null)

async function onSpriteFile(c: AdminCreature, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  uploadingFor.value = c.id
  try {
    const updated = await uploadSprite.mutateAsync({ id: c.id, file })
    toast(`Sprite de ${updated.name} mis à jour.`, 'success')
  } catch (e) {
    toast(errorMessage(e), 'error')
  } finally {
    uploadingFor.value = null
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
        Visible et tirable à partir du prochain minuit (heure de Paris). L'image PNG est publiée
        sur le CDN sous une clé dérivée du nom.
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
          Nombre d'exemplaires
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
          Image (PNG)
          <input
            ref="newFileInput"
            type="file"
            accept="image/png"
            required
            class="field"
            @change="onNewFile"
          />
          <span v-if="spriteKey" class="text-xs font-normal">
            Clé sur le CDN : <code>sprites/{{ spriteKey }}.png</code>
          </span>
          <span v-if="formErrors.file" class="text-xs text-brick">{{ formErrors.file }}</span>
        </label>
        <label class="text-sm font-semibold sm:col-span-2 lg:col-span-3">
          Description
          <textarea v-model="form.description" maxlength="500" rows="2" class="field" />
        </label>
      </div>
      <div class="mt-4 flex justify-end">
        <button
          type="submit"
          class="btn btn-primary bg-white"
          :disabled="create.isPending.value || uploadSprite.isPending.value"
        >
          <PixelIcon name="check" :size="18" />
          {{ create.isPending.value || uploadSprite.isPending.value ? 'Ajout…' : 'Ajouter au prochain minuit' }}
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
          <div v-else class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-secondary" @click="startEdit(c)">
              Changer la rareté
            </button>
            <label
              class="btn btn-secondary cursor-pointer"
              :class="{ 'opacity-50': uploadingFor === c.id }"
            >
              {{ uploadingFor === c.id ? 'Upload…' : 'Sprite PNG' }}
              <input
                type="file"
                accept="image/png"
                class="sr-only"
                :disabled="uploadingFor === c.id"
                @change="onSpriteFile(c, $event)"
              />
            </label>
          </div>
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
