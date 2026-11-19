<script setup lang="ts">
/** Mentions légales du site (page publique). */
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const backTo = computed(() => (auth.isAuthenticated ? '/accueil' : '/'))
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-8">
    <RouterLink :to="backTo" class="btn btn-secondary mb-6">&larr; Retour</RouterLink>

    <h1 class="font-pixel text-3xl font-bold">Mentions légales</h1>
    <p class="mt-2 text-sm text-ink/80">Dernière mise à jour : 2026.</p>

    <div class="mt-6 flex flex-col gap-6 text-sm leading-relaxed">
      <section>
        <h2 class="font-sans text-lg font-bold">Éditeur du site</h2>
        <p class="mt-1">
          Créatura — projet d’intégration DLTQ 2026, réalisé dans un cadre pédagogique. Édité par
          l’équipe du projet. Nom, statut et adresse : [à compléter par l’équipe].
        </p>
      </section>

      <section>
        <h2 class="font-sans text-lg font-bold">Directeur de la publication</h2>
        <p class="mt-1">[Nom du responsable — à compléter par l’équipe].</p>
      </section>

      <section>
        <h2 class="font-sans text-lg font-bold">Contact</h2>
        <p class="mt-1">[Adresse e-mail de contact — à compléter par l’équipe].</p>
      </section>

      <section>
        <h2 class="font-sans text-lg font-bold">Hébergement</h2>
        <p class="mt-1">
          Site et données hébergés sur Amazon Web Services (AWS), région Europe (Stockholm,
          eu-north-1). Amazon Web Services EMEA SARL, 38 avenue John F. Kennedy, L-1855 Luxembourg.
        </p>
      </section>

      <section>
        <h2 class="font-sans text-lg font-bold">Propriété intellectuelle</h2>
        <p class="mt-1">
          Les contenus de ce site (nom, interface, illustrations des créatures, textes) sont la
          propriété de l’équipe du projet et protégés par le droit d’auteur. Toute reproduction sans
          autorisation est interdite.
        </p>
      </section>

      <section>
        <h2 class="font-sans text-lg font-bold">Données personnelles</h2>
        <p class="mt-1">
          Les comptes joueurs enregistrent un pseudonyme, un identifiant et un mot de passe chiffré,
          uniquement pour le fonctionnement du jeu. Conformément au RGPD, vous pouvez demander
          l’accès, la rectification ou la suppression de vos données via le contact ci-dessus. La
          suppression du compte est possible depuis votre profil.
        </p>
      </section>

      <section>
        <h2 class="font-sans text-lg font-bold">Nature du projet</h2>
        <p class="mt-1">
          Créatura est un projet étudiant. Aucun combat, aucun achat en argent réel et aucune
          transaction financière ne sont proposés : le jeu se limite à la collection et à l’échange
          de cartes virtuelles.
        </p>
      </section>
    </div>
  </div>
</template>
