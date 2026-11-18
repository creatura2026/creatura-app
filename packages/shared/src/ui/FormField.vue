<script setup lang="ts">
/** Champ de formulaire accessible : libellé, aide et erreur reliés à l'input. */
import { computed, ref, useId } from 'vue'

const model = defineModel<string>({ default: '' })
const props = withDefaults(
  defineProps<{
    label: string
    type?: 'text' | 'password' | 'search'
    error?: string
    hint?: string
    autocomplete?: string
    placeholder?: string
    /**
     * Complément du nom du bouton « Afficher » d'un mot de passe, lu par les lecteurs d'écran :
     * « Afficher le mot de passe actuel ». Distinct pour chaque champ d'un même formulaire (RGAA 11.9).
     */
    revealLabel?: string
  }>(),
  { type: 'text', revealLabel: 'le mot de passe' },
)
defineEmits<{ blur: [] }>()

const id = useId()
const reveal = ref(false)
const inputType = computed(() => (props.type === 'password' && reveal.value ? 'text' : props.type))
const describedBy = computed(
  () =>
    [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
    undefined,
)
</script>

<template>
  <div>
    <label :for="id" class="field-label">{{ label }}</label>
    <div class="relative">
      <input
        :id="id"
        v-model="model"
        :type="inputType"
        :autocomplete="autocomplete"
        :placeholder="placeholder"
        :aria-invalid="error ? 'true' : 'false'"
        :aria-describedby="describedBy"
        class="field-input"
        :class="type === 'password' ? 'pr-24' : ''"
        autocapitalize="off"
        spellcheck="false"
        @blur="$emit('blur')"
      />
      <!--
        Bouton bascule : son nom reste « Afficher … » et aria-pressed dit s'il est enfoncé.
        À l'écran, l'état enfoncé se voit au fond encre, comme les filtres (.chip).
      -->
      <button
        v-if="type === 'password'"
        type="button"
        class="absolute inset-y-0.5 right-0.5 cursor-pointer px-3 text-sm font-semibold underline underline-offset-2 aria-pressed:bg-ink aria-pressed:text-cream aria-pressed:no-underline"
        :aria-pressed="reveal"
        @click="reveal = !reveal"
      >
        Afficher<span class="sr-only"> {{ revealLabel }}</span>
      </button>
    </div>
    <p v-if="hint && !error" :id="`${id}-hint`" class="mt-1 text-sm text-ink/75">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="field-error">{{ error }}</p>
  </div>
</template>
