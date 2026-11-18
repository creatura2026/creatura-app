# CREATURA

Monorepo de l'application Créatura : le front (pnpm), l'API et la base.

| Dossier | Rôle |
|---|---|
| `apps/player` | PWA joueur, mobile d'abord (UC-01 à UC-11) |
| `apps/admin` | Dashboard administrateur Web / Desktop (UC-12 à UC-14) |
| `apps/desktop` | Application Windows (.exe) : la PWA joueur dans Electron |
| `apps/mobile` | Application Android (.apk) : la PWA joueur dans Capacitor |
| `packages/shared` | Thème (couleurs et typographies du document de vision), composants, client HTTP, types générés depuis `creatura-api.openapi.yaml`, catalogue fictif |
| `e2e` | Tests de bout en bout (Playwright) du site et du dashboard |
| `backend` | API REST (Python, FastAPI, SQLAlchemy) : [backend/README.md](backend/README.md) |
| `db` | Base PostgreSQL 16 : schéma, catalogue, données de démo, tests SQL : [db/README.md](db/README.md) |
| `docs` | [CI/CD](docs/ci-cd.md), [plan de tests](docs/tests/README.md) |

## Démarrer

### Avec le vrai serveur

```sh
cd db && docker compose up -d                    # 1. la base (voir db/README.md)
cd ../backend && docker compose up -d --build    # 2. l'API sur http://localhost:8000
cd .. && pnpm install
pnpm dev:player   # http://localhost:5173
pnpm dev:admin    # http://localhost:5173 (ou le port suivant)
```

Le serveur Vite relaie `/api` (WebSocket de la salle d'échange compris) vers
`http://localhost:8000`. Autre adresse : variable `API_PROXY_TARGET`.

### Sans serveur (API simulée)

```sh
pnpm install
pnpm dev:player:mock
pnpm dev:admin:mock
```

### Build

```sh
pnpm build        # vérification des types + build des deux apps
```

## Tests

| Partie | Commande |
|---|---|
| Front, unitaires | `pnpm test:unit` (ou `pnpm --filter player test:unit` en mode surveillance) |
| Bout en bout (Playwright, dossier `e2e/`) | `pnpm --filter e2e test:mock` (Chromium) ou `pnpm test:e2e` (tous les navigateurs et le mobile) ; la première fois : `pnpm --filter e2e exec playwright install chromium firefox webkit` |
| Bout en bout sur la stack réelle (Docker) | `pnpm --filter e2e test:stack` : démarre base et API en Docker, puis teste le vrai WebSocket entre deux navigateurs |
| API | `cd backend && uv run pytest` (voir [backend/README.md](backend/README.md)) |
| Base | scripts de `db/tests/` (voir [db/README.md](db/README.md)) |

Stratégie, types de tests, outils, scénarios et ce que lance la CI :
[docs/tests/README.md](docs/tests/README.md).

## Application Windows (.exe)

```sh
cp apps/desktop/config.example.json apps/desktop/config.json   # domaine du site, déjà rempli
pnpm desktop        # exe branché sur le backend AWS
pnpm desktop:demo   # exe avec l'API simulée, aucun serveur nécessaire
```

Les exe arrivent dans `apps/desktop/release/`, avec un `latest.json` : une fois publiés dans
`telechargements/` du bucket du front, la page d'accueil propose de télécharger cette version.
Version, publication, adresse du backend et dépannage : [apps/desktop/README.md](apps/desktop/README.md).

## Application Android (.apk)

Prérequis : Java 21 et le SDK Android (Android Studio).

```sh
cp apps/mobile/config.example.json apps/mobile/config.json     # domaine du site, déjà rempli
pnpm mobile         # APK qui ouvre le site en ligne
pnpm mobile:demo    # APK avec l'API simulée, aucun serveur nécessaire
```

L'APK arrive dans `apps/mobile/release/`, avec un `android.json` lu par la page d'accueil, ouverte
sur un téléphone. Signature, CI et dépannage : [apps/mobile/README.md](apps/mobile/README.md).

## API : vraie ou simulée

Les écrans dépendent uniquement des interfaces `PlayerApi` / `AdminApi`
(`packages/shared/src/api/contract.ts`), une méthode par `operationId` du contrat OpenAPI. Deux
implémentations, choisies dans `apps/*/src/api/index.ts` :

- **HTTP** (par défaut) : `packages/shared/src/api/http.ts`, qui appelle `/api/v1` et ouvre le
  WebSocket de la salle d'échange.
- **Simulée** (`VITE_API_MOCK=true`, fichier `.env.mock`, scripts `dev:mock` et `*:demo`) : elle
  applique les mêmes règles métier que le serveur (un booster par jour, toute carte possédée
  échangeable ou donnable, dernier exemplaire compris, transfert tout ou rien, 403 pour un joueur
  sur les routes admin) et renvoie les mêmes codes d'erreur que le contrat.

Détails du mode simulé :

- Joueur : données persistées dans le `localStorage` du navigateur (`apps/player/src/api/mock/`).
  La salle d'échange est simulée dans l'onglet, avec un partenaire simulé.
- Admin : données fictives déterministes sur 120 jours (`apps/admin/src/api/mock.ts`).
- Nombre de cartes par booster : réglé dans le dashboard (« Réglages booster »). Sans serveur, les deux
  apps ne partagent pas de stockage : la simulation transmet ce réglage par un cookie
  (`packages/shared/src/api/mock-settings.ts`), partagé entre les ports de `localhost`.

Après une modification du contrat : `pnpm --filter @creatura/shared generate:api`.

### Comptes de démonstration

Avec le vrai serveur (base locale lancée avec `CREATURA_DEMO=true`) :

| Application | Identifiant | Mot de passe | Remarque |
|---|---|---|---|
| Joueur | `joueur1` | `joueur1` | Pseudo Alice |
| Joueur | `joueur2` | `joueur2` | Pseudo Bob |
| Admin | `admin` | `admin` | |

Avec l'API simulée :

| Application | Identifiant | Mot de passe | Remarque |
|---|---|---|---|
| Joueur | `demo` | `creatura-demo` | Aussi `lina`, `noe`, `mina`, `linette` (même mot de passe) |
| Admin | `admin` | `creatura-admin` | |
| Admin | `admin2` | `creatura-admin2` | Second admin, pour valider une suppression de joueur |
| Admin | `demo` | `creatura-demo` | Montre le refus d'accès (403) |

En mode simulé, des boutons sur les pages de connexion remplissent ces identifiants. Dans le profil
joueur, « Mode démonstration » permet de rendre le booster du jour à nouveau disponible ou de
réinitialiser les données.
