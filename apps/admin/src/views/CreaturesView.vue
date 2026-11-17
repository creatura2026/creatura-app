<script setup lang="ts">
/**
 * Cartes du catalogue : ajout d'une carte et modification d'une carte existante.
 *
 * L'image est toujours publiée sur le CDN sous une clé dérivée du nom (`sprites/<slug>.png`) :
 * la clé du bucket est donc forcément celle de la créature. Une prévisualisation montre la carte
 * telle que la verront les joueurs.
 *
 * « Modifier la créature » change tout en une fois : nom, description et famille (tout de suite),
 * image (upload immédiat), et rareté + nombre d'exemplaires (appliqués au prochain minuit).
 */
import { computed, reactive, ref, watch } from 'vue'
import { errorMessage, type AdminCreature, type AdminCreatureUpdate } from '@creatura/shared/api/types'
import type { CreatureSummary } from '@creatura/shared/api/types'
import PageHeader from '@creatura/shared/ui/PageHeader.vue'
import AsyncState from '@creatura/shared/ui/AsyncState.vue'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'
import CreatureCard from '@creatura/shared/ui/CreatureCard.vue'
import { formatDate } from '@creatura/shared/format'
import { toast } from '@creatura/shared/toast'

import {
  useAdminCreatures,
  useCancelRarityChange,
  useCreateCreature,
  useScheduleRarityChange,
  useUpdateCreature,
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
/** Libellé court pour la prévisualisation (le libellé long déborderait la carte). */
const RARITY_SHORT: Record<string, string> = {
  COMMON: 'Commune',
  UNCOMMON: 'Peu commune',
  RARE: 'Rare',
  LEGENDARY: 'Légendaire',
}

const { data: creatures, isPending, error, refetch } = useAdminCreatures()
const create = useCreateCreature()
const update = useUpdateCreature()
const schedule = useScheduleRarityChange()
const cancel = useCancelRarityChange()
const uploadSprite = useUploadSprite()

const today = new Date().toISOString().slice(0, 10)
const search = ref('')
const shown = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return (creatures.value ?? []).filter((c) => !needle || c.name.toLowerCase().includes(needle))
})

/** Nom de carte → clé de fichier : minuscules, accents retirés, snake_case. « Léo Brume » → leo_brume */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function familyOf(code: string) {
  return FAMILIES.find((f) => f.code === code) ?? FAMILIES[0]!
}

/** Objet attendu par CreatureCard pour la prévisualisation. */
function preview(opts: {
  name: string
  family: string
  rarity: string
  imageUrl: string | null
}): CreatureSummary {
  const fam = familyOf(opts.family)
  return {
    id: 'preview',
    name: opts.name.trim() || 'Nouvelle carte',
    family: { code: fam.code, label: fam.label },
    rarity: { code: opts.rarity, label: RARITY_SHORT[opts.rarity] ?? opts.rarity },
    imageUrl: opts.imageUrl ?? '',
  }
}

// ── Ajout d'une carte ────────────────────────────────────────────────────
const blank = () => ({
  name: '',
  description: '',
  family: 'NATURE',
  // Par défaut une carte illimitée (exemplaires infinis) ; seule une légendaire a un stock.
  rarity: 'COMMON',
  stock: 50 as number | null,
})
const form = reactive(blank())
const formErrors = ref<Record<string, string>>({})
const newFile = ref<File | null>(null)
const newFileUrl = ref<string | null>(null)
const newFileInput = ref<HTMLInputElement | null>(null)

const spriteKey = computed(() => slugify(form.name))
const newPreview = computed(() =>
  preview({ name: form.name, family: form.family, rarity: form.rarity, imageUrl: newFileUrl.value }),
)

function setNewFile(file: File | null) {
  if (newFileUrl.value) URL.revokeObjectURL(newFileUrl.value)
  newFile.value = file
  newFileUrl.value = file ? URL.createObjectURL(file) : null
}

function onNewFile(event: Event) {
  setNewFile((event.target as HTMLInputElement).files?.[0] ?? null)
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
      toast(`${card.name} créée, mais l'image a échoué : ${errorMessage(e)} Reprenez l'image dans la liste.`, 'error')
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
  setNewFile(null)
  if (newFileInput.value) newFileInput.value.value = ''
}

// ── Modifier une carte existante (nom, description, famille, image, rareté) ──
const editing = ref<string | null>(null)
const edit = reactive({
  name: '',
  description: '',
  family: 'NATURE',
  rarity: 'COMMON',
  stock: 50 as number | null,
})
const editFile = ref<File | null>(null)
const editFileUrl = ref<string | null>(null)
const editInput = ref<HTMLInputElement | null>(null)
const saving = ref(false)

