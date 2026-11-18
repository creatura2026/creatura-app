<template>
  <div class="guide">
    <div class="tip salmon">
      <span class="tip-icon">&#x1f512;</span>
      <p>Ce guide est réservé aux administrateurs. L'interface d'administration est accessible sur
        <strong>/admin/</strong> et requiert un compte avec le rôle Administrateur.</p>
    </div>

    <nav class="toc" aria-label="Sommaire" style="margin-top:1.5rem">
      <h2>Sommaire</h2>
      <ol>
        <li><a href="#connexion">1. Connexion et accès</a></li>
        <li><a href="#tableau-de-bord">2. Tableau de bord et statistiques</a></li>
        <li><a href="#cartes">3. Gestion des cartes (créatures)</a></li>
        <li><a href="#sprite">4. Ajouter ou modifier le sprite d'une carte</a></li>
        <li><a href="#rarete">5. Programmer un changement de rareté</a></li>
        <li><a href="#joueurs">6. Gestion des joueurs</a></li>
        <li><a href="#suppressions">7. Demandes de suppression de compte</a></li>
        <li><a href="#administrateurs">8. Comptes administrateurs</a></li>
        <li><a href="#reglages">9. Réglages du booster</a></li>
        <li><a href="#compte">10. Mon compte administrateur</a></li>
      </ol>
    </nav>

    <section id="connexion">
      <h2>1. Connexion et accès</h2>
      <p>
        L'interface d'administration se trouve à l'adresse <strong>/admin/</strong>.
        Entrez votre adresse e-mail et votre mot de passe administrateur.
      </p>
      <figure class="screenshot">
        <img :src="'/guide-images/Admin_login_Page.png'" alt="Page de connexion admin" />
        <figcaption>Page de connexion de l'interface d'administration</figcaption>
      </figure>
      <div class="tip butter">
        <span class="tip-icon">&#x1f511;</span>
        <p>Si vous vous connectez pour la première fois avec un mot de passe provisoire, vous serez
          automatiquement redirigé vers la page de changement de mot de passe avant d'accéder au tableau de bord.</p>
      </div>
      <h3>Accès refusé</h3>
      <p>Si vous vous connectez avec un compte joueur (sans rôle Administrateur), la page
        <strong>Accès refusé</strong> s'affiche. Contactez un administrateur existant pour faire élever votre compte.</p>
    </section>

    <section id="tableau-de-bord">
      <h2>2. Tableau de bord et statistiques</h2>
      <p>Le tableau de bord (<span class="nav-pill">Dashboard</span>) affiche les indicateurs clés
        de la plateforme sur la période choisie.</p>
      <figure class="screenshot">
        <img :src="'/guide-images/Admin_Dashboard_Page.png'" alt="Tableau de bord admin" />
        <figcaption>Tableau de bord — statistiques générales</figcaption>
      </figure>
      <ul>
        <li><strong>Joueurs actifs</strong> — nombre de joueurs connectés sur la période.</li>
        <li><strong>Échanges</strong> — nombre d'échanges réalisés.</li>
        <li><strong>Distribution des raretés</strong> — répartition des cartes en circulation.</li>
        <li><strong>Échanges récents</strong> — historique des derniers échanges.</li>
      </ul>
      <p>Utilisez le sélecteur de <strong>période</strong> en haut de page (aujourd'hui, 7 jours, 30 jours, etc.)
        pour ajuster la fenêtre temporelle.</p>
    </section>

    <section id="cartes">
      <h2>3. Gestion des cartes (créatures)</h2>
      <p>La page <span class="nav-pill">Cartes</span> liste toutes les créatures disponibles
        dans le jeu, y compris celles dont la rareté sera modifiée au prochain minuit.</p>
      <figure class="screenshot">
        <img :src="'/guide-images/Liste_Des_Cartes.png'" alt="Liste des cartes" />
        <figcaption>Liste des cartes — toutes les créatures du jeu</figcaption>
      </figure>
      <h3>Ajouter une nouvelle carte</h3>
      <p>Cliquez sur <strong>Nouvelle carte</strong>. Un formulaire s'ouvre :</p>
      <ol class="steps">
        <li>Saisissez le <strong>nom</strong> de la créature (ex. : <em>Aquila Pyro</em>).</li>
        <li>Choisissez sa <strong>famille</strong> (Feu, Eau, Terre, Air, etc.).</li>
        <li>Choisissez sa <strong>rareté</strong> initiale (Commune, Peu commune, Rare, Très rare, Légendaire).</li>
        <li>Ajoutez une <strong>description</strong> (optionnelle).</li>
        <li>Sélectionnez le <strong>fichier PNG</strong> du sprite. Le nom du fichier détermine la clé S3 ;
          il doit être en minuscules avec des tirets bas (ex. : <code>aquila_pyro.png</code>).</li>
        <li>Cliquez sur <strong>Ajouter la carte</strong>.</li>
      </ol>
      <figure class="screenshot">
        <img :src="'/guide-images/Gestion_des_cartes.png'" alt="Formulaire de création d'une carte" />
        <figcaption>Formulaire de création — nom, famille, rareté, description et sprite PNG</figcaption>
      </figure>
      <div class="tip mint">
        <span class="tip-icon">&#x1f4c4;</span>
        <p>La carte est créée et le sprite est uploadé en une seule étape. Si l'upload du sprite échoue,
          la carte est tout de même créée et vous pouvez réessayer via <strong>Modifier le sprite</strong>.</p>
      </div>
      <div class="tip sky">
        <span class="tip-icon">&#x1f4a1;</span>
        <p>La nouvelle carte n'apparaît dans les boosters et le catalogue joueur qu'à partir du
          <strong>prochain minuit (heure de Paris)</strong>, après le recalcul des probabilités.</p>
      </div>
    </section>

    <section id="sprite">
      <h2>4. Ajouter ou modifier le sprite d'une carte</h2>
      <p>Le sprite est l'image PNG affichée sur la carte dans le jeu. Il est stocké sur le CDN
        sous <code>sprites/&lt;nom&gt;.png</code>.</p>
      <h3>Depuis la liste des cartes</h3>
      <ol class="steps">
        <li>Trouvez la carte dans la liste <span class="nav-pill">Cartes</span>.</li>
        <li>Cliquez sur <strong>Modifier le sprite</strong> (ou l'icône d'upload sur la carte).</li>
        <li>Sélectionnez le fichier PNG depuis votre ordinateur.</li>
        <li>L'upload démarre automatiquement. Une confirmation s'affiche en cas de succès.</li>
      </ol>
      <figure class="screenshot">
        <img :src="'/guide-images/modif_sprite.png'" alt="Upload d'un sprite" />
        <figcaption>Upload du sprite depuis la fiche d'une carte</figcaption>
      </figure>
      <div class="tip butter">
        <span class="tip-icon">&#x1f5bc;&#xfe0f;</span>
        <p>Le fichier doit être un <strong>PNG</strong>, taille recommandée <strong>128 × 128 pixels</strong>
          avec fond transparent. Utilisez des minuscules et des tirets bas uniquement.</p>
      </div>
      <div class="tip salmon">
        <span class="tip-icon">&#x26a0;&#xfe0f;</span>
        <p>Remplacer un sprite existant invalide le cache CDN. Les joueurs verront le nouveau sprite
          dans les minutes qui suivent.</p>
      </div>
    </section>

    <section id="rarete">
      <h2>5. Programmer un changement de rareté</h2>
      <p>Vous pouvez modifier la rareté d'une carte. Le changement prend effet au
        <strong>prochain minuit (heure de Paris)</strong> afin de ne pas perturber les boosters en cours.</p>
      <ol class="steps">
        <li>Dans la liste <span class="nav-pill">Cartes</span>, cliquez sur la carte concernée.</li>
        <li>Cliquez sur <strong>Programmer un changement de rareté</strong>.</li>
        <li>Choisissez la nouvelle rareté dans le menu déroulant.</li>
        <li>Confirmez. La fiche affiche alors les deux raretés : l'actuelle et la prochaine.</li>
      </ol>
      <figure class="screenshot">
        <img :src="'/guide-images/Modif_rarete.png'" alt="Changement de rareté programmé" />
        <figcaption>Rareté actuelle et future sur une carte en attente de changement</figcaption>
      </figure>
      <h3>Annuler un changement programmé</h3>
      <p>Tant que minuit n'est pas passé, cliquez sur <strong>Annuler le changement de rareté</strong>
        sur la fiche de la carte.</p>
    </section>

    <section id="joueurs">
      <h2>6. Gestion des joueurs</h2>
      <p>La page <span class="nav-pill">Joueurs</span> liste tous les joueurs inscrits sur la plateforme.</p>
      <figure class="screenshot">
        <img :src="'/guide-images/Liste_Joueur.png'" alt="Liste des joueurs" />
        <figcaption>Liste des joueurs</figcaption>
      </figure>
      <h3>Fiche joueur</h3>
      <p>Cliquez sur un joueur pour afficher sa fiche détaillée :</p>
      <ul>
        <li>Pseudonyme, e-mail, date d'inscription, statut du compte.</li>
        <li>Sa collection de cartes et sa progression.</li>
        <li>Ses échanges récents.</li>
        <li>Possibilité de <strong>soumettre une demande de suppression de compte</strong> pour ce joueur.</li>
      </ul>
      <figure class="screenshot">
        <img :src="'/guide-images/fiche_joueur.png'" alt="Fiche détail d'un joueur" />
        <figcaption>Fiche détail d'un joueur — informations, collection et historique</figcaption>
      </figure>
    </section>

    <section id="suppressions">
      <h2>7. Demandes de suppression de compte</h2>
      <p>La suppression d'un compte joueur nécessite une validation par un <strong>second administrateur</strong>
        (pas celui qui fait la demande). Ce mécanisme évite les suppressions accidentelles.</p>
      <h3>Soumettre une demande</h3>
      <ol class="steps">
        <li>Allez sur la fiche du joueur à supprimer (page <span class="nav-pill">Joueurs</span>).</li>
        <li>Cliquez sur <strong>Demander la suppression</strong>.</li>
        <li>Choisissez l'administrateur validateur dans la liste.</li>
        <li>La demande est créée avec le statut <strong>En attente</strong>.</li>
      </ol>
      <h3>Valider ou refuser une demande</h3>
      <p>Si vous êtes le validateur désigné, un <strong>badge de notification</strong>
        apparaît sur l'onglet <span class="nav-pill">Joueurs</span>.</p>
      <ol class="steps">
        <li>Ouvrez la page <span class="nav-pill">Joueurs</span> et consultez les demandes en attente.</li>
        <li>Examinez la demande et cliquez sur <strong>Approuver</strong> ou <strong>Refuser</strong>.</li>
        <li>En cas d'approbation, le compte est supprimé (anonymisé) immédiatement.</li>
      </ol>
      <figure class="screenshot">
        <img :src="'/guide-images/Demande_suppression.png'" alt="Demandes de suppression" />
        <figcaption>Demandes de suppression en attente de validation</figcaption>
      </figure>
      <div class="tip salmon">
        <span class="tip-icon">&#x26a0;&#xfe0f;</span>
        <p>La suppression d'un compte est <strong>irréversible</strong>. Le joueur apparaîtra comme
          « Joueur supprimé » dans l'historique des échanges des autres joueurs.</p>
      </div>
      <h3>Annuler une demande</h3>
      <p>L'administrateur qui a soumis la demande peut l'annuler tant qu'elle est en statut <strong>En attente</strong>.</p>
    </section>

    <section id="administrateurs">
      <h2>8. Comptes administrateurs</h2>
      <p>La page <span class="nav-pill">Administrateurs</span> liste tous les comptes admin actifs.</p>
      <figure class="screenshot">
        <img :src="'/guide-images/admin_list.png'" alt="Liste des administrateurs" />
        <figcaption>Liste des comptes administrateurs</figcaption>
      </figure>
      <h3>Créer un compte administrateur</h3>
      <ol class="steps">
        <li>Cliquez sur <strong>Nouvel administrateur</strong>.</li>
        <li>Saisissez le <strong>pseudonyme</strong> et l'<strong>adresse e-mail</strong> du nouvel admin.</li>
        <li>Un mot de passe provisoire est généré. Transmettez-le par un canal sécurisé.</li>
        <li>Lors de sa première connexion, il sera invité à changer ce mot de passe.</li>
      </ol>
      <div class="tip butter">
        <span class="tip-icon">&#x1f4e7;</span>
        <p>Ne transmettez pas le mot de passe provisoire par e-mail non chiffré.</p>
      </div>
      <h3>Désactiver un administrateur</h3>
      <ol class="steps">
        <li>Trouvez l'administrateur dans la liste.</li>
        <li>Cliquez sur <strong>Désactiver</strong>.</li>
        <li>Ses demandes de suppression en attente sont automatiquement annulées.</li>
      </ol>
      <div class="tip sky">
        <span class="tip-icon">&#x1f6ab;</span>
        <p>Vous ne pouvez pas désactiver votre propre compte.</p>
      </div>
    </section>

    <section id="reglages">
      <h2>9. Réglages du booster</h2>
      <p>La page <span class="nav-pill">Réglages</span> permet de configurer le nombre de cartes
        distribués par booster quotidien.</p>
      <figure class="screenshot">
        <img :src="'/guide-images/modif_booster.png'" alt="Réglages du booster" />
        <figcaption>Configuration du booster quotidien</figcaption>
      </figure>
      <ul>
        <li><strong>Nombre de cartes par booster</strong> — combien de cartes un joueur reçoit à l'ouverture.</li>
        <li>Les modifications prennent effet au <strong>prochain booster ouvert</strong>.</li>
      </ul>
      <div class="tip mint">
        <span class="tip-icon">&#x1f3af;</span>
        <p>Un booster de 5 cartes est un bon équilibre entre progression rapide et longévité du jeu.</p>
      </div>
    </section>

    <section id="compte">
      <h2>10. Mon compte administrateur</h2>
      <p>Cliquez sur <span class="nav-pill">Mon compte</span> pour gérer votre propre compte.</p>
      <h3>Changer de mot de passe</h3>
      <ol class="steps">
        <li>Entrez votre <strong>mot de passe actuel</strong>.</li>
        <li>Entrez le <strong>nouveau mot de passe</strong> et confirmez-le.</li>
        <li>Cliquez sur <strong>Changer le mot de passe</strong>.</li>
      </ol>
      <p>Changer le mot de passe déconnecte vos autres sessions actives.</p>
      <h3>Se déconnecter</h3>
      <p>Cliquez sur <strong>Se déconnecter</strong> depuis <span class="nav-pill">Mon compte</span>
        ou depuis la navigation principale.</p>
      <div class="tip salmon">
        <span class="tip-icon">&#x1f512;</span>
        <p>Déconnectez-vous toujours lorsque vous quittez un poste partagé.</p>
      </div>
    </section>
  </div>
</template>

<style>
.guide { --guide-accent: var(--color-salmon, #fecaca); }
</style>
