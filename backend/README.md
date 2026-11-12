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
- un échange accepté modifie les deux collections, ou aucune ;
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
    errors.py        erreurs métier + traduction des contraintes PostgreSQL
    seed.py          création du compte admin
    views/           routes FastAPI : lecture de la requête, appel du contrôleur, réponse
    controllers/     logique métier, indépendante de HTTP
    schemas/         formats d'entrée / sortie de l'API (Pydantic)
  tests/
```

Une vue ne contient pas de logique : elle appelle un contrôleur et met en forme la réponse.
Un contrôleur ne connaît pas HTTP : il lève une erreur métier (`Conflict`, `NotFound`…)
que `main.py` convertit en code HTTP.

**Langue** : la base et les modèles ORM sont en français (`utilisateur.identifiant`,
`creature.stock_restant`…). Les routes et les clés JSON de l'API restent en anglais, comme
le contrat d'API ; les valeurs reprennent les codes de la base (`NATURE`, `PEU_COMMUN`,
`EN_ATTENTE`, `JOUEUR`…).

## Routes (`/api/v1`)

Toutes exigent `Authorization: Bearer <access_token>`, sauf indication contraire.
Les identifiants de joueurs et d'échanges sont des UUID ; ceux des créatures, des entiers.

| Domaine    | Route                                                                     | UC           |
|------------|---------------------------------------------------------------------------|--------------|
| Comptes    | `POST /auth/register` · `POST /auth/login` (sans jeton)                    | UC-01, UC-02 |
|            | `POST /auth/refresh` (sans jeton) · `POST /auth/logout` · `GET /me`        | UC-02        |
| Catalogue  | `GET /creatures?search=&family=NATURE&rarity=RARE` · `GET /creatures/{id}` | UC-05        |
|            | `GET /families` · `GET /rarities` (avec `drop_rate_percent`)               | Filtres      |
| Booster    | `GET /me/boosters/today` · `POST /me/boosters`                            | UC-03, UC-04 |
| Collection | `GET /me/collection?status=all\|owned\|missing\|duplicates&search=&family=&rarity=` | UC-06, UC-07 |
| Joueurs    | `GET /players?search=` · `GET /players/{id}/tradeable-cards`               | UC-08        |
| Échanges   | `POST /trades` · `POST /trades/{id}/cancel`                                | UC-09        |
|            | `POST /trades/{id}/accept` · `POST /trades/{id}/refuse`                    | UC-10        |
|            | `GET /trades?status=EN_ATTENTE&role=all\|sent\|received` · `GET /trades/{id}` | UC-11     |
| Admin      | `GET /admin/stats?from=&to=` · `GET /admin/trades?from=&to=&status=&player_id=` | UC-12, UC-13 |
|            | `GET /admin/rarity-distribution`                                          | UC-14        |
| Santé      | `GET /health` (sans jeton, pour l'ALB)                                    | —            |

Proposer un échange (n cartes ↔ n cartes, au moins une de chaque côté) :

```json
POST /api/v1/trades
{
  "recipient_id": "00000000-0000-4000-8000-000000000003",
  "offered":   [{"creature_id": 1, "quantity": 2}],
  "requested": [{"creature_id": 9, "quantity": 1}]
}
```

Erreurs : `{"detail": "message"}` avec 400 (requête invalide), 401 (non connecté),
403 (rôle insuffisant), 404 (introuvable), 409 (conflit métier : booster déjà réclamé,
stock épuisé, carte plus disponible, échange déjà traité…), 422 (format invalide).
Si une contrainte de la base refuse malgré tout une écriture, son nom est traduit selon le
tableau de `db/README.md` (`uq_utilisateur_pseudo` → 409, `fk_…` → 404, etc.).

## Règles métier

- **Booster** : un par compte et par jour. Un `UPDATE` conditionnel sur
  `utilisateur.dernier_booster` réserve le booster (le jour est calculé par Postgres à l'heure
  de Paris) : une requête simultanée attend puis échoue. Tirage selon `creature.poids` parmi les
  créatures encore en stock ; chaque carte décrémente `stock_restant`. Si le stock ne suffit
  plus, le booster est partiel ; si tout est épuisé, il est annulé et le joueur ne le perd pas.
- **Échange** : les cartes doivent être possédées en quantité suffisante à la proposition,
  puis sont revérifiées à l'acceptation. Le transfert se fait dans une seule transaction avec
  des décréments conditionnels (`quantite >= q`) : ni perte ni duplication, même en
  concurrence. Si une carte n'est plus disponible : 409, aucun transfert, l'échange reste en
  attente. Les échanges ne touchent pas au stock.

## Écarts et points ouverts

- **Déconnexion** : le schéma n'a pas de quoi révoquer un jeton côté serveur. `POST /auth/logout`
  répond 204 et le client supprime ses jetons, mais ils restent valides jusqu'à expiration
  (30 min pour l'accès, 7 jours pour le rafraîchissement). Piste : un fichier
  `db/init/04_….sql` ajoutant `utilisateur.jetons_valides_apres timestamptz`.
- **Stats boosters** (UC-12, UC-14) : partielles, faute de table booster. `boosters_today`
  compte les joueurs dont `dernier_booster` est aujourd'hui ; la répartition des raretés
  est calculée à partir des stocks, sans période.
- À valider au point client : nombre de cartes par booster (`BOOSTER_SIZE`, 5), rareté
  garantie (non implémentée).