const editKey = computed(() => slugify(edit.name))
const editPreview = computed(() => {
  const c = shown.value.find((x) => x.id === editing.value)
  return preview({
    name: edit.name,
    family: edit.family,
    rarity: edit.rarity,
    imageUrl: editFileUrl.value ?? c?.imageUrl ?? null,
  })
})

function setEditFile(file: File | null) {
  if (editFileUrl.value) URL.revokeObjectURL(editFileUrl.value)
  editFile.value = file
  editFileUrl.value = file ? URL.createObjectURL(file) : null
}

function startEdit(c: AdminCreature) {
  editing.value = c.id
  edit.name = c.name
  edit.description = c.description ?? ''
  edit.family = c.family.code
  // On repart du changement prévu s'il y en a un, sinon de la rareté actuelle.
  edit.rarity = c.scheduledChange?.rarity.code ?? c.rarity.code
  edit.stock = c.scheduledChange?.stock ?? c.stockTotal ?? 50
  setEditFile(null)
  if (editInput.value) editInput.value.value = ''
}

function closeEdit() {
  editing.value = null
  setEditFile(null)
}

function onEditFile(event: Event) {
  setEditFile((event.target as HTMLInputElement).files?.[0] ?? null)
}

async function saveEdit(c: AdminCreature) {
  saving.value = true
  try {
    // 1. Attributs immédiats (nom, description, famille) : on n'envoie que ce qui change.
    const body: AdminCreatureUpdate = {}
    if (edit.name.trim() !== c.name) body.name = edit.name.trim()
    if ((edit.description ?? '').trim() !== (c.description ?? '')) body.description = edit.description
    if (edit.family !== c.family.code) body.family = edit.family
    if (Object.keys(body).length) await update.mutateAsync({ id: c.id, body })

    // 2. Nouvelle image : clé forcée au slug du nom (même clé que la créature).
    if (editFile.value) {
      if (!editKey.value) throw new Error('Le nom doit contenir des lettres ou des chiffres.')
      await uploadSprite.mutateAsync({ id: c.id, file: editFile.value, filename: editKey.value })
    }

    // 3. Rareté et exemplaires, appliqués au prochain minuit (si changés).
    const currentRarity = c.scheduledChange?.rarity.code ?? c.rarity.code
    const currentStock = c.scheduledChange?.stock ?? c.stockTotal
    const rarityChanged = edit.rarity !== currentRarity
    const stockChanged = edit.rarity === 'LEGENDARY' && edit.stock !== currentStock
    if (rarityChanged || stockChanged) {
      await schedule.mutateAsync({
        id: c.id,
        body: { rarity: edit.rarity, stock: edit.rarity === 'LEGENDARY' ? edit.stock : null },
      })
    }
    toast(`${edit.name.trim() || c.name} mise à jour.`, 'success')
    closeEdit()
  } catch (e) {
    toast(errorMessage(e), 'error')
  } finally {
    saving.value = false
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

watch(editing, (id) => {
  if (!id) setEditFile(null)
})
</script>

<template>
  <section>
    <PageHeader eyebrow="Catalogue" title="Cartes" />

    <!-- Ajouter une carte : formulaire à gauche, prévisualisation de la carte à droite. -->
    <form class="card-pixel bg-butter p-5 sm:p-6" @submit.prevent="addCard">
      <h2 class="font-sans text-lg font-bold">Ajouter une carte</h2>
      <div class="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_12rem]">
        <div class="grid gap-3 sm:grid-cols-2">
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
          <div v-else class="text-sm font-semibold">
            Nombre d'exemplaires
            <p class="field flex items-center gap-2 !bg-cream">
              <span class="text-lg leading-none">∞</span> Illimité
            </p>
          </div>
          <label class="text-sm font-semibold sm:col-span-2">
            Description
            <textarea v-model="form.description" maxlength="500" rows="2" class="field" />
          </label>

          <!-- Dépose d'image : zone cliquable avec aperçu, clé CDN affichée. -->
          <div class="text-sm font-semibold sm:col-span-2">
            Image de la carte (PNG)
            <label
              class="dropzone mt-1"
              :class="{ 'dropzone--filled': newFile }"
              @dragover.prevent
              @drop.prevent="setNewFile(($event.dataTransfer?.files?.[0] as File) ?? null)"
            >
              <img
                v-if="newFileUrl"
                :src="newFileUrl"
                alt=""
                class="pixelated size-14 shrink-0 border-2 border-ink bg-white"
              />
              <PixelIcon v-else name="booster" :size="28" class="shrink-0 opacity-60" />
              <span class="min-w-0 font-normal">
                <span class="block font-semibold">
                  {{ newFile ? newFile.name : 'Choisir un PNG ou le glisser ici' }}
                </span>
                <span v-if="spriteKey" class="block truncate text-xs">
                  Clé sur le CDN : <code>sprites/{{ spriteKey }}.png</code>
                </span>
                <span v-else class="block text-xs text-ink/70">La clé suit le nom de la carte.</span>
              </span>
              <input
                ref="newFileInput"
                type="file"
                accept="image/png"
                class="sr-only"
                @change="onNewFile"
              />
            </label>
            <span v-if="formErrors.file" class="text-xs text-brick">{{ formErrors.file }}</span>
          </div>
        </div>

        <!-- Prévisualisation -->
        <div class="mx-auto w-44 self-start lg:w-full">
          <p class="mb-1 text-xs font-bold tracking-wider uppercase">Aperçu</p>
          <CreatureCard
            :creature="newPreview"
            :missing="!newFileUrl"
            :description="form.description"
          />
        </div>
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

          <button
            v-if="editing !== c.id"
            type="button"
            class="btn btn-secondary"
            @click="startEdit(c)"
          >
            Modifier la créature
          </button>

          <!-- Éditeur : tout se modifie ici, avec un aperçu de la carte. -->
          <form
            v-else
            class="grid w-full gap-5 border-t-2 border-ink/20 pt-4 lg:grid-cols-[minmax(0,1fr)_12rem]"
            @submit.prevent="saveEdit(c)"
          >
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="text-sm font-semibold">
                Nom
                <input v-model="edit.name" required minlength="2" maxlength="50" class="field" />
              </label>
              <label class="text-sm font-semibold">
                Famille
                <select v-model="edit.family" class="field">
                  <option v-for="f in FAMILIES" :key="f.code" :value="f.code">{{ f.label }}</option>
                </select>
              </label>
              <label class="text-sm font-semibold sm:col-span-2">
                Description
                <textarea v-model="edit.description" maxlength="500" rows="2" class="field" />
              </label>
              <label class="text-sm font-semibold">
                Rareté (au prochain minuit)
                <select v-model="edit.rarity" class="field">
                  <option v-for="r in RARITIES" :key="r.code" :value="r.code">{{ r.label }}</option>
                </select>
              </label>
              <label v-if="edit.rarity === 'LEGENDARY'" class="text-sm font-semibold">
                Nombre d'exemplaires
                <input
                  v-model.number="edit.stock"
                  type="number"
                  min="1"
                  max="100000"
                  required
                  class="field"
                />
              </label>
              <div v-else class="text-sm font-semibold">
                Nombre d'exemplaires
                <p class="field flex items-center gap-2 !bg-cream">
                  <span class="text-lg leading-none">∞</span> Illimité
                </p>
              </div>

              <div class="text-sm font-semibold sm:col-span-2">
                Image de la carte (PNG)
                <label
                  class="dropzone mt-1"
                  :class="{ 'dropzone--filled': editFile }"
                  @dragover.prevent
                  @drop.prevent="setEditFile(($event.dataTransfer?.files?.[0] as File) ?? null)"
                >
                  <img
                    :src="editFileUrl ?? c.imageUrl"
                    alt=""
                    class="pixelated size-14 shrink-0 border-2 border-ink bg-white"
                  />
                  <span class="min-w-0 font-normal">
                    <span class="block font-semibold">
                      {{ editFile ? editFile.name : 'Remplacer l’image (optionnel)' }}
                    </span>
                    <span v-if="editKey" class="block truncate text-xs">
                      Clé sur le CDN : <code>sprites/{{ editKey }}.png</code>
                    </span>
                  </span>
                  <input
                    ref="editInput"
                    type="file"
                    accept="image/png"
                    class="sr-only"
                    @change="onEditFile"
                  />
                </label>
              </div>

              <div class="flex flex-wrap gap-2 sm:col-span-2">
                <button type="submit" class="btn btn-primary" :disabled="saving">
                  <PixelIcon name="check" :size="16" />
                  {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
                </button>
                <button type="button" class="btn btn-secondary" :disabled="saving" @click="closeEdit">
                  Fermer
                </button>
                <button
                  v-if="c.scheduledChange"
                  type="button"
                  class="btn btn-secondary"
                  @click="cancelChange(c)"
                >
                  Annuler le changement prévu
                </button>
              </div>
            </div>

            <div class="mx-auto w-44 self-start lg:w-full">
              <p class="mb-1 text-xs font-bold tracking-wider uppercase">Aperçu</p>
              <CreatureCard :creature="editPreview" :description="edit.description" />
            </div>
          </form>
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
/* Zone de dépôt d'image : cliquable, avec aperçu. */
.dropzone {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  border: 2px dashed var(--color-ink);
  background: white;
  padding: 0.625rem;
}
.dropzone--filled {
  border-style: solid;
}
.dropzone:hover {
  background: var(--color-mist, #f1f1f1);
}
</style>
