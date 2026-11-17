# CREATURA

Jeu de cartes à collectionner : un booster par jour, une collection à compléter, des échanges et
des dons entre joueurs, et un dashboard pour les administrateurs.

| Dossier | Rôle |
|---|---|
| `apps/player` | PWA joueur, mobile d'abord (UC-01 à UC-11) |
| `apps/admin` | Dashboard administrateur Web / Desktop (UC-12 à UC-14, AS-71) |
| `apps/desktop` | Application Windows (.exe) : la PWA joueur dans Electron |
| `apps/mobile` | Application Android (.apk) : la PWA joueur dans Capacitor |
| `packages/shared` | Thème, composants, client HTTP, types générés depuis `creatura-api.openapi.yaml`, API simulée commune |
| `backend` | API FastAPI + SQLAlchemy ([backend/README.md](backend/README.md)) |
| `db` | Schéma PostgreSQL, évolutions et données de démo ([db/README.md](db/README.md)) |
| `docs` | CI/CD ([docs/ci-cd.md](docs/ci-cd.md)) |
| `creatura-api.openapi.yaml` | Contrat de l'API, source des types du front |

## Démarrer

```sh
pnpm install

# Avec le vrai back (base + API dans Docker, voir backend/README.md)
cd db && docker compose up -d && cd ../backend && docker compose up -d --build && cd ..
pnpm dev:player        # http://localhost:5173, relaie /api vers http://localhost:8000
pnpm dev:admin         # dashboard (port suivant)

# Sans back : API simulée dans le navigateur
pnpm dev:player:mock
pnpm dev:admin:mock

pnpm build             # vérification des types + build des apps
```

Autre adresse d'API pour le serveur de dev : variable `API_PROXY_TARGET`.

Tests :
- front : `pnpm --filter player test:unit` et `pnpm --filter admin test:unit` ;
- back : `cd backend && uv run pytest`, avec la base lancée.

### Comptes de démonstration

| Mode | Joueur | Admin |
|---|---|---|
| Vrai back (base locale, `CREATURA_DEMO=true`) | `joueur1` / `joueur1` (Alice), `joueur2` / `joueur2` (Bob) | `admin` / `admin` |
| API simulée | `demo` / `creatura-demo` (aussi `lina`, `noe`, `mina`, `linette`) | `admin` / `creatura-admin` |

En mode simulé, des boutons sur les pages de connexion remplissent ces identifiants. Dans le
profil joueur, « Mode démonstration » rend le booster du jour à nouveau disponible ou
réinitialise les données.

## Fonctionnalités

### Joueur

- **Booster quotidien**, collection et progression (UC-03 à UC-07). La rareté de chaque créature
  est affichée par des losanges.
- **Salle d'échange en temps réel** (UC-08 à UC-11) :
  - chaque joueur pose ses cartes sur son tapis ;
  - l'échange se conclut quand les deux ont validé ;
  - discussion et présence des joueurs en direct ;
  - recherche des joueurs par pseudonyme.
- **Message d'abandon** selon qui abandonne. Celui qui part lit « Vous avez abandonné
  l'échange », l'autre lit « *XXXX* a abandonné l'échange » (AS-58).
- **Dons de cartes** (AS-72) : offrir une carte possédée à un autre joueur.
  - Le destinataire accepte ou refuse, et le donneur peut annuler tant que le don est en attente.
  - Le transfert se fait tout ou rien, au moment de l'acceptation.
- **Mon profil** (AS-58) :
  - changer son mot de passe (actuel + nouveau deux fois), ce qui déconnecte les autres sessions ;
  - supprimer son compte, avec le mot de passe pour confirmer :
    - la collection est effacée, et les légendaires retournent au stock ;
    - les échanges en cours sont abandonnés ;
    - dans l'historique des autres joueurs, le compte apparaît comme « Joueur supprimé ».
- **Guide du joueur**, accessible depuis la navigation (nouvel onglet).

### Administrateur

- **Statistiques, échanges, raretés** (UC-12 à UC-14), sur une période choisie.
- **Cartes** :
  - création et modification des créatures ;
  - envoi du sprite PNG, dès la création, avec un aperçu de la carte.
- **Réglages du booster** : nombre de cartes par booster.
- **Joueurs** (AS-71) :
  - liste avec connexions et cartes, et fiche détaillée par joueur ;
  - la suppression d'un joueur est une demande, validée par **un autre** admin.
