# CREATURA — applications front-end

Monorepo pnpm contenant :

| Dossier | Rôle |
|---|---|
| `apps/player` | PWA joueur, mobile d'abord (UC-01 à UC-11) |
| `apps/admin` | Dashboard administrateur Web / Desktop (UC-12 à UC-14) |
| `apps/desktop` | Application Windows (.exe) : la PWA joueur dans Electron |
| `packages/shared` | Thème (couleurs et typographies du document de vision), composants, types générés depuis `creatura-api.openapi.yaml`, catalogue fictif |

## Démarrer

```sh
pnpm install
pnpm dev:player   # http://localhost:5173
pnpm dev:admin    # http://localhost:5173 (ou le port suivant)
pnpm build        # vérification des types + build des deux apps
```

Tests unitaires : `pnpm --filter player test:unit` et `pnpm --filter admin test:unit`.

## Application Windows (.exe)

```sh
cp apps/desktop/config.example.json apps/desktop/config.json   # y mettre le domaine CloudFront
pnpm desktop        # exe branché sur le backend AWS
pnpm desktop:demo   # exe avec l'API simulée, aucun serveur nécessaire
```

Les exe arrivent dans `apps/desktop/release/`. Adresse du backend, fonctionnement et dépannage :
[apps/desktop/README.md](apps/desktop/README.md).

## API simulée (pas encore de back)

Les écrans dépendent uniquement des interfaces `PlayerApi` / `AdminApi`
(`packages/shared/src/api/contract.ts`), une méthode par `operationId` du contrat OpenAPI.
En attendant le serveur, une implémentation **simulée** applique les règles métier
(un booster par jour, doublons seuls échangeables, transfert tout-ou-rien, 403 pour un joueur
sur les routes admin) et renvoie les mêmes codes d'erreur que le contrat.

- Joueur : données persistées dans le `localStorage` du navigateur (`apps/player/src/api/mock/`).
- Admin : données fictives déterministes sur 120 jours (`apps/admin/src/api/mock.ts`).
- Nombre de cartes par booster : réglé dans le dashboard (« Réglages booster »). Sans serveur, les deux
  apps ne partagent pas de stockage : la simulation transmet ce réglage par un cookie
  (`packages/shared/src/api/mock-settings.ts`), partagé entre les ports de `localhost`.

Pour brancher le vrai serveur : remplacer `createMockPlayerApi` / `createMockAdminApi` dans
`apps/*/src/api/index.ts` par une implémentation HTTP (openapi-fetch + `schema.d.ts`), puis passer
`USE_MOCK_API` à `false` (masque les outils de démonstration). Après une modification du contrat :
`pnpm --filter @creatura/shared generate:api`.

### Comptes de démonstration

| Application | Identifiant | Mot de passe | Remarque |
|---|---|---|---|
| Joueur | `demo` | `creatura-demo` | Aussi `lina`, `noe`, `mina`, `linette` (même mot de passe) |
| Admin | `admin` | `creatura-admin` | `demo` / `creatura-demo` montre le refus d'accès (403) |

Des boutons sur les pages de connexion remplissent ces identifiants. Dans le profil joueur,
« Mode démonstration » permet de rendre le booster du jour à nouveau disponible ou de réinitialiser les données.
