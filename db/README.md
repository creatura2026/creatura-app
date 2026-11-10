# CREATURA — Base de données

PostgreSQL 16 · responsable : MDi · schéma détaillé : [docs/schema.md](docs/schema.md)

## Démarrer la base en local

Prérequis : Docker Desktop lancé.

```powershell
cd db
Copy-Item .env.example .env      # (Linux/Mac : cp .env.example .env)
docker compose up -d --build
docker compose ps                # attendre STATUS = healthy
```

Au **premier** démarrage, la base est créée avec le schéma, le catalogue et
(si `CREATURA_DEMO=true`) les données de démo.

| Action | Commande |
|---|---|
| Ouvrir un terminal SQL | `docker compose exec db psql -U creatura -d creatura` |
| Lancer les tests | `docker compose exec db psql -U creatura -d creatura -v ON_ERROR_STOP=1 -f /db/tests/test_schema.sql` puis `test_donnees.sql` (ce dernier nécessite `CREATURA_DEMO=true`) |
| Voir les logs | `docker compose logs db` |
| Arrêter (données conservées) | `docker compose down` |
| **Tout réinitialiser** | `docker compose down -v` puis `docker compose up -d --build` |

⚠️ Les scripts ne s'exécutent que sur un volume vide : après une modification
d'un fichier SQL, il faut **réinitialiser** pour la voir.

## Connexion depuis le back

```
DATABASE_URL=postgres://creatura:creatura@localhost:5432/creatura
```

- **Les fichiers SQL de `db/init/` sont la seule source du schéma.** L'ORM lit la
  base, il ne crée pas les tables (Prisma : `prisma db pull` ; TypeORM :
  `synchronize: false`).
- En production (RDS), même variable, avec SSL obligatoire
  (`?sslmode=require` ou `ssl: true`).

## Comptes de démo (local uniquement)

| Identifiant | Mot de passe | Rôle | Pseudo | id |
|---|---|---|---|---|
| `admin` | `admin` | ADMIN | Admin | `00000000-0000-4000-8000-000000000001` |
| `joueur1` | `joueur1` | JOUEUR | Alice | `00000000-0000-4000-8000-000000000002` |
| `joueur2` | `joueur2` | JOUEUR | Bob | `00000000-0000-4000-8000-000000000003` |

Hash **bcrypt coût 10** (`$2a$10$…`) : `bcrypt.compare(motDePasse, hash)` fonctionne.
Situation de départ : Alice a Moussou ×2 et Flammille ×1, Bob a Brumel ×1 et
Moussou ×1, et un échange `EN_ATTENTE` (Alice offre 1 Moussou contre le Brumel de Bob).

## Valeurs autorisées

| Colonne | Valeurs |
|---|---|
| `utilisateur.role` | `JOUEUR`, `ADMIN` |
| `creature.famille` | `NATURE`, `CRISTAL`, `BRUME`, `LUEUR` |
| `creature.rarete` | `COMMUN`, `PEU_COMMUN`, `RARE` |
| `echange.statut` | `EN_ATTENTE`, `ACCEPTE`, `REFUSE`, `ANNULE` |
| `echange_ligne.sens` | `OFFERT` (donné par le proposeur), `DEMANDE` (donné par le destinataire) |

Longueurs max : `pseudo` 30, `identifiant` 50, `creature.nom` 50.

## Traduire les erreurs PostgreSQL en réponses d'API

Une erreur PostgreSQL contient un **code** (`err.code`) et le **nom de la
contrainte** (`err.constraint`). Toutes les contraintes sont nommées :

| Code | Contrainte | Situation | Réponse proposée |
|---|---|---|---|
| `23505` | `uq_utilisateur_pseudo` | Pseudo déjà pris (sans tenir compte des majuscules) | 409 |
| `23505` | `uq_utilisateur_identifiant` | Identifiant déjà utilisé | 409 |
| `23514` | `ck_collection_quantite` | Plus assez d'exemplaires (échange) | 409 |
| `23514` | `ck_creature_stock_restant` | Stock épuisé (booster) | 409 |
| `23514` | `ck_echange_participants` | Échange avec soi-même | 400 |
| `23514` | `ck_utilisateur_pseudo`, `ck_utilisateur_identifiant` | Champ vide | 400 |
| `23514` | autres `ck_…` | Valeur hors liste (statut, sens…) : bug côté back | 500 |
| `23503` | `fk_echange_destinataire`, `fk_collection_utilisateur` | Joueur inexistant | 404 |
| `23503` | `fk_…_creature` | Créature inexistante | 404 |
| `23505` | `pk_echange_ligne` | Même créature deux fois du même côté | 400 |

## Ce que la base garantit / ce que le back doit vérifier

| La base garantit | Le back vérifie |
|---|---|
| Unicité du pseudo et de l'identifiant | Format des champs, robustesse du mot de passe |
| Quantités et stocks jamais négatifs | Au moins une carte de chaque côté d'un échange |
| Pas d'échange avec soi-même | Possession des cartes offertes à la proposition |
| Cohérence statut / date de décision | Seul le destinataire accepte/refuse, seul le proposeur annule |
| | Accès admin réservé au rôle `ADMIN` |

## Structure

```
db/
├── Dockerfile             image PostgreSQL 16 + scripts
├── docker-compose.yml     base locale
├── .env.example           variables (copier en .env)
├── init/                  scripts SQL, appliqués dans l'ordre
│   ├── 01_schema.sql      tables et contraintes
│   ├── 02_catalogue.sql   créatures (partout)
│   └── 03_demo_dev.sql    comptes de démo (LOCAL UNIQUEMENT)
├── initdb/10_creatura.sh  lancé au 1er démarrage du conteneur
├── scripts/appliquer.sh   applique init/ sur n'importe quelle base (local ou RDS)
├── tests/                 tests SQL
└── docs/                  schéma et dictionnaire de données
```

## Faire évoluer le schéma

Un fichier SQL déjà fusionné dans `develop` **ne se modifie plus**. Toute
évolution passe par un nouveau fichier numéroté (`04_…sql`), ajouté à
`scripts/appliquer.sh`, avec ses tests.
