<script setup lang="ts">
/**
 * Face d'une carte de créature, utilisée partout (catalogue, collection, booster, échanges).
 *
 * Fenêtre d'illustration teintée par la famille (trame pixel + ombre au sol), puis le nom, la
 * famille et la rareté, et des gemmes de rareté de la couleur de la rareté. Une carte non possédée
 * montre la silhouette de la créature sur fond hachuré.
 *
 * La carte a partout le format du booster : 5:8 en hauteur (150 × 240), sa hauteur suit sa largeur.
 * Pour que le contenu tienne aussi dans une carte étroite, il se règle sur la largeur de la carte
 * elle-même (requêtes de conteneur `@[…]`), pas sur celle de l'écran. Attention : ces seuils
 * portent sur la largeur INTÉRIEURE de la carte, soit 20px de moins que la carte (bordure et marge).
 *  - en dessous de 8rem (carte de moins de 148px) : illustration et nom plus petits. La carte du
 *    booster (150px) reste donc au grand format ;
 *  - en dessous de 5.5rem (carte de moins de 108px) : la ligne famille · rareté disparaît, les
 *    gemmes disent déjà la rareté ;
 *  - la description n'est qu'un extrait, coupé au nombre de lignes qui tient dans la carte à cette
 *    largeur, même si la ligne famille · rareté passe sur deux lignes (le texte complet est sur la
 *    fiche de la créature).
 * Dans une grille, utiliser `.card-grid` (theme.css).
 */
import { computed } from 'vue'
import type { CreatureSummary } from '../api/types'
import { familyTint } from '../family'
import RarityGems from './RarityGems.vue'

const props = withDefaults(
  defineProps<{
    creature: CreatureSummary
    /** Carte non possédée : silhouette sur fond hachuré, comme les manques du document. */
    missing?: boolean
    /** Quantité possédée à afficher sous la carte. */
    quantity?: number
    description?: string
    size?: 'sm' | 'md'
    /** Mise en avant (carte nouvelle, sélection). */
    highlight?: boolean
  }>(),
  { missing: false, size: 'md', highlight: false },
)

const isEgg = computed(() => props.creature.imageUrl.startsWith('data:'))
</script>

<template>
  <article
    class="@container relative flex aspect-[5/8] h-full flex-col bg-white text-ink"
    :class="[
      missing ? 'border-2 border-dashed border-ink' : 'card-pixel-sm rarity-frame',
      size === 'sm' ? 'gap-1.5 p-1.5 pb-2' : 'gap-2 p-2 pb-3',
      highlight && !missing ? 'outline-4 outline-offset-2 outline-sun' : '',
    ]"
    :data-rarity="missing ? undefined : creature.rarity.code"
    :aria-label="missing ? `${creature.name}, non possédée` : creature.name"
  >
    <!-- Fenêtre d'illustration -->
    <div
      class="card-window relative flex shrink-0 items-center justify-center overflow-hidden border-2"
      :class="[
        size === 'sm' ? 'h-16 sm:h-20' : 'h-16 @[8rem]:h-24 sm:@[8rem]:h-28',
        missing ? 'hatched border-dashed border-ink/40' : 'border-ink',
      ]"
      :style="missing ? undefined : { backgroundColor: familyTint(creature.family.code) }"
    >
      <span v-if="!missing" class="card-ground" aria-hidden="true" />
      <img
        :src="creature.imageUrl"
        :alt="missing ? '' : `Illustration de ${creature.name}`"
        class="pixelated relative h-full w-auto object-contain"
        :class="[isEgg ? 'p-2' : 'p-1', missing ? 'card-silhouette' : '']"
        loading="lazy"
        draggable="false"
      />
    </div>

    <div class="flex flex-1 flex-col items-center gap-1 px-1 text-center">
      <h3
        class="leading-tight font-bold"
        :class="size === 'sm' ? 'text-sm' : 'text-sm @[8rem]:text-base sm:@[8rem]:text-lg'"
      >
        {{ creature.name }}
      </h3>
      <p class="hidden text-xs leading-snug text-ink/80 @[5.5rem]:block sm:@[8rem]:text-sm">
        {{ creature.family.label }} · {{ creature.rarity.label }}
      </p>
      <RarityGems
        :code="creature.rarity.code"
        :label="creature.rarity.label"
        :size="size === 'sm' ? 12 : 16"
      />
      <!-- Extrait : le nombre de lignes suit la place qu'offre la largeur de la carte -->
      <p
        v-if="description"
        class="line-clamp-2 text-xs leading-snug text-ink/80 @[8rem]:line-clamp-1 @[8.75rem]:line-clamp-2 @[10.25rem]:line-clamp-3 @[11.25rem]:line-clamp-4 @[12.75rem]:line-clamp-5 sm:@[11.25rem]:text-sm"
      >
        {{ description }}
      </p>
      <!-- Pied de carte : reste en bas quand la carte est plus haute que son contenu -->
      <p v-if="missing" class="mt-auto pt-1 text-xs font-semibold">Non possédée</p>
      <p v-else-if="quantity !== undefined" class="mt-auto pt-1 text-xs sm:text-sm">
        Possédées : <strong>{{ quantity }}</strong>
      </p>
    </div>
    <slot />
  </article>
</template>
