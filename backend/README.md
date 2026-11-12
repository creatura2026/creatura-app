# CREATURA — Backend

API REST en **Python / FastAPI**, ORM **SQLAlchemy 2**, base **PostgreSQL 16**.

La base est gérée dans [`../db/`](../db/README.md) : ses scripts SQL (`db/init/`) sont la seule
source du schéma. Le back le lit (modèles ORM calqués dessus) mais ne crée ni ne modifie
aucune table.

## Démarrer

```bash
cd db && docker compose up -d            # 1. la base (voir db/README.md)
cd ../backend && docker compose up -d --build   # 2. l'API
```

- API : http://localhost:8000/api/v1 — Swagger : http://localhost:8000/docs
- Comptes de démo (base locale avec `CREATURA_DEMO=true`) : `admin`/`admin`,
  `joueur1`/`joueur1` (Alice), `joueur2`/`joueur2` (Bob).

L'API rejoint le réseau Docker de la base (`creatura-db_default`) : la base doit être lancée
en premier.

Le front (`apps/player`, `apps/admin`) appelle `/api/v1` sur sa propre adresse : en local,
le serveur Vite relaie `/api` vers `http://localhost:8000` (autre adresse : `API_PROXY_TARGET`).

```bash
pnpm dev:player      # http://localhost:5173, branché sur ce back
pnpm dev:admin       # dashboard
pnpm dev:player:mock # sans back : API simulée dans le navigateur
```

**Base déjà créée avant l'évolution `04`** (réglages, échanges échoués) : l'appliquer une fois,
sans perdre les données :

```bash
docker exec -i creatura-db psql -U creatura -d creatura < ../db/init/04_evolution_reglage_echec.sql
```

Pour développer avec rechargement automatique (base toujours dans Docker) :

```bash
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload
```

`DATABASE_URL` suit le format de l'équipe (`postgres://creatura:creatura@localhost:5432/creatura`) ;
le back le convertit pour SQLAlchemy. En production (RDS) : ajouter `?sslmode=require`.

## Tests

```bash
uv run pytest        # la base de db/ doit tourner
```

Les tests utilisent une base séparée, `creatura_test`, créée automatiquement sur le même
serveur (la base `creatura` et ses données de démo ne sont pas touchées). Avant chaque test,
elle est recréée avec les scripts de `db/init/` **sans** les données de démo, comme en
production. Autre serveur : variable `TEST_DATABASE_URL`.

Ils vérifient les règles du schéma et les preuves qualité :
- persistance de la collection après reconnexion ;
- refus de l'accès admin à un joueur ;
- un seul booster par jour, même avec des requêtes simultanées ;
- échanges concurrents qui ne consomment jamais le même exemplaire (vraies transactions parallèles) ;
- `stock_total = stock_restant + Σ quantités en collection`, aucune quantité négative ;
- un échange accepté modifie les deux collections, ou aucune ; sinon il passe en `FAILED` ;
- format du contrat : champs en camelCase, codes d'erreur, pagination, validation en 400 ;
- connexion avec un hash pgcrypto `$2a$10$` (comptes de démo) et traduction des contraintes.

## Docker / Kubernetes

L'image tourne en utilisateur non root (uid 10001), sur le port **8000**, avec un seul
processus uvicorn : on monte en charge avec les replicas. Toute la configuration passe
par des variables d'environnement (le `.env` n'est pas copié dans l'image).

À prévoir dans les manifestes K8S :

- **Secret** : `DATABASE_URL` (avec `?sslmode=require` pour RDS), `JWT_SECRET` (identique
  sur tous les pods, sinon un jeton émis par un pod est refusé par un autre), `ADMIN_PASSWORD`.
- **Schéma** : appliqué par l'image de `db/` (`/db/scripts/appliquer.sh`, Job EKS). L'API ne
  le fait pas.
- **Compte admin** : sans données de démo, l'API le crée au démarrage à partir de
  `ADMIN_LOGIN` / `ADMIN_PASSWORD` s'il n'existe pas (sans risque avec plusieurs replicas).
- **Probes** : `readinessProbe` et `livenessProbe` en HTTP GET sur `/api/v1/health`, port 8000.
  Le health check interroge la base : un pod sans base est retiré du Service.

## Organisation

