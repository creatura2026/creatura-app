# CREATURA — CI et images Docker

Workflow : [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (GitHub Actions).

```
            ┌─ db        : image db + tests SQL + appliquer.sh ré-exécutable
detect ─────┼─ backend   : pytest sur PostgreSQL 16 (rapport JUnit)
            └─ frontend  : types + build + tests unitaires (si le front est présent)
                    │
                    ▼   seulement si tout est vert
            images  : backend, db, player, admin → ghcr.io/creatura2026/…
                    │
                    ▼
            Argo CD (repo infra) déploie sur EKS
```

Une étape qui échoue bloque la publication : aucune image n'est publiée si un test échoue.

## Quand la CI publie

| Événement | Tests | Images |
|---|---|---|
| Pull request | oui | construites (Dockerfile vérifié), **non publiées** |
| Push sur `develop` ou `main` | oui | publiées |
| Tag `v1.2.3` | oui | publiées avec les tags de version |
| Lancement manuel (`workflow_dispatch`) | oui | publiées |

## Images

| Image | Source | Port | Sonde | Rôle dans K8S |
|---|---|---|---|---|
| `ghcr.io/creatura2026/creatura-backend` | `backend/Dockerfile` | 8000 | `GET /api/v1/health` | Deployment de l'API |
| `ghcr.io/creatura2026/creatura-player` | `docker/frontend/Dockerfile` (`APP=player`) | 8080 | `GET /healthz` | Deployment de la PWA joueur |
| `ghcr.io/creatura2026/creatura-admin` | `docker/frontend/Dockerfile` (`APP=admin`) | 8080 | `GET /healthz` | Deployment du dashboard |
| `ghcr.io/creatura2026/creatura-db` | `db/Dockerfile` | — | — | **Job** qui applique le schéma sur RDS |

Toutes tournent en utilisateur non root (back : uid 10001, front : uid 101).

## Tags (pour Argo CD)

| Tag | Exemple | Usage |
|---|---|---|
| `sha-<commit>` | `sha-4b1404f` | **Immuable.** À référencer dans les manifestes : chaque déploiement correspond à un commit précis. |
| `<branche>` | `develop`, `main` | Suit la dernière version de la branche (environnement de dev). |
| `<version>` | `1.2.3`, `1.2` | Créé par un tag git `v1.2.3` (production). |

Deux façons de faire suivre les nouvelles images à Argo CD :

1. **Argo CD Image Updater** (rien à ajouter dans la CI) : il surveille GHCR et met à jour
   l'Application. Par exemple, stratégie `digest` sur le tag `develop` pour l'environnement de dev,
   stratégie `semver` (`~1`) pour la production.
2. **Commit dans le repo infra** : une étape de CI remplace le tag `sha-…` dans les manifestes.
   Il faut alors un jeton avec droit d'écriture sur le repo infra (non fait pour l'instant).

## Ce que les manifestes K8S doivent prévoir

**Accès aux images.** Si les packages GHCR sont privés (cas d'un repo privé), le cluster a besoin
d'un `imagePullSecret` (jeton GitHub avec `read:packages`). Sinon, rendre les 4 packages publics
dans les réglages de l'organisation : les images ne contiennent aucun secret.

**Back** (`creatura-backend`)
- Secret : `DATABASE_URL=postgres://…@<endpoint-rds>:5432/creatura?sslmode=require`,
  `JWT_SECRET` (identique sur tous les pods), `ADMIN_LOGIN` / `ADMIN_PASSWORD`.
- Variables : `CORS_ORIGINS` (domaines du front), `TIMEZONE=Europe/Paris`.
- Sondes HTTP sur `/api/v1/health` (interroge la base), port 8000.

**Schéma de la base** (`creatura-db`), en Job, de préférence en hook Argo CD `PreSync` :
- Commande : `/db/scripts/appliquer.sh` (ré-exécutable : ne recrée pas ce qui existe).
- Variables : `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE=require`,
  `CREATURA_DEMO=false` (**jamais** `true` en production : mots de passe de démo publics).

**Front** (`creatura-player`, `creatura-admin`)
- Fichiers statiques servis par nginx sur le port 8080, routes de l'application renvoyées vers
  `index.html`, fichiers `/assets/*` en cache un an.
- Le front appelle l'API sur la même origine (`/api/v1`) : l'Ingress (ALB) route `/api/*` vers le
  Service du back, le reste vers le front.
- Avec `readOnlyRootFilesystem`, monter un `emptyDir` sur `/tmp` (fichiers temporaires de nginx).

## Rapports et livrables

Chaque exécution conserve en artefacts GitHub :
- `tests-backend` : résultats des tests du back (JUnit XML) ;
- `frontend-dist` : les deux applications construites.

Le résumé de l'exécution liste, pour chaque image, ses tags et son digest.

## Lancer les mêmes vérifications en local

```bash
# Base
docker build -t creatura-db:ci db
# Back (base de db/ démarrée)
cd backend && uv run pytest
# Front
pnpm install --frozen-lockfile && pnpm -r run build && pnpm -r run test:unit
# Images front
docker build -f docker/frontend/Dockerfile --build-arg APP=player -t creatura-player .
```

## Pas encore fait

- Paquet Desktop du dashboard (demandé par le cahier des charges) : à ajouter quand la coquille
  Desktop existera.
- Tests e2e Playwright du front : non lancés en CI (navigateurs à installer).
- Analyse de vulnérabilités des images (ex. Trivy).
- Passage à Amazon ECR : remplacer l'étape de connexion GHCR par
  `aws-actions/configure-aws-credentials` + `aws-actions/amazon-ecr-login`, créer les dépôts ECR
  dans le Terraform de l'infra.
