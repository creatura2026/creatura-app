<script setup lang="ts">
const base = import.meta.env.BASE_URL
const img = (name: string) => base + 'guide-images/' + name
</script>

<template>
  <div class="guide">
    <nav class="toc" aria-label="Sommaire">
      <h2>Sommaire</h2>
      <ol>
        <li><a href="#creer-un-compte">1. Créer un compte</a></li>
        <li><a href="#se-connecter">2. Se connecter</a></li>
        <li><a href="#accueil">3. Tableau de bord (accueil)</a></li>
        <li><a href="#booster">4. Booster quotidien</a></li>
        <li><a href="#catalogue">5. Catalogue des créatures</a></li>
        <li><a href="#collection">6. Ma collection</a></li>
        <li><a href="#echanges">7. Échanges</a></li>
        <li><a href="#salle-echange">8. La salle d'échange</a></li>
        <li><a href="#profil">9. Mon profil</a></li>
        <li><a href="#securite">10. Sécurité du compte</a></li>
        <li><a href="#application">11. Télécharger l'application</a></li>
      </ol>
    </nav>

    <section id="creer-un-compte">
      <h2>1. Créer un compte</h2>
      <p>Si vous n'avez pas encore de compte, rendez-vous sur la page d'accueil publique du site.
        Vous y trouverez deux boutons : <strong>Créer un compte</strong> et <strong>J'ai déjà un compte</strong>.</p>
      <figure class="screenshot">
        <img :src="img('01-accueil-public.png')" alt="Page d'accueil publique de Créatura" />
        <figcaption>Page d'accueil — boutons de création de compte et de connexion</figcaption>
      </figure>
      <p>Cliquez sur <strong>Créer un compte</strong>, puis remplissez le formulaire :</p>
      <ol class="steps">
        <li>Choisissez un <strong>pseudonyme</strong> — il sera visible par les autres joueurs lors des échanges.</li>
        <li>Entrez votre <strong>adresse e-mail</strong>.</li>
        <li>Choisissez un <strong>mot de passe</strong> d'au moins 8 caractères.</li>
        <li>Cliquez sur <strong>Créer mon compte</strong> pour valider.</li>
      </ol>
      <figure class="screenshot">
        <img :src="img('02-inscription.png')" alt="Formulaire d'inscription" />
        <figcaption>Formulaire d'inscription — remplissez tous les champs puis validez</figcaption>
      </figure>
      <div class="tip mint">
        <span class="tip-icon">&#x2139;&#xfe0f;</span>
        <p>Votre pseudonyme est public et ne peut pas être modifié après création.</p>
      </div>
    </section>

    <section id="se-connecter">
      <h2>2. Se connecter</h2>
      <p>Si vous avez déjà un compte, cliquez sur <strong>Se connecter</strong> depuis la page d'accueil
        ou rendez-vous directement sur <code>/connexion</code>.</p>
      <ol class="steps">
        <li>Entrez votre <strong>adresse e-mail</strong>.</li>
        <li>Entrez votre <strong>mot de passe</strong>.</li>
        <li>Cliquez sur <strong>Se connecter</strong>.</li>
      </ol>
      <figure class="screenshot">
        <img :src="img('03-connexion.png')" alt="Page de connexion" />
        <figcaption>Page de connexion — entrez vos identifiants puis validez</figcaption>
      </figure>
      <div class="tip butter">
        <span class="tip-icon">&#x1f513;</span>
        <p>La session reste ouverte plusieurs jours. Vous n'avez pas besoin de vous reconnecter à chaque visite.</p>
      </div>
    </section>

    <section id="accueil">
      <h2>3. Tableau de bord (accueil)</h2>
      <p>Après la connexion, vous arrivez sur votre tableau de bord. Il récapitule en un coup d'œil :</p>
      <ul>
        <li><strong>Booster du jour</strong> — disponible ou déjà ouvert.</li>
        <li><strong>Ma collection</strong> — nombre de créatures découvertes et progression.</li>
        <li><strong>Échanges</strong> — combien attendent votre réponse.</li>
        <li><strong>Catalogue</strong> — accès rapide à toutes les cartes.</li>
      </ul>
      <figure class="screenshot">
        <img :src="img('04-accueil.png')" alt="Tableau de bord" />
        <figcaption>Tableau de bord après connexion</figcaption>
      </figure>
    </section>

    <section id="booster">
      <h2>4. Booster quotidien</h2>
      <p>Chaque jour, un booster gratuit est mis à votre disposition.</p>
      <ol class="steps">
        <li>Depuis l'accueil, cliquez sur la tuile <strong>Booster du jour</strong> ou sur
          <span class="nav-pill">Booster</span> dans la barre de navigation.</li>
        <li>Si le booster du jour est disponible, cliquez sur <strong>Ouvrir le booster</strong>.</li>
        <li>Les cartes obtenues se révèlent une par une — cliquez pour passer à la suivante.</li>
        <li>Une fois toutes les cartes affichées, elles sont ajoutées à votre collection.</li>
      </ol>
      <figure class="screenshot">
        <img :src="img('05-booster.png')" alt="Page booster quotidien" />
        <figcaption>Page booster — ouverture du booster du jour</figcaption>
      </figure>
      <div class="tip sky">
        <span class="tip-icon">&#x1f4c5;</span>
        <p>Le booster se renouvelle chaque jour à minuit (heure de Paris).</p>
      </div>
    </section>

    <section id="catalogue">
      <h2>5. Catalogue des créatures</h2>
      <p>Le catalogue liste toutes les créatures du jeu, qu'elles soient dans votre collection ou non.</p>
      <h3>Filtrer et chercher</h3>
      <ul>
        <li><strong>Recherche par nom</strong> — tapez les premières lettres.</li>
        <li><strong>Famille</strong> — filtrer par type de créature (Feu, Eau, etc.).</li>
        <li><strong>Rareté</strong> — Commune, Peu commune, Rare, Très rare, Légendaire.</li>
      </ul>
      <figure class="screenshot">
        <img :src="img('06-catalogue.png')" alt="Catalogue des créatures" />
        <figcaption>Catalogue — cartes non possédées en gris, possédées en couleur</figcaption>
      </figure>
      <h3>Détail d'une créature</h3>
      <p>Cliquez sur une carte pour voir sa fiche : image, famille, rareté, description, et la liste des
        joueurs qui la possèdent (utile pour proposer un échange).</p>
      <figure class="screenshot">
        <img :src="img('07-creature-detail.png')" alt="Fiche détail d'une créature" />
        <figcaption>Fiche détail d'une créature</figcaption>
      </figure>
    </section>

    <section id="collection">
      <h2>6. Ma collection</h2>
      <p>La collection regroupe toutes les cartes que vous avez obtenues, y compris les doublons.</p>
      <figure class="screenshot">
        <img :src="img('08-collection.png')" alt="Ma collection" />
        <figcaption>Ma collection — progression et cartes possédées</figcaption>
      </figure>
      <ul>
        <li>Le <strong>compteur en haut</strong> indique combien de créatures différentes vous avez.</li>
        <li>Les <strong>doublons</strong> sont visibles sur chaque carte et échangeables.</li>
      </ul>
      <div class="tip mint">
        <span class="tip-icon">&#x1f4a1;</span>
        <p>Filtrez votre collection par rareté ou famille pour repérer rapidement les cartes manquantes.</p>
      </div>
    </section>

    <section id="echanges">
      <h2>7. Échanges</h2>
      <p>La fonction d'échange vous permet de proposer une de vos cartes à un autre joueur en contrepartie d'une des siennes.</p>
      <h3>Voir vos échanges en cours</h3>
      <p>Depuis <span class="nav-pill">Échanges</span>, retrouvez tous vos échanges actifs.
        Ceux qui <strong>attendent votre réponse</strong> apparaissent en premier.</p>
      <figure class="screenshot">
        <img :src="img('09-echanges-liste.png')" alt="Liste des échanges en cours" />
        <figcaption>Liste des échanges en cours</figcaption>
      </figure>
      <h3>Ouvrir un nouvel échange — par joueur</h3>
      <ol class="steps">
        <li>Tapez au moins 2 lettres du pseudonyme du joueur dans le champ de recherche.</li>
        <li>Sélectionnez le joueur dans la liste de résultats.</li>
        <li>Ses cartes s'affichent. Les cartes marquées <strong>Il vous la faut</strong> sont absentes de votre collection.</li>
        <li>Cliquez sur <strong>Échanger avec [pseudo]</strong> pour ouvrir la salle.</li>
      </ol>
      <figure class="screenshot">
        <img :src="img('10-nouvel-echange-joueur.png')" alt="Ouvrir un échange par joueur" />
        <figcaption>Mode « Par joueur » — cartes du joueur cible</figcaption>
      </figure>
      <h3>Ouvrir un nouvel échange — par carte</h3>
      <ol class="steps">
        <li>Utilisez les filtres pour trouver la créature souhaitée dans le catalogue.</li>
        <li>Cliquez sur la carte pour afficher la liste des joueurs qui la possèdent.</li>
        <li>Cliquez sur <strong>Échanger avec [pseudo]</strong> pour lancer la salle d'échange.</li>
      </ol>
      <figure class="screenshot">
        <img :src="img('11-nouvel-echange-carte.png')" alt="Ouvrir un échange par carte" />
        <figcaption>Mode « Par carte » — joueurs possédant la créature souhaitée</figcaption>
      </figure>
    </section>

    <section id="salle-echange">
      <h2>8. La salle d'échange</h2>
      <p>Quand une salle d'échange s'ouvre, vous et l'autre joueur vous retrouvez face à face en temps réel.</p>
      <ol class="steps">
        <li><strong>Posez votre carte</strong> — cliquez sur une carte de votre collection pour la mettre sur la table.</li>
        <li><strong>Attendez</strong> que l'autre joueur pose sa carte.</li>
        <li><strong>Confirmez</strong> l'échange une fois les deux cartes posées et les deux joueurs d'accord.</li>
        <li>Les cartes sont échangées instantanément et vos collections sont mises à jour.</li>
      </ol>
      <figure class="screenshot">
        <img :src="img('12-salle-echange.png')" alt="Salle d'échange" />
        <figcaption>Salle d'échange — chaque joueur pose sa carte avant de confirmer</figcaption>
      </figure>
      <div class="tip salmon">
        <span class="tip-icon">&#x26a0;&#xfe0f;</span>
        <p>La salle d'échange nécessite une connexion active. Ne fermez pas l'onglet pendant qu'un échange est en cours.</p>
      </div>
      <h3>Historique des échanges</h3>
      <p>Tous vos échanges terminés sont consultables depuis <span class="nav-pill">Échanges</span> &rsaquo; onglet <strong>Historique</strong>.</p>
    </section>

    <section id="profil">
      <h2>9. Mon profil</h2>
      <p>La page <span class="nav-pill">Profil</span> centralise vos informations personnelles et votre progression.</p>
      <ul>
        <li><strong>Pseudonyme</strong>, rôle et date d'inscription.</li>
        <li><strong>Progression</strong> : créatures découvertes, pourcentage de complétion, total de cartes.</li>
        <li><strong>Se déconnecter</strong> — ferme votre session sur cet appareil uniquement.</li>
      </ul>
      <figure class="screenshot">
        <img :src="img('13-profil.png')" alt="Page profil" />
        <figcaption>Page profil — informations, progression et déconnexion</figcaption>
      </figure>
    </section>

    <section id="securite">
      <h2>10. Sécurité du compte</h2>
      <p>Les options de sécurité se trouvent sur la page <span class="nav-pill">Profil</span>,
        dans la section <strong>Sécurité</strong>.</p>
      <h3>Changer de mot de passe</h3>
      <ol class="steps">
        <li>Entrez votre <strong>mot de passe actuel</strong>.</li>
        <li>Saisissez le <strong>nouveau mot de passe</strong>, puis confirmez-le.</li>
        <li>Cliquez sur <strong>Changer le mot de passe</strong>.</li>
      </ol>
      <figure class="screenshot">
        <img :src="img('14-securite-mdp.png')" alt="Formulaire de changement de mot de passe" />
        <figcaption>Section sécurité — formulaire de changement de mot de passe</figcaption>
      </figure>
      <div class="tip butter">
        <span class="tip-icon">&#x1f512;</span>
        <p>Changer votre mot de passe déconnecte automatiquement vos autres appareils.</p>
      </div>
      <h3>Supprimer son compte</h3>
      <p>Dans la <strong>Zone sensible</strong> en bas de <span class="nav-pill">Profil</span>.
        La suppression est <strong>définitive et irréversible</strong>.</p>
      <ol class="steps">
        <li>Faites défiler jusqu'à la <strong>Zone sensible</strong>.</li>
        <li>Cliquez sur <strong>Supprimer mon compte</strong>.</li>
        <li>Confirmez en saisissant votre mot de passe.</li>
      </ol>
      <div class="tip salmon">
        <span class="tip-icon">&#x26a0;&#xfe0f;</span>
        <p>Cette action est irréversible. Vous apparaîtrez comme « Joueur supprimé » dans l'historique des autres joueurs.</p>
      </div>
    </section>

    <section id="application">
      <h2>11. Télécharger l'application</h2>
      <h3>Application Windows</h3>
      <p>Depuis la page d'accueil publique, cliquez sur <strong>Télécharger pour Windows</strong>.
        L'installateur (<code>.exe</code>) est disponible dans la section
        <a href="/telechargements/">Téléchargements</a>.</p>
      <figure class="screenshot">
        <img :src="img('15-telechargement-windows.png')" alt="Téléchargement Windows" />
        <figcaption>Bouton de téléchargement Windows sur la page d'accueil</figcaption>
      </figure>
      <h3>Application Android</h3>
      <p>Depuis un téléphone Android, la page d'accueil propose directement
        <strong>Installer l'application Android</strong>.</p>
      <div class="tip sky">
        <span class="tip-icon">&#x1f4f1;</span>
        <p>Sur Android, autorisez l'installation depuis une source inconnue pour continuer.</p>
      </div>
    </section>
  </div>
</template>

<style>
.guide { --guide-accent: var(--color-sun, #fcd34d); }
</style>