```
backend/
  app/
    main.py          création de l'app, CORS, traduction des erreurs en HTTP
    config.py        variables d'environnement (.env)
    database.py      moteur SQLAlchemy, session
    models.py        modèles ORM, calqués sur db/init/01_schema.sql
    security.py      bcrypt + JWT (accès / rafraîchissement)
    dependencies.py  utilisateur connecté, rôle admin
    errors.py        erreurs métier (codes du contrat) + traduction des contraintes PostgreSQL
    validation.py    erreurs de validation → VALIDATION_ERROR, messages en français
    seed.py          création du compte admin
    views/           routes FastAPI : lecture de la requête, appel du contrôleur, réponse
    controllers/     logique métier, indépendante de HTTP
    schemas/         formats d'entrée / sortie de l'API (Pydantic, JSON en camelCase)
  tests/
```

Une vue ne contient pas de logique : elle appelle un contrôleur et met en forme la réponse.
Un contrôleur ne connaît pas HTTP : il lève une erreur métier (`Conflict`, `NotFound`…)
portant un code du contrat, que `main.py` renvoie au format Problem Details.

**Langue** : la base et les modèles ORM sont en français (`utilisateur.identifiant`,
`creature.stock_restant`, statut `EN_ATTENTE`…). L'API suit le contrat
[`creatura-api.openapi.yaml`](../creatura-api.openapi.yaml), écrit pour le front : routes,
clés JSON (camelCase) et valeurs en anglais. Les schémas Pydantic font la traduction :

| Base | API |
|---|---|
| `JOUEUR`, `ADMIN` | `PLAYER`, `ADMIN` |
| `COMMUN`, `PEU_COMMUN`, `RARE` | `COMMON`, `UNCOMMON`, `RARE` |
| `EN_ATTENTE`, `ACCEPTE`, `REFUSE`, `ANNULE`, `ECHOUE` | `PENDING`, `ACCEPTED`, `REFUSED`, `CANCELLED`, `FAILED` |
| `creature.id` (entier) | `"id": "3"` (texte) |
| `creature.image` (`sprites/moss_puff.png`) | `imageUrl` = `IMAGE_BASE_URL` (CDN CloudFront) + `/` + clé |

Les familles (`NATURE`, `CRISTAL`, `BRUME`, `LUEUR`) ont le même code des deux côtés.

## Routes (`/api/v1`)

