# CREATURA — applications front-end

Monorepo pnpm contenant :

| Dossier | Rôle |
|---|---|
| `apps/player` | PWA joueur, mobile d'abord (UC-01 à UC-11) |
| `apps/admin` | Dashboard administrateur Web / Desktop (UC-12 à UC-14) |
| `packages/shared` | Thème (couleurs et typographies du document de vision), composants, types générés depuis `creatura-api.openapi.yaml`, catalogue fictif |

## Démarrer

```sh
pnpm install
pnpm dev:player   # http://localhost:5173
pnpm dev:admin    # http://localhost:5173 (ou le port suivant)
pnpm build        # vérification des types + build des deux apps
```

Tests unitaires : `pnpm --filter player test:unit` et `pnpm --filter admin test:unit`.

## API simulée (pas encore de back)

Les écrans dépendent uniquement des interfaces `PlayerApi` / `AdminApi`
(`packages/shared/src/api/contract.ts`), une méthode par `operationId` du contrat OpenAPI.
En attendant le serveur, une implémentation **simulée** applique les règles métier
(un booster par jour, doublons seuls échangeables, transfert tout-ou-rien, 403 pour un joueur
sur les routes admin) et renvoie les mêmes codes d'erreur que le contrat.

- Joueur : données persistées dans le `localStorage` du navigateur (`apps/player/src/api/mock/`).
- Admin : données fictives déterministes sur 120 jours (`apps/admin/src/api/mock.ts`).

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
