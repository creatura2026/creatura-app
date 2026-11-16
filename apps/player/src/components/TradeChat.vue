<script setup lang="ts">
/** Discussion de la salle d'échange : les messages des deux joueurs, et le champ pour écrire. */
import { nextTick, ref, useId, watch } from 'vue'
import type { TradeMessage } from '@creatura/shared/api/types'
import PixelIcon from '@creatura/shared/ui/PixelIcon.vue'

const props = defineProps<{
  messages: TradeMessage[]
  meId: string
  /** Pseudo de l'autre joueur, pour le texte d'accueil. */
  partner: string
  /** L'autre joueur est dans la salle en ce moment. */
  partnerOnline: boolean
  /** Échange terminé : on relit la discussion, on n'écrit plus. */
  closed?: boolean
}>()
const emit = defineEmits<{ send: [text: string] }>()

const MAX = 500
const id = useId()
const draft = ref('')
const list = ref<HTMLOListElement | null>(null)

const timeFmt = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
})

function send() {
  const text = draft.value.trim()
  if (!text) return
  emit('send', text)
  draft.value = ''
}

/** Entrée envoie, Maj + Entrée passe à la ligne. */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
}

// Un nouveau message fait défiler jusqu'en bas, sauf si le joueur relit plus haut.
watch(
  () => props.messages.length,
  async (_now, before) => {
    const el = list.value
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    await nextTick()
    if (atBottom || !before) el.scrollTop = el.scrollHeight
  },
  { immediate: true, flush: 'pre' },
)
</script>

<template>
  <section class="card-pixel-sm flex min-h-0 flex-col bg-white" aria-labelledby="chat-title">
    <header class="flex items-center justify-between gap-2 border-b-2 border-ink px-4 py-2.5">
      <h2 id="chat-title" class="font-bold">Discussion</h2>
      <p class="flex items-center gap-1.5 text-xs font-semibold">
        <span
          class="size-2.5 border-2 border-ink"
          :class="partnerOnline ? 'bg-leaf' : 'bg-mist'"
          aria-hidden="true"
        />
        {{ partner }} {{ partnerOnline ? 'est là' : 'est absent' }}
      </p>
    </header>

    <ol
      ref="list"
      class="flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3"
      aria-live="polite"
      aria-relevant="additions"
    >
      <li v-if="!messages.length" class="m-auto max-w-56 text-center text-sm text-ink/70">
        Écrivez à {{ partner }} pour vous mettre d’accord.
      </li>
      <li
        v-for="m in messages"
        :key="m.id"
        class="flex max-w-[85%] flex-col"
        :class="m.author.id === meId ? 'items-end self-end' : 'items-start self-start'"
      >
        <span
          class="border-2 border-ink px-3 py-1.5 text-sm break-words whitespace-pre-line"
          :class="m.author.id === meId ? 'bg-sky' : 'bg-cream'"
        >
          <span class="sr-only">{{ m.author.id === meId ? 'Vous' : m.author.pseudo }} : </span>
          {{ m.text }}
        </span>
        <time class="mt-0.5 text-[0.7rem] text-ink/60" :datetime="m.sentAt">
          {{ timeFmt.format(new Date(m.sentAt)) }}
        </time>
      </li>
    </ol>

    <p v-if="closed" class="border-t-2 border-ink bg-mist px-4 py-3 text-sm">
      L’échange est terminé, la discussion est fermée.
    </p>
    <form v-else class="flex items-end gap-2 border-t-2 border-ink p-3" @submit.prevent="send">
      <label :for="id" class="sr-only">Message à {{ partner }}</label>
      <textarea
        :id="id"
        v-model="draft"
        rows="1"
        :maxlength="MAX"
        class="field-input max-h-32 min-h-11 flex-1 resize-none [field-sizing:content]"
        placeholder="Votre message…"
        @keydown="onKeydown"
      />
      <button
        type="submit"
        class="btn btn-primary !px-3"
        :disabled="!draft.trim()"
        aria-label="Envoyer le message"
      >
        <PixelIcon name="arrow-right" :size="20" />
      </button>
    </form>
  </section>
</template>