Le détail (paramètres, réponses, exemples) est dans le contrat
[`creatura-api.openapi.yaml`](../creatura-api.openapi.yaml) ; Swagger (http://localhost:8000/docs)
montre ce que le back implémente. Toutes les routes exigent `Authorization: Bearer <accessToken>`,
sauf indication contraire.

| Domaine    | Route                                                                     | UC           |
|------------|---------------------------------------------------------------------------|--------------|
| Comptes    | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` (sans jeton) | UC-01, UC-02 |
|            | `POST /auth/logout` · `GET /me` (profil, progression, booster disponible)  | UC-02        |
| Catalogue  | `GET /creatures?search=&family=NATURE&rarity=RARE&page=&pageSize=` · `GET /creatures/{creatureId}` | UC-05 |
|            | `GET /families` · `GET /rarities` (avec `dropRate`, de 0 à 1)              | Filtres      |
| Booster    | `GET /me/boosters/today` · `POST /me/boosters`                            | UC-03, UC-04 |
| Collection | `GET /me/collection?ownership=all\|owned\|missing&duplicatesOnly=&search=&family=&rarity=` | UC-06, UC-07 |
| Joueurs    | `GET /players?search=` (début du pseudo) · `GET /players/{playerId}/tradeable-cards` | UC-08 |
| Échanges   | `POST /trades` · `POST /trades/{tradeId}/cancel`                           | UC-09        |
|            | `POST /trades/{tradeId}/accept` · `POST /trades/{tradeId}/refuse`          | UC-10        |
|            | `GET /trades?role=all\|sent\|received&status=PENDING` · `GET /trades/{tradeId}` | UC-11  |
| Admin      | `GET /admin/stats?from=&to=` · `GET /admin/trades?from=&to=&status=&playerId=` | UC-12, UC-13 |
|            | `GET /admin/rarity-distribution?from=&to=`                                | UC-14        |
|            | `GET /admin/settings/booster` · `PUT /admin/settings/booster`             | Réglages     |
| Santé      | `GET /health` (sans jeton, pour l'ALB)                                    | —            |

**Listes** : paginées (`page` à partir de 1, `pageSize` de 1 à 100, 20 par défaut). Réponse :
`items`, `page`, `pageSize`, `totalItems`, `totalPages`.

Proposer un échange (n cartes ↔ n cartes, au moins une de chaque côté) :

```json
POST /api/v1/trades
{
  "recipientId": "00000000-0000-4000-8000-000000000003",
  "offered":   [{"creatureId": "1", "quantity": 2}],
  "requested": [{"creatureId": "9", "quantity": 1}]
}
```

**Erreurs** : format Problem Details (`application/problem+json`) avec un `code` stable :

```json
{"type": "https://app.creatura.fr/problems/booster-already-claimed", "title": "Booster déjà réclamé",
 "status": 409, "code": "BOOSTER_ALREADY_CLAIMED", "detail": "Le booster du jour a déjà été ouvert. …"}
```

| Code | HTTP | Cas |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Corps ou paramètres invalides ; `errors` liste les champs (`[{field, message}]`) |
| `INVALID_CREDENTIALS` / `UNAUTHENTICATED` | 401 | Mauvais identifiants / jeton absent, invalide ou expiré |
| `FORBIDDEN` | 403 | Rôle insuffisant, ou échange d'un autre joueur |
| `NOT_FOUND` | 404 | Créature, joueur, échange ou route inconnus |
| `LOGIN_ALREADY_USED` / `PSEUDO_ALREADY_USED` | 409 | Inscription |
| `BOOSTER_ALREADY_CLAIMED` | 409 | Booster du jour déjà ouvert |
| `TRADE_NOT_PENDING` | 409 | Échange déjà accepté, refusé, annulé ou échoué |
| `CARDS_UNAVAILABLE` | 409 | Carte plus disponible à l'acceptation (l'échange passe en `FAILED`), ou stock épuisé |
| `CARDS_NOT_OWNED` / `TRADE_WITH_SELF` | 422 | Proposition d'échange |
| `INTERNAL_ERROR` | 500 | Erreur inattendue |

Si une contrainte de la base refuse malgré tout une écriture, son nom est traduit selon le
tableau de `db/README.md` (`uq_utilisateur_pseudo` → `PSEUDO_ALREADY_USED`, `fk_…` → 404, etc.).

## Règles métier

- **Booster** : un par compte et par jour. Un `UPDATE` conditionnel sur
  `utilisateur.dernier_booster` réserve le booster (le jour est calculé par Postgres à l'heure
  de Paris) : une requête simultanée attend puis échoue. Le nombre de cartes vient de la table
  `reglage` (5 par défaut, modifiable par l'admin). Tirage selon `creature.poids` parmi les
  créatures encore en stock ; chaque carte décrémente `stock_restant`. Si le stock ne suffit
  plus, le booster est partiel ; si tout est épuisé, il est annulé et le joueur ne le perd pas.
  `isNew` signale une créature que le joueur ne possédait pas encore.
- **Échange** : les cartes doivent être possédées en quantité suffisante à la proposition,
  puis sont revérifiées à l'acceptation. Le transfert se fait dans une seule transaction avec
  des décréments conditionnels (`quantite >= q`) : ni perte ni duplication, même en
  concurrence. Si une carte n'est plus disponible : 409 `CARDS_UNAVAILABLE`, aucun transfert,
  et l'échange passe en `FAILED` (`failureReason: CARDS_UNAVAILABLE`). Les échanges ne touchent
  pas au stock.
- **Cartes échangeables** (`/players/{playerId}/tradeable-cards`) : les doublons seulement, un
  exemplaire reste toujours au joueur (règle du contrat, à valider au point client).

## Écarts et points ouverts

Le contrat décrit aussi ce que la base ne permet pas encore (section « Écarts connus de la V1 »
de `creatura-api.openapi.yaml`) :

- **Pas de table booster** : `GET /me/boosters/today` renvoie toujours `booster: null` (après
  un rechargement, le front affiche « Booster du jour déjà ouvert » sans les cartes).
  `boostersOpenedPerDay` (`/admin/stats`) ne compte que le dernier booster de chaque joueur :
  c'est un minimum, exact pour aujourd'hui. `/admin/rarity-distribution` compte les cartes
  sorties du stock depuis le lancement, quelle que soit la période.
- **Pas de table de sessions** : `POST /auth/logout` répond 204 et le client oublie ses jetons,
  mais ils restent valides jusqu'à expiration (15 min pour l'accès, 7 jours pour le
  rafraîchissement) ; `POST /auth/refresh` ne fait pas de rotation.
- **Pas de limitation des tentatives** (`RATE_LIMITED`, 429) sur la connexion.
- À valider au point client : rareté garantie (non implémentée), règle des cartes échangeables.