- **Administrateurs** (AS-71) :
  - création d'un compte admin : le serveur génère un mot de passe provisoire, à changer à la
    première connexion ;
  - désactivation d'un autre admin.
- **Mon compte** (AS-58) : changer son mot de passe, supprimer son compte. Le dernier
  administrateur ne peut pas se supprimer (409 `LAST_ADMIN`).
- **Guide de l'administrateur**, accessible depuis la navigation.

### Sessions et sécurité

- **Expiration après inactivité** (AS-64), pour le joueur comme pour l'admin :
  - sans action pendant 20 minutes (`SESSION_IDLE_MINUTES` côté back), la session expire ;
  - une fenêtre « Rester connecté » s'affiche 30 s avant la déconnexion ;
  - toute action (clic, touche, défilement) repousse l'échéance, dans tous les onglets.
- **Changer son mot de passe ferme les autres sessions** : les jetons émis avant le changement sont
  refusés.
- Les routes admin renvoient 403 à un joueur.

### Temps réel sur plusieurs serveurs (AS-54)

En ligne, le back tourne en deux répliques, et chaque WebSocket arrive sur l'une ou l'autre. Les
répliques se transmettent les événements de la salle d'échange via PostgreSQL (`LISTEN/NOTIFY`,
canal `creatura_trades`) :
- discussion, tapis, validation et présence arrivent en direct, quel que soit le serveur de chaque
  joueur ;
- après une coupure, la salle est resynchronisée sans recharger la page ;
- aucune brique d'infrastructure supplémentaire n'est nécessaire.

Détails et garanties d'ordre : [backend/README.md](backend/README.md) et `backend/app/realtime.py`.

## API simulée

Les écrans dépendent uniquement des interfaces `PlayerApi` / `AdminApi`
(`packages/shared/src/api/contract.ts`), une méthode par `operationId` du contrat OpenAPI. Deux
implémentations :
- **HTTP** (par défaut) : `packages/shared/src/api/http.ts`, vers `/api/v1` ;
- **simulée** (`VITE_API_MOCK=true`, scripts `*:mock`) : elle applique les mêmes règles métier
  (un booster par jour, doublons seuls échangeables, transfert tout ou rien, 403 pour un joueur
  sur les routes admin) et renvoie les mêmes codes d'erreur que le contrat.

Où vivent les données simulées :
- joueur : `localStorage` du navigateur (`apps/player/src/api/mock/`) ;
- admin : données fictives déterministes sur 120 jours (`apps/admin/src/api/mock.ts`) ;
- réglage du nombre de cartes par booster : transmis entre les deux apps par un cookie
  (`packages/shared/src/api/mock-settings.ts`).

Après une modification du contrat : `pnpm --filter @creatura/shared generate:api`.

## Application Windows (.exe)

```sh
cp apps/desktop/config.example.json apps/desktop/config.json   # domaine du site, déjà rempli
pnpm desktop        # exe branché sur le backend AWS
pnpm desktop:demo   # exe avec l'API simulée, aucun serveur nécessaire
```

Les exe arrivent dans `apps/desktop/release/`, avec un `latest.json`. Une fois publiés dans
`telechargements/` du bucket du front, la page d'accueil propose de télécharger cette version.
L'exe est aussi construit par la CI.
Version, publication, adresse du backend et dépannage : [apps/desktop/README.md](apps/desktop/README.md).

## Application Android (.apk)

Prérequis : Java 21 et le SDK Android (Android Studio).

```sh
cp apps/mobile/config.example.json apps/mobile/config.json     # domaine du site, déjà rempli
pnpm mobile         # APK qui ouvre le site en ligne
pnpm mobile:demo    # APK avec l'API simulée, aucun serveur nécessaire
```

L'APK arrive dans `apps/mobile/release/`, avec un `android.json` lu par la page d'accueil quand
elle est ouverte sur un téléphone. L'APK est aussi construit par la CI.
Signature, CI et dépannage : [apps/mobile/README.md](apps/mobile/README.md).

## Déploiement

La CI vérifie et construit le front, le back, l'exe et l'APK, puis déclenche le déploiement sur
AWS (EKS, RDS PostgreSQL, CloudFront). Les évolutions de schéma (`db/init/NN_evolution_*.sql`) sont
ré-exécutables et appliquées par le Job de schéma à chaque déploiement.
Détails : [docs/ci-cd.md](docs/ci-cd.md).
